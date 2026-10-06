// ===== 連鎖のルール。物理の衝突・音・時刻 → 敵の行動 → 結果。three.js は使わない =====
// 結果は台本ではなく、敵の弾（レイキャスト）と爆発の判定で決まる。
function newSim(stage, rng) {
  const S = { stage, rng: rng || Math.random, t: 0, state: 'ready', events: [], log: [], logKeys: {}, collisions: [],
    world: null, ents: null, target: null, result: null, doneAt: null, exploded: false, bananaLanded: false,
    hero: { alive: true, tipped: false, blasted: false, killedBy: null } };
  makeWorldBodies(S);
  S.A = newEnemyA(S);
  S.B = newEnemyB(S);
  return S;
}

function rnd(S, a, b) { return a + (b - a) * S.rng(); }
function pushLog(S, key, text) { if (S.logKeys[key]) return; S.logKeys[key] = 1; S.log.push({ key, text, t: S.t }); }
function emit(S, ev) { S.events.push(ev); }
function posOf(e) { const p = e.body.position; return { x: p.x, y: p.y, z: p.z }; }
function dist3(a, b) { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); }
function distXZ(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }

// 命中：ここから連鎖が始まる（t = 0）
function simShoot(S, id) {
  const tg = S.stage.targets.find(x => x.id === id);
  S.state = 'running'; S.target = id; S.t = 0;
  pushLog(S, 'target', tg.name);
  emit(S, { type: 'impact', target: id, point: tg.aim });
  const E = S.ents, br = S.stage.branch;
  if (id === 'A') {
    const a = E.A; releaseEnt(a);
    const d = { x: tg.aim.x - br.x, z: tg.aim.z - br.z }, l = Math.hypot(d.x, d.z);
    a.body.velocity.set(d.x / l * CFG.hit.aPush, CFG.hit.aUp, d.z / l * CFG.hit.aPush);
    a.body.angularVelocity.set(-3.2, 0, 0);               // 前へのめって倒れる
    S.A.state = 'down'; S.A.byBullet = true;
    pushLog(S, 'aDown', '倒れる');
  } else if (id === 'lamp') {
    releaseEnt(E.lamp);
    E.lamp.body.velocity.set(rnd(S, -0.15, 0.15), 0, rnd(S, -0.1, 0.1));
    pushLog(S, 'lampFall', '落下');
    emit(S, { type: 'chainSnap', point: tg.aim });
  } else if (id === 'banana') {
    const b = E.banana.body, B = CFG.banana, T = B.flight + rnd(S, -B.flightJit, B.flightJit);
    const ang = rnd(S, 0, Math.PI * 2), r = Math.sqrt(S.rng()) * B.land;
    const lx = B.landX + Math.cos(ang) * r, lz = B.landZ + Math.sin(ang) * r;
    b.velocity.set((lx - b.position.x) / T, (0.05 - b.position.y - 0.5 * CFG.phys.gravity * T * T) / T, (lz - b.position.z) / T);
    b.angularVelocity.set(rnd(S, -6, 6), rnd(S, -6, 6), rnd(S, -6, 6));
    b.wakeUp();
    pushLog(S, 'banFly', '飛ぶ');
    emit(S, { type: 'bananaHit', point: tg.aim });
  } else if (id === 'bottle') {
    const e = E.bottle; e.broken = true; S.world.remove(e.body);
    emit(S, { type: 'shatter', kind: 'bottle', pos: posOf(e) });
    pushLog(S, 'bottle', '割れる');
    const heard = emitNoise(S, 'shatter', posOf(e), CFG.loud.bottle);
    if (!heard) pushLog(S, 'ignored', '誰も気にしない');
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
  enemyAUpdate(S, dt);
  enemyBUpdate(S, dt);
  physStep(S, dt);
  processCollisions(S);
  checkEnd(S);
}

function processCollisions(S) {
  const list = S.collisions; S.collisions = [];
  for (const c of list) {
    const e = c.ent;
    if (e.id === 'lamp' && !e.broken && c.speed > 2) {
      e.broken = true; S.world.remove(e.body);
      emit(S, { type: 'shatter', kind: 'lamp', pos: posOf(e) });
      emitNoise(S, 'crash', posOf(e), CFG.loud.lamp);
    } else if (e.id === 'banana' && c.other === 'floor' && c.speed > 1.5 && !S.bananaLanded) {
      S.bananaLanded = true;
      const p = posOf(e);
      emit(S, { type: 'thud', pos: p, speed: 3, soft: true });
      emitNoise(S, 'drop', p, CFG.loud.banana);
      if (distXZ(p, posOf(S.ents.B)) < 3) pushLog(S, 'nearB', '敵Bの足元へ');
    } else if (e.id === 'A' && c.other === 'floor' && c.speed > 1.2 && S.A.byBullet && !S.A.noised && e.body.quaternion.vmult(new CANNON.Vec3(0, 1, 0)).y < 0.6) {   // 体が傾いて倒れたとき
      S.A.noised = true;
      emit(S, { type: 'thud', pos: posOf(e), speed: 6 });
      emitNoise(S, 'allyDown', posOf(e), CFG.loud.allyDown);
    } else if ((e.def.kind === 'person' || e.id === 'crate' || e.id === 'cyl') && c.other === 'floor' && c.speed > 2.5) {
      if (!e.lastThud || S.t - e.lastThud > 0.3) { e.lastThud = S.t; emit(S, { type: 'thud', pos: posOf(e), speed: c.speed }); }
    }
  }
}

// 銃を撃つ。レイキャストで当たったものが決まる
function fireGun(S, who, from, dir, kind) {
  const r = castRay(S, from, dir, who);
  emit(S, { type: 'gunshot', who, kind, from, to: r.point, hit: r.ent ? r.ent.id : r.surface });
  if (r.ent && r.ent.id === 'hero' && S.hero.alive) {
    S.hero.alive = false; S.hero.killedBy = who;
    releaseEnt(r.ent);
    r.ent.body.velocity.set(dir.x * 2, 1.2, dir.z * 2);
    r.ent.body.angularVelocity.set(dir.z * 2, 0, -dir.x * 2);
    emit(S, { type: 'heroHit', point: r.point });
  } else if (r.ent && r.ent.id === 'cyl' && !S.exploded) {
    pushLog(S, 'cylHit', 'ボンベに命中');
    explode(S, posOf(r.ent));
  }
  return r;
}

function explode(S, pos) {
  const B = CFG.blast; S.exploded = true;
  emit(S, { type: 'explode', pos });
  pushLog(S, 'explode', '爆発');
  S.ents.cyl.broken = true; S.world.remove(S.ents.cyl.body);
  let blown = false;
  for (const id of ['A', 'B', 'crate', 'hero']) {
    const e = S.ents[id], p = posOf(e), d = dist3(p, pos);
    if (d > B.radius) continue;
    const k = Math.max(B.min, 1 - d / B.radius);
    const hx = p.x - pos.x, hz = p.z - pos.z, hl = Math.hypot(hx, hz) || 1;
    if (e.held) releaseEnt(e);
    e.body.velocity.set(hx / hl * B.speed * k, B.speed * B.up * k + 1, hz / hl * B.speed * k);
    e.body.angularVelocity.set(rnd(S, -B.spin, B.spin), rnd(S, -1, 1), rnd(S, -B.spin, B.spin));
    if (id === 'A') { S.A.state = 'down'; blown = true; }
    if (id === 'B') { S.B.state = 'down'; blown = true; }
    if (id === 'hero') {
      S.hero.tipped = true; S.hero.blasted = true;
      if (d < B.lethal && S.hero.alive) { S.hero.alive = false; S.hero.killedBy = 'blast'; emit(S, { type: 'heroHit', point: p }); }
    }
  }
  if (blown) pushLog(S, 'blown', '敵が吹き飛ぶ');
}

function checkEnd(S) {
  if (S.doneAt === null) {
    if (!S.hero.alive) { S.doneAt = S.t + CFG.time.hitHold; finishSim(S, false); }
    else if (S.t >= CFG.time.endAt) { S.doneAt = S.t + 0.3; finishSim(S, true); }
  }
  if (S.doneAt !== null && S.t >= S.doneAt && S.state === 'running') { S.state = 'done'; emit(S, { type: 'done', result: S.result }); }
  if (S.t > CFG.time.simMax && S.state === 'running') { S.state = 'done'; if (!S.result) finishSim(S, S.hero.alive); }
}

function finishSim(S, ok) {
  const id = S.target;
  if (ok) pushLog(S, 'end', S.hero.blasted ? '主人公 無傷' : '主人公 生存');
  else pushLog(S, 'end', S.hero.killedBy === 'blast' ? '主人公 爆風を受ける' : '主人公 被弾');
  let sub;
  if (ok) sub = id === 'lamp' ? '正攻法' : id === 'banana' ? 'バカな方法' : '偶然の成功';
  else sub = id === 'bottle' ? '何も変わらなかった' : id === 'A' ? '仲間に気づかれた' : '未来は変わらなかった';
  S.result = { ok, target: id, sub, lines: S.log.map(l => l.text) };
}
