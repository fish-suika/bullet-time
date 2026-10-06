// ===== 連鎖のルール。物理の衝突・音・時刻 → 物や敵の動き → 結果。three.js は使わない =====
// 結果は台本ではなく、剛体の衝突・敵の弾（レイキャスト）・単純な状態機械で決まる。展開は少なく、山場を 1 つ。
//  ① 敵 A      ：A が倒れながら引き金を引く → 弾がガスボンベに命中 → 大爆発（主人公も吹き飛ぶ）… GAME OVER
//  ② 消火器    ：ロケットのように飛ぶ → A の顔面に直撃 → A が吹っ飛んで B を巻き込む … CLEAR
//  ③ アヒル    ：ピーッと鳴く → A と B が驚いて撃ち合う → 2 人とも倒れる … CLEAR
//  ④ ガスボンベ：爆発せず、ロケットになって跳ね回る → 主人公に直撃 … GAME OVER
// 爆発のルール：ガスボンベが爆発するのは A の暴発の弾（kind 'discharge'）が当たったときだけ。プレイヤーの弾は栓を飛ばすだけ（④）。
function newSim(stage, rng) {
  const S = { stage, rng: rng || Math.random, t: 0, state: 'ready', events: [], log: [], logKeys: {}, collisions: [],
    world: null, ents: null, target: null, result: null, doneAt: null, exploded: false, bothDownAt: null, knocks: [],
    flags: { extOn: false, rocketOn: false },                    // 見た目（粒・ループ音）用
    ext: { on: false, t0: 0, faceHit: false, bowled: false, bowlHit: false, bowlAt: 0, dirx: 0, dirz: 0 },
    discharge: { at: null, fired: false }, ignite: { at: null },
    rocket: { startAt: null, on: false },
    hero: { alive: true, killedBy: null, hitText: null } };
  makeWorldBodies(S);
  S.A = newEnemyA(S);
  S.B = newEnemyB(S);
  return S;
}

function rnd(S, a, b) { return a + (b - a) * S.rng(); }
// ステップごとにカメラ・輪が見る物（ログのキー → 物の名前）
const STEP_FOCUS = { aDown: 'A', cylHit: 'cyl', explode: 'cyl', ext: 'ext', faceHit: 'A', bowl: 'B', duck: 'duck', shootout: 'A', bothDown: 'B', rocket: 'cyl', heroHit: 'hero' };
function pushLog(S, key, text) {
  if (S.logKeys[key]) return; S.logKeys[key] = 1; S.log.push({ key, text, t: S.t });
  if (key !== 'target' && key !== 'end') S.events.push({ type: 'step', key, text, focus: STEP_FOCUS[key] || null });   // 画面の字幕・見せ場の合図（本物の出来事から出る）
}
function emit(S, ev) { S.events.push(ev); }
function posOf(e) { const p = e.body.position; return { x: p.x, y: p.y, z: p.z }; }
function dist3(a, b) { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); }
function distXZ(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
const UP = () => new CANNON.Vec3(0, 1, 0);

// 命中：ここから連鎖が始まる（t = 0）
function simShoot(S, id) {
  const tg = S.stage.targets.find(x => x.id === id);
  S.state = 'running'; S.target = id; S.t = 0;
  pushLog(S, 'target', tg.name);
  emit(S, { type: 'impact', target: id, point: tg.aim });
  const E = S.ents, br = S.stage.branch;
  if (id === 'A') {                                          // ① 倒れながら引き金を引く
    const a = E.A; releaseEnt(a);
    const d = { x: tg.aim.x - br.x, z: tg.aim.z - br.z }, l = Math.hypot(d.x, d.z);
    a.body.velocity.set(d.x / l * 6.5, 1.5, d.z / l * 6.5);
    a.body.angularVelocity.set(-3.2, 0, 0);
    S.A.state = 'down';
    pushLog(S, 'aDown', '敵Aが倒れながら引き金を引く');
    S.discharge.at = S.t + CFG.discharge.at;
  } else if (id === 'ext') {                                  // ② 消火器がロケットのように飛ぶ
    S.ext.on = true; S.ext.t0 = S.t; S.flags.extOn = true;
    E.ext.body.velocity.set(0, 2.5, 0); E.ext.body.wakeUp();
    pushLog(S, 'ext', '消火器がロケットのように飛ぶ');
    emit(S, { type: 'extStart', point: tg.aim });
  } else if (id === 'duck') {                                 // ③ アヒルが鳴く
    const d = E.duck; releaseEnt(d);
    d.body.velocity.set(rnd(S, 0.4, 0.8), 1.2, rnd(S, 0.6, 1.0));
    pushLog(S, 'duck', 'アヒルが「ピーッ」と鳴く');
    emit(S, { type: 'squeak', pos: posOf(d) });
    emitNoise(S, 'squeak', posOf(d), CFG.duck.loud);
  } else if (id === 'cyl') {                                  // ④ 栓が飛ぶ（爆発はしない）→ ロケット
    S.rocket.startAt = S.t + 0.35;
    emit(S, { type: 'capPop', pos: posOf(E.cyl) });
  }
}

// 音。聞こえた敵が反応する。誰かが反応したら true
function emitNoise(S, kind, pos, loud) {
  emit(S, { type: 'noise', kind, pos, loud });
  const a = enemyAHear(S, kind, pos, loud), b = enemyBHear(S, kind, pos, loud);
  return a || b;
}

function simStep(S, dt) {
  if (S.state !== 'running') return;
  S.t += dt;
  syncFlashHold(S);
  extUpdate(S); dischargeUpdate(S); igniteUpdate(S); rocketUpdate(S);
  enemyAUpdate(S, dt);
  enemyBUpdate(S, dt);
  for (const k of S.knocks) knockPerson(S, k.e, k.dir);
  S.knocks.length = 0;
  physStep(S, dt);
  processCollisions(S);
  checkEnd(S);
}

function syncFlashHold(S) {                                   // 懐中電灯は B の手に付いていて、B について動く
  const f = S.ents.flash, b = S.ents.B.body, o = b.quaternion.vmult(new CANNON.Vec3(-0.3, 0.12, -0.35));
  f.hold.x = b.position.x + o.x; f.hold.y = b.position.y + o.y; f.hold.z = b.position.z + o.z;
  f.yaw = S.ents.B.yaw;
}

// ---- ① 暴発 → 命中 → 爆発 ----
function dischargeUpdate(S) {
  const D = S.discharge;
  if (D.at === null || D.fired || S.t < D.at) return;
  D.fired = true;
  const a = S.ents.A, m = muzzleOf(a), c = posOf(S.ents.cyl), e = CFG.discharge.aimErr;
  let r = fireGun(S, 'A', m, aimDir(m, c, rnd(S, -e, e), rnd(S, -e, e)), 'discharge');
  if (!(r.ent && r.ent.id === 'cyl')) fireGun(S, 'A', m, aimDir(m, c, 0, 0), 'discharge');          // ずれたときは、そっと補正してボンベに当てる
}
function igniteUpdate(S) {
  if (S.ignite.at === null || S.exploded || S.t < S.ignite.at) return;
  explode(S, posOf(S.ents.cyl));
}
function explode(S, pos) {
  const B = CFG.blast; S.exploded = true;
  emit(S, { type: 'explode', pos });
  pushLog(S, 'explode', '大爆発で全員吹き飛ぶ');
  S.ents.cyl.broken = true; S.world.remove(S.ents.cyl.body);
  for (const id of ['A', 'B', 'hero']) {
    const e = S.ents[id], p = posOf(e), d = dist3(p, pos);
    if (d > B.radius) continue;
    const k = Math.max(B.min, 1 - d / B.radius);
    const hx = p.x - pos.x, hz = p.z - pos.z, hl = Math.hypot(hx, hz) || 1;
    if (e.held) releaseEnt(e);
    e.body.velocity.set(hx / hl * B.speed * k, B.speed * B.up * k + 2, hz / hl * B.speed * k);
    e.body.angularVelocity.set(rnd(S, -B.spin, B.spin), rnd(S, -1, 1), rnd(S, -B.spin, B.spin));
    if (id === 'A') S.A.state = 'down';
    if (id === 'B') S.B.state = 'down';
    if (id === 'hero' && d < B.lethal && S.hero.alive) {
      S.hero.alive = false; S.hero.killedBy = 'blast'; S.hero.hitText = '主人公も吹き飛んだ';
      emit(S, { type: 'heroHit', point: p, who: 'blast' });
    }
  }
}

// ---- ② 消火器：A の顔へ → 直撃 → A が B を巻き込む ----
function extUpdate(S) {
  const x = S.ext, E = CFG.ext, e = S.ents.ext, a = S.ents.A;
  if (x.on) {
    const ap = posOf(a), head = { x: ap.x, y: ap.y + 0.65, z: ap.z - 0.1 }, p = e.body.position;
    const dx = head.x - p.x, dy = head.y - p.y, dz = head.z - p.z, l = Math.hypot(dx, dy, dz) || 1, b = e.body;
    b.force.x += dx / l * E.thrust; b.force.y += dy / l * E.thrust + b.mass * 9.8 * 0.95; b.force.z += dz / l * E.thrust;   // A の顔のほうへ噴射（ほぼ無重力）
    const v = b.velocity, sp = Math.hypot(v.x, v.y, v.z);
    if (sp > E.maxSpeed) { v.x *= E.maxSpeed / sp; v.y *= E.maxSpeed / sp; v.z *= E.maxSpeed / sp; }
    if (sp > 0.5) b.quaternion.setFromVectors(new CANNON.Vec3(1, 0, 0), new CANNON.Vec3(v.x / sp, v.y / sp, v.z / sp));    // 機首（+x）は進む向き
    b.angularVelocity.set(0, 0, 0);
    if (l < E.hitDist || S.t - x.t0 > 3) faceHit(S);
  }
  if (x.faceHit && !x.bowled && S.B.state !== 'down' && (x.bowlHit || S.t - x.bowlAt > E.bowlWait)) bowlB(S);
}
function faceHit(S) {
  const x = S.ext, E = CFG.ext, a = S.ents.A, b = posOf(S.ents.B), ap = posOf(a);
  if (x.faceHit) return;
  x.faceHit = true; x.on = false; S.flags.extOn = false; x.bowlAt = S.t;
  pushLog(S, 'faceHit', '敵Aの顔面に直撃');
  const dx = b.x - ap.x, dz = b.z - ap.z, l = Math.hypot(dx, dz) || 1;
  x.dirx = dx / l; x.dirz = dz / l;
  releaseEnt(a); S.A.state = 'down';
  a.body.velocity.set(x.dirx * E.bowlSpeed, E.bowlUp, x.dirz * E.bowlSpeed);        // 顔面に当たった A は、B のほうへ吹っ飛ぶ
  a.body.angularVelocity.set(-x.dirz * 5, rnd(S, -2, 2), x.dirx * 5);
  emit(S, { type: 'faceHit', pos: posOf(S.ents.ext) });
}
function bowlB(S) {
  const x = S.ext, E = CFG.ext, e = S.ents.B;
  x.bowled = true;
  releaseEnt(e); S.B.state = 'down';
  e.body.velocity.set(x.dirx * E.bowlPush, 2, x.dirz * E.bowlPush);
  e.body.angularVelocity.set(-x.dirz * 4, rnd(S, -2, 2), x.dirx * 4);
  pushLog(S, 'bowl', 'Aが吹っ飛んでBを巻き込む');
  emit(S, { type: 'thud', pos: posOf(e), speed: 8 });
}

// ---- ④ ロケット ----
function rocketUpdate(S) {
  const R = S.rocket, C = CFG.rocket, e = S.ents.cyl;
  if (R.startAt === null) return;
  if (!R.on) {
    if (S.t < R.startAt) return;
    R.on = true; R.t0 = S.t; S.flags.rocketOn = true;
    const l = Math.hypot(C.launch.x, C.launch.y, C.launch.z);
    e.body.velocity.set(C.launch.x / l * 3, C.launch.y / l * 3, C.launch.z / l * 3);
    pushLog(S, 'rocket', '爆発せず、ロケットになって跳ね回る');
    emit(S, { type: 'rocketStart', pos: posOf(e) });
  }
  const b = e.body, v = b.velocity, sp = Math.hypot(v.x, v.y, v.z), t = S.t - R.t0;
  let dx = sp > 0.5 ? v.x / sp : C.launch.x, dy = sp > 0.5 ? v.y / sp : C.launch.y, dz = sp > 0.5 ? v.z / sp : C.launch.z;
  const h = posOf(S.ents.hero), p = posOf(e); h.y += 0.3;     // 狙いは主人公の胸の高さ（椅子ではなく体）
  const hl = dist3(h, p) || 1, w = clamp((t - C.steerFrom) / C.steerRamp, 0, 1);
  dx = dx * (1 - w) + (h.x - p.x) / hl * w; dy = dy * (1 - w) + (h.y - p.y) / hl * w; dz = dz * (1 - w) + (h.z - p.z) / hl * w;
  const l = Math.hypot(dx, dy, dz) || 1;
  b.force.x += dx / l * C.thrust; b.force.y += dy / l * C.thrust + b.mass * 9.8 * 0.95; b.force.z += dz / l * C.thrust;   // 向きに噴射しつつ、ほぼ無重力で飛ぶ
  if (w > 0 && sp > 0.5) { const k = 0.14 * w, s2 = Math.min(sp, C.maxSpeed); v.x += ((h.x - p.x) / hl * s2 - v.x) * k; v.y += ((h.y - p.y) / hl * s2 - v.y) * k; v.z += ((h.z - p.z) / hl * s2 - v.z) * k; }   // 主人公のほうへ速さの向きを寄せる
  if (sp > C.maxSpeed) { v.x *= C.maxSpeed / sp; v.y *= C.maxSpeed / sp; v.z *= C.maxSpeed / sp; }
  if (sp > 0.5) b.quaternion.setFromVectors(new CANNON.Vec3(0, 1, 0), new CANNON.Vec3(v.x / sp, v.y / sp, v.z / sp));   // 機首は進む向き
  b.angularVelocity.set(0, 0, 0);
  if (sp > C.hitSpeed && dist3(h, p) < 0.62) killHero(S, 'cyl', '主人公に直撃', v);
  const near = [S.ents.A, S.ents.B].some(x => dist3(posOf(x), p) < C.dodgeDist);
  for (const X of [S.A, S.B]) {                                // ロケットが近づいたら、敵 2 人とも伏せてよける（字幕なし）
    const ex = S.ents[X === S.A ? 'A' : 'B'];
    if (X.state === 'dodge' || X.state === 'down') continue;
    if (sp > 3 && near) startDodge(S, X, ex);
  }
}
function startDodge(S, X, ex) {
  X.prevState = X.state; X.state = 'dodge'; X.dodgeEnd = S.t + CFG.rocket.dodgeT;
  if (!X.removed) { S.world.remove(ex.body); X.removed = true; }
}
function endDodge(S, X, ex, backTo) {
  if (X.removed) { S.world.addBody(ex.body); X.removed = false; }
  X.state = backTo;
}

function killHero(S, who, text, dirv) {
  if (!S.hero.alive) return;
  const h = S.ents.hero;
  S.hero.alive = false; S.hero.killedBy = who; S.hero.hitText = text;
  pushLog(S, 'heroHit', text);
  releaseEnt(h);
  h.body.velocity.set((dirv.x || 0) * 0.5, 1.5, (dirv.z || 0) * 0.5);
  h.body.angularVelocity.set((dirv.z || 0) * 0.5, 0, -(dirv.x || 0) * 0.5);
  emit(S, { type: 'heroHit', point: posOf(h), who });
}

function processCollisions(S) {
  const list = S.collisions; S.collisions = [];
  for (const c of list) {
    const e = c.ent;
    if (e.id === 'A' && c.other === 'B' && S.ext.faceHit) S.ext.bowlHit = true;                       // 飛んだ A が B にぶつかった
    else if (e.id === 'cyl' && c.other === 'hero' && c.speed > CFG.rocket.hitSpeed && S.rocket.on) killHero(S, 'cyl', '主人公に直撃', e.body.velocity);
    else if (e.id === 'cyl' && S.rocket.on && (c.other === 'wall' || c.other === 'ceil' || c.other === 'floor') && c.speed > 4) {
      if (!e.lastBounce || S.t - e.lastBounce > 0.15) { e.lastBounce = S.t; emit(S, { type: 'ricochet', pos: posOf(e), speed: c.speed }); }
    } else if (e.id === 'duck' && c.other === 'floor' && c.speed > 1 && !S.duckLanded) { S.duckLanded = true; emit(S, { type: 'thud', pos: posOf(e), speed: 3, soft: true }); }
    else if ((e.def.kind === 'person' || e.id === 'drum') && c.other === 'floor' && c.speed > 2.5) {
      if (!e.lastThud || S.t - e.lastThud > 0.3) { e.lastThud = S.t; emit(S, { type: 'thud', pos: posOf(e), speed: c.speed }); }
    }
  }
}

// 銃を撃つ。レイキャストで当たったものが決まる
function fireGun(S, who, from, dir, kind) {
  const r = castRay(S, from, dir, who);
  emit(S, { type: 'gunshot', who, kind, from, to: r.point, hit: r.ent ? r.ent.id : r.surface });
  if (r.ent && r.ent.id === 'hero') {
    killHero(S, who, '弾が主人公に命中', dir);
  } else if (r.ent && r.ent.id === 'cyl') {
    if (who === 'A' && kind === 'discharge' && S.ignite.at === null && !S.exploded) {                  // A の暴発の弾だけがボンベに火をつける
      pushLog(S, 'cylHit', '弾がガスボンベに命中');
      S.ignite.at = S.t + CFG.blast.fuse;
    }
  } else if (r.ent && (r.ent.id === 'A' || r.ent.id === 'B')) {
    if (kind === 'duel') S.knocks.push({ e: r.ent, dir });      // 撃ち合いは同時：両方撃ってから倒す
    else knockPerson(S, r.ent, dir);
  }
  return r;
}
function knockPerson(S, e, dir) {
  const X = e.id === 'A' ? S.A : S.B;
  if (X.state === 'down') return;
  if (X.removed) { S.world.addBody(e.body); X.removed = false; }
  releaseEnt(e); X.state = 'down';
  e.body.velocity.set(dir.x * CFG.duck.push, CFG.duck.up, dir.z * CFG.duck.push);
  e.body.angularVelocity.set(dir.z * 3, 0, -dir.x * 3);
  emit(S, { type: 'thud', pos: posOf(e), speed: 6 });
}

function checkEnd(S) {
  const bothDown = S.A.state === 'down' && S.B.state === 'down';
  if (bothDown && S.bothDownAt === null) {
    S.bothDownAt = S.t;
    if (S.target === 'duck') pushLog(S, 'bothDown', '2人とも倒れる');                                       // ③ 2 人とも倒れた
  }
  if (S.doneAt === null) {
    if (!S.hero.alive) { S.doneAt = S.t + CFG.time.hitHold; finishSim(S, false); }
    else if (S.t >= CFG.time.endAt || (bothDown && S.target !== 'cyl' && S.t - S.bothDownAt >= CFG.ext.endAfter)) { S.doneAt = S.t + 0.3; finishSim(S, true); }   // 撃つ敵がいなくなったら、少しおいて結果へ
  }
  if (S.doneAt !== null && S.t >= S.doneAt && S.state === 'running') { S.state = 'done'; emit(S, { type: 'done', result: S.result }); }
  if (S.t > CFG.time.simMax && S.state === 'running') { S.state = 'done'; if (!S.result) finishSim(S, S.hero.alive); }
}

function finishSim(S, ok) {
  const id = S.target;
  if (ok) pushLog(S, 'end', '主人公 生存');
  else if (!S.hero.hitText) pushLog(S, 'end', '主人公 被弾');
  let sub;
  if (id === 'A') sub = ok ? '偶然の成功' : '主人公も吹き飛んだ';
  else if (id === 'ext') sub = ok ? '地味な物が一番強い' : '消火器は役に立たなかった';
  else if (id === 'duck') sub = ok ? '敵が勝手に全滅' : 'アヒルは鳴いただけ';
  else if (id === 'cyl') sub = ok ? '偶然よけた' : 'いちばん派手な方法で失敗';
  else sub = ok ? '偶然の成功' : '未来は変わらなかった';
  S.result = { ok, target: id, title: ok ? 'CLEAR' : 'GAME OVER', sub, lines: S.log.map(l => l.text) };
}
