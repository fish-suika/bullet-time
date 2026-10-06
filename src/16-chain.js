// ===== 連鎖のルール。物理の衝突・音・時刻 → 物や敵の動き → 結果。three.js は使わない =====
// 結果は台本ではなく、剛体の衝突・敵の弾（レイキャスト）・単純な状態機械で決まる。
// 4 つの未来：① 敵 A（銃が滑る→B がかがむ→棚→ペンキ缶→めちゃくちゃに撃つ）② 消火器（ドラム缶→B→懐中電灯→A がまぶしい→スプリンクラー→水浸し）
//             ③ アヒル（鳴く→A が B に振り向く→撃ち合い）④ ガスボンベ（ロケットになって跳ね回り、主人公の椅子に直撃）
function newSim(stage, rng) {
  const S = { stage, rng: rng || Math.random, t: 0, state: 'ready', events: [], log: [], logKeys: {}, collisions: [],
    world: null, ents: null, target: null, result: null, doneAt: null,
    flags: { extOn: false, rocketOn: false, rain: false, wet: false },   // 見た目（粒・床の濡れ）用
    ext: { on: false, t0: 0, hitAt: null, dirx: 0, dirz: 0 },
    drum: { homeUntil: 0 },
    flashT: { throwAt: null, thrown: false, arriveAt: 0 },
    rocket: { startAt: null, on: false },
    wetAt: null, flooded: false, allOutAt: null, knocks: [],
    hero: { alive: true, tipped: false, blasted: false, killedBy: null, hitText: null } };
  makeWorldBodies(S);
  S.A = newEnemyA(S);
  S.B = newEnemyB(S);
  return S;
}

function rnd(S, a, b) { return a + (b - a) * S.rng(); }
// ステップごとにカメラが見る物（ログのキー → 物の名前）
const STEP_FOCUS = { aDown: 'A', gunSlide: 'gun', stoop: 'B', butt: 'shelf', paint: 'B', blind: 'B', heroHit: 'hero', allMiss: 'hero', ext: 'ext', drumHit: 'drum', bKnock: 'B', flashA: 'flash',
  dazzle: 'A', sprinkler: 'sprk', slipLoop: 'B', duck: 'duck', aTurn: 'A', bLit: 'B', shootout: 'A', bothDown: 'B', cylShot: 'cyl', rocket: 'cyl', dodge: 'A' };
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
  if (id === 'A') {                                          // ① 敵 A が倒れる → 銃が床を滑って B の足元へ
    const a = E.A; releaseEnt(a);
    const d = { x: tg.aim.x - br.x, z: tg.aim.z - br.z }, l = Math.hypot(d.x, d.z);
    a.body.velocity.set(d.x / l * 6.5, 1.5, d.z / l * 6.5);
    a.body.angularVelocity.set(-3.2, 0, 0);                 // 前へのめって倒れる
    S.A.state = 'down'; S.A.byBullet = true;
    pushLog(S, 'aDown', '倒れる');
    const g = E.gun, G = CFG.gunSlide, gp = g.hold;
    g.held = false; g.body.wakeUp();
    const ax = G.aim.x + rnd(S, -G.aimJit, G.aimJit), az = G.aim.z + rnd(S, -G.aimJit, G.aimJit);
    const gx = ax - gp.x, gz = az - gp.z, gl = Math.hypot(gx, gz);
    g.body.velocity.set(gx / gl * G.speed, 0, gz / gl * G.speed);
    g.body.angularVelocity.set(0, rnd(S, -3, 3), 0);
    emit(S, { type: 'gunDrop', pos: gp });
  } else if (id === 'ext') {                                  // ② 消火器が噴射して滑走
    S.ext.on = true; S.ext.t0 = S.t; S.flags.extOn = true;
    pushLog(S, 'ext', '噴射して床を滑走');
    emit(S, { type: 'extStart', point: tg.aim });
  } else if (id === 'duck') {                                 // ③ アヒルが鳴いて棚から落ちる
    const d = E.duck; releaseEnt(d);
    d.body.velocity.set(rnd(S, 0.4, 0.8), 1.2, rnd(S, 0.6, 1.0));
    pushLog(S, 'duck', 'ピーッと鳴いて棚から落ちる');
    emit(S, { type: 'squeak', pos: posOf(d) });
    emitNoise(S, 'squeak', posOf(d), CFG.duck.loud);
  } else if (id === 'cyl') {                                  // ④ ガスボンベ：栓が飛ぶ → ロケットになる
    S.rocket.startAt = S.t + 0.35;
    pushLog(S, 'cylShot', '栓が飛ぶ');
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
  extUpdate(S, dt); drumUpdate(S); flashUpdate(S); rocketUpdate(S); shelfUpdate(S);
  enemyAUpdate(S, dt);
  enemyBUpdate(S, dt);
  for (const k of S.knocks) knockPerson(S, k.e, k.dir);
  S.knocks.length = 0;
  wetUpdate(S, dt);
  physStep(S, dt);
  processCollisions(S);
  checkEnd(S);
}

// ---- ② 消火器・ドラム缶・懐中電灯・スプリンクラー ----
function extUpdate(S, dt) {
  const x = S.ext; if (!x.on) return;
  const e = S.ents.ext, d = S.ents.drum, E = CFG.ext;
  if (S.t - x.t0 > E.maxT || (x.hitAt !== null && S.t - x.hitAt > E.afterHit)) { x.on = false; S.flags.extOn = false; return; }
  const p = e.body.position, dp = d.body.position;
  if (x.hitAt === null) { const dx = dp.x - p.x, dz = dp.z - p.z, l = Math.hypot(dx, dz) || 1; x.dirx = dx / l; x.dirz = dz / l; }   // ドラム缶のほうへ噴射の向きを寄せる
  e.body.force.x += x.dirx * E.thrust; e.body.force.z += x.dirz * E.thrust;
  e.body.quaternion.setFromAxisAngle(UP(), Math.atan2(-x.dirz, x.dirx));
  e.body.angularVelocity.set(0, 0, 0);
}
function drumUpdate(S) {
  if (S.drum.homeUntil <= S.t) return;
  const d = S.ents.drum.body, b = S.ents.B.body, dx = b.position.x - d.position.x, dz = b.position.z - d.position.z, l = Math.hypot(dx, dz) || 1;
  d.force.x += dx / l * CFG.drum.homing; d.force.z += dz / l * CFG.drum.homing;           // 転がるドラム缶を B のほうへ軽く寄せる
}
function knockB(S) {                                          // ドラム缶が B をなぎ倒す
  const b = S.B, e = S.ents.B, dv = S.ents.drum.body.velocity, l = Math.hypot(dv.x, dv.z) || 1, D = CFG.drum;
  releaseEnt(e); b.state = 'down'; b.lp = null;
  e.body.velocity.set(dv.x / l * D.push, D.up, dv.z / l * D.push);
  e.body.angularVelocity.set(rnd(S, -3, 3), rnd(S, -1, 1), rnd(S, -3, 3));
  pushLog(S, 'bKnock', '転がるドラム缶が敵Bをなぎ倒す');
  emit(S, { type: 'thud', pos: posOf(e), speed: 7 });
  S.flashT.throwAt = S.t + CFG.flash.throwDelay;
}
function syncFlashHold(S) {                                   // 懐中電灯は B の手に付いている間、B について動く
  const f = S.ents.flash;
  if (!f.held) return;
  const b = S.ents.B.body, o = b.quaternion.vmult(new CANNON.Vec3(-0.3, 0.12, -0.35));
  f.hold.x = b.position.x + o.x; f.hold.y = b.position.y + o.y; f.hold.z = b.position.z + o.z;
  f.yaw = S.ents.B.yaw;
}
function flashUpdate(S) {
  const F = S.flashT, f = S.ents.flash, C = CFG.flash;
  if (F.throwAt !== null && !F.thrown && S.t >= F.throwAt) {   // 懐中電灯が宙を舞って A の顔の前へ
    F.thrown = true; F.arriveAt = S.t + C.flight;
    const a = posOf(S.ents.A), p = f.hold;
    releaseEnt(f);
    const T = C.flight, P = { x: a.x + C.face.dx + rnd(S, -0.08, 0.08), y: C.face.y, z: a.z + C.face.dz };
    f.body.velocity.set((P.x - p.x) / T, (P.y - p.y) / T - 0.5 * CFG.phys.gravity * T, (P.z - p.z) / T);
    pushLog(S, 'flashA', '懐中電灯が宙を舞い敵Aの顔を照らす');
    emit(S, { type: 'flashThrow', pos: p });
  }
  if (F.thrown && S.t < F.arriveAt + 1.8) {                    // 飛んでいる間もそのあとも、光は A の顔のほうを向く
    const a = posOf(S.ents.A), p = f.body.position, d = new CANNON.Vec3(a.x - p.x, a.y + 0.7 - p.y, a.z - p.z);
    d.normalize(); f.body.quaternion.setFromVectors(new CANNON.Vec3(0, 0, -1), d); f.body.angularVelocity.set(0, 0, 0);
    if (!F.dazzled && S.t >= F.arriveAt) { F.dazzled = true; enemyADazzle(S); }
  }
}
function onSprinkler(S) {
  if (S.wetAt !== null) return;
  S.wetAt = S.t; S.flags.rain = true;
  pushLog(S, 'sprinkler', '外れた弾がスプリンクラーに当たる');
  emit(S, { type: 'sprinkler', pos: posOf(S.ents.sprk) });
}
function wetUpdate(S, dt) {
  if (S.wetAt === null) return;
  if (!S.flooded && S.t >= S.wetAt + CFG.wet.floodDelay) {
    S.flooded = true; S.flags.wet = true; S.world.defaultContactMaterial.friction = CFG.wet.friction;
    pushLog(S, 'flood', '倉庫中が水浸し');
    emit(S, { type: 'flood' });
  }
  if (S.flooded) enemyWetLoop(S);
}

// ---- ① 棚 ----
function shelfUpdate(S) {
  const e = S.ents.shelf, B = S.B;
  if (B.bumpAt === undefined || B.bumpAt === null) return;
  const t = S.t - B.bumpAt, W = CFG.gunSlide.shelfWobble;
  e.tilt = t < 0 ? 0 : t < W ? Math.sin(t * 22) * 0.07 * (1 - t / W) : 0;   // 棚が揺れる
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
    pushLog(S, 'rocket', 'ロケットになって跳ね回る');
    emit(S, { type: 'rocketStart', pos: posOf(e) });
  }
  const b = e.body, v = b.velocity, sp = Math.hypot(v.x, v.y, v.z), t = S.t - R.t0;
  let dx = sp > 0.5 ? v.x / sp : C.launch.x, dy = sp > 0.5 ? v.y / sp : C.launch.y, dz = sp > 0.5 ? v.z / sp : C.launch.z;
  const h = posOf(S.ents.hero), p = posOf(e), hl = dist3(h, p) || 1, w = clamp((t - C.steerFrom) / C.steerRamp, 0, 1);
  dx = dx * (1 - w) + (h.x - p.x) / hl * w; dy = dy * (1 - w) + (h.y - p.y) / hl * w; dz = dz * (1 - w) + (h.z - p.z) / hl * w;
  const l = Math.hypot(dx, dy, dz) || 1;
  b.force.x += dx / l * C.thrust; b.force.y += dy / l * C.thrust + b.mass * 9.8 * 0.95; b.force.z += dz / l * C.thrust;   // 向きに噴射しつつ、ほぼ無重力で飛ぶ
  if (w > 0 && sp > 0.5) { const k = 0.14 * w, s2 = Math.min(sp, C.maxSpeed); v.x += ((h.x - p.x) / hl * s2 - v.x) * k; v.y += ((h.y - p.y) / hl * s2 - v.y) * k; v.z += ((h.z - p.z) / hl * s2 - v.z) * k; }   // 主人公のほうへ速さの向きを寄せる（ロケットの誘導）
  if (sp > C.maxSpeed) { v.x *= C.maxSpeed / sp; v.y *= C.maxSpeed / sp; v.z *= C.maxSpeed / sp; }
  if (sp > 0.5) { const n = new CANNON.Vec3(v.x / sp, v.y / sp, v.z / sp); b.quaternion.setFromVectors(new CANNON.Vec3(0, 1, 0), n); }   // 機首は進む向き
  b.angularVelocity.set(0, 0, 0);
  if (sp > C.hitSpeed && dist3(h, p) < 0.62) killHero(S, 'cyl', '主人公の椅子に直撃', v);
  const near = [S.ents.A, S.ents.B].some(x => dist3(posOf(x), p) < C.dodgeDist);
  for (const X of [S.A, S.B]) {                                // ロケットが近づいたら、敵 2 人とも伏せてよける
    const ex = S.ents[X === S.A ? 'A' : 'B'];
    if (X.state === 'dodge' || X.state === 'down' || X.state === 'dead') continue;
    if (sp > 3 && near) startDodge(S, X, ex);
  }
}
function startDodge(S, X, ex) {
  X.prevState = X.state; X.state = 'dodge'; X.dodgeEnd = S.t + CFG.rocket.dodgeT;
  if (!X.removed) { S.world.remove(ex.body); X.removed = true; }
  if (S.A.state === 'dodge' && S.B.state === 'dodge') pushLog(S, 'dodge', '敵2人は伏せてよける');
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
  emit(S, { type: 'heroHit', point: posOf(h) });
}

function processCollisions(S) {
  const list = S.collisions; S.collisions = [];
  for (const c of list) {
    const e = c.ent;
    if (e.id === 'ext' && c.other === 'drum' && S.ext.on && S.ext.hitAt === null) {          // 消火器がドラム缶を弾く
      S.ext.hitAt = S.t; S.drum.homeUntil = S.t + CFG.drum.homingT;
      pushLog(S, 'drumHit', 'ドラム缶を弾く');
      emit(S, { type: 'extHit', pos: posOf(S.ents.drum) });
    } else if (e.id === 'drum' && c.other === 'B' && S.B.state !== 'down' && S.ents.B.held && c.speed > CFG.drum.knockSpeed && S.drum.homeUntil > 0) {
      knockB(S);
    } else if (e.id === 'cyl' && c.other === 'hero' && c.speed > CFG.rocket.hitSpeed && S.rocket.on) {
      killHero(S, 'cyl', '主人公の椅子に直撃', e.body.velocity);
    } else if (e.id === 'cyl' && S.rocket.on && (c.other === 'wall' || c.other === 'ceil' || c.other === 'floor') && c.speed > 4) {
      if (!e.lastBounce || S.t - e.lastBounce > 0.15) { e.lastBounce = S.t; emit(S, { type: 'ricochet', pos: posOf(e), speed: c.speed }); }
    } else if (e.id === 'duck' && c.other === 'floor' && c.speed > 1 && !S.duckLanded) {
      S.duckLanded = true; emit(S, { type: 'thud', pos: posOf(e), speed: 3, soft: true });
    } else if (e.id === 'gun' && c.other === 'floor' && c.speed > 1 && !S.gunLanded) {       // 銃が床に落ちた音
      S.gunLanded = true;
      if (distXZ(posOf(e), posOf(S.ents.B)) < 3.2) pushLog(S, 'gunSlide', '銃が床を滑って敵Bの足元へ');
      emit(S, { type: 'thud', pos: posOf(e), speed: 3, soft: true });
      emitNoise(S, 'clatter', posOf(e), CFG.loud.clatter);
    } else if (e.id === 'A' && c.other === 'floor' && c.speed > 1.2 && S.A.byBullet && !S.A.noised && e.body.quaternion.vmult(new CANNON.Vec3(0, 1, 0)).y < 0.6) {   // 体が傾いて倒れたとき
      S.A.noised = true;
      emit(S, { type: 'thud', pos: posOf(e), speed: 6 });
    } else if ((e.def.kind === 'person' || e.id === 'drum' || e.id === 'shelf') && c.other === 'floor' && c.speed > 2.5) {
      if (!e.lastThud || S.t - e.lastThud > 0.3) { e.lastThud = S.t; emit(S, { type: 'thud', pos: posOf(e), speed: c.speed }); }
    }
  }
}

// 銃を撃つ。レイキャストで当たったものが決まる
function fireGun(S, who, from, dir, kind) {
  const r = castRay(S, from, dir, who);
  emit(S, { type: 'gunshot', who, kind, from, to: r.point, hit: r.ent ? r.ent.id : r.surface });
  if (r.ent && r.ent.id === 'hero') {
    killHero(S, who, who === 'B' && S.target === 'A' ? '1発が主人公に命中' : '弾が主人公に命中', dir);
  } else if (r.ent && r.ent.id === 'sprk') {
    onSprinkler(S);
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
  releaseEnt(e); X.state = 'down'; X.lp = null;
  e.body.velocity.set(dir.x * CFG.duck.push, CFG.duck.up, dir.z * CFG.duck.push);
  e.body.angularVelocity.set(dir.z * 3, 0, -dir.x * 3);
  emit(S, { type: 'thud', pos: posOf(e), speed: 6 });
}

function checkEnd(S) {
  if (S.target === 'duck') {                                   // ③ 2 人とも倒れたら「敵が勝手に全滅」
    if (S.A.state === 'down' && S.B.state === 'down') { pushLog(S, 'bothDown', '2人とも倒れる'); if (S.allOutAt === null) S.allOutAt = S.t + 0.5; }
    if (S.allOutAt !== null && S.t >= S.allOutAt) pushLog(S, 'allOut', '敵が勝手に全滅');
  }
  if (S.doneAt === null) {
    if (!S.hero.alive) { S.doneAt = S.t + CFG.time.hitHold; finishSim(S, false); }
    else if (S.t >= CFG.time.endAt) { S.doneAt = S.t + 0.3; finishSim(S, true); }
  }
  if (S.doneAt !== null && S.t >= S.doneAt && S.state === 'running') { S.state = 'done'; emit(S, { type: 'done', result: S.result }); }
  if (S.t > CFG.time.simMax && S.state === 'running') { S.state = 'done'; if (!S.result) finishSim(S, S.hero.alive); }
}

function finishSim(S, ok) {
  const id = S.target;
  if (ok) {
    if (id === 'A' && S.B.blindShots >= CFG.blind.shots) pushLog(S, 'allMiss', '全部外れる');
    pushLog(S, 'end', '主人公 生存');
  } else if (!S.logKeys.heroHit) pushLog(S, 'end', '主人公 被弾');
  let title = ok ? 'CLEAR' : 'GAME OVER', sub, badge = false;
  if (id === 'A') { if (ok) { title = 'CLEAR？'; sub = '奇跡的に全部外れた'; badge = true; } else sub = 'ペンキ缶で全部台無し'; }
  else if (id === 'ext') sub = ok ? '地味な物が一番強い' : '消火器は消えなかった';
  else if (id === 'duck') sub = ok ? 'どうでもいい物が正解' : 'アヒルは鳴いただけ';
  else if (id === 'cyl') sub = ok ? '偶然よけた' : 'いちばん派手な方法で失敗';
  else sub = ok ? '偶然の成功' : '未来は変わらなかった';
  S.result = { ok, target: id, title, sub, badge, lines: S.log.map(l => l.text) };
}
