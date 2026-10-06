// ===== 敵の状態と射撃。three.js は使わない =====
// A：aim（主人公を狙う・時刻が来たら撃つ）／dazzled（まぶしくて反射で撃つ＝外れる）／turn → standoff（アヒルの声で B に振り向く）／frozen／down／dodge（伏せる）
// B：idle（窓を見張る）／seek → stoop → blind（銃を拾おうとして缶をかぶる→めちゃくちゃに撃つ）／lit → standoff（アヒルの声で A を照らす）／down／dodge
// 濡れた床では、倒れた敵が起き上がろうとして（rising）すべって転ぶ（down）のをくり返す
function newEnemyA(S) {
  return { state: 'aim', fireAt: CFG.time.aFireAt + rnd(S, -CFG.time.aFireJit, CFG.time.aFireJit), panicAt: 0, byBullet: false, noised: false,
    yawGoal: 0, turnEnd: 0, fireTime: 0, lp: null, removed: false };
}
function newEnemyB(S) {
  const e = S.ents.B;
  return { state: 'idle', reactAt: 0, speed: CFG.enemy.bRun + rnd(S, -CFG.enemy.bRunJit, CFG.enemy.bRunJit),
    heading: yawFwd(e.yaw), yawGoal: e.yaw, turnEnd: 0, fireTime: 0, stoopT0: 0, bumpAt: null, paintAt: null, paintTarget: null, blindT0: 0, blindShots: 0,
    lp: null, removed: false };
}

function aimDir(from, to, errYaw, errPitch) {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z, l = Math.hypot(dx, dy, dz);
  const yaw = Math.atan2(dx, dz) + errYaw, pitch = Math.asin(dy / l) + errPitch;
  return { x: Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: Math.cos(yaw) * Math.cos(pitch) };
}
function chestOf(e) { const p = posOf(e); return { x: p.x, y: p.y + 0.2, z: p.z }; }
function muzzleOf(e) {                                   // 立っている人の銃口（向いている方向の前）
  const p = posOf(e), f = yawFwd(e.yaw);
  return { x: p.x + f.x * 0.6, y: p.y + 0.45, z: p.z + f.z * 0.6 };
}
function turnToward(e, goal, rate, dt) {
  const diff = Math.atan2(Math.sin(goal - e.yaw), Math.cos(goal - e.yaw));
  e.yaw += Math.sign(diff) * Math.min(Math.abs(diff), dt * rate);
}

// ---------- 敵 A ----------
function enemyAHear(S, kind, pos, loud) {
  const a = S.A, e = S.ents.A;
  if (a.state !== 'aim') return false;
  if (kind === 'squeak' && distXZ(posOf(e), pos) < loud * CFG.enemy.hearing) {      // アヒルの声：B が鳴らしたと思って振り向く
    const bp = posOf(S.ents.B), ep = posOf(e), D = CFG.duck;
    a.state = 'turn'; a.yawGoal = yawToward(bp.x - ep.x, bp.z - ep.z); a.turnEnd = S.t + D.aTurn; a.fireTime = a.turnEnd + rnd(S, D.fireMin, D.fireMax);
    pushLog(S, 'aTurn', '敵Aが「誰だ！」とBに振り向く');
    emit(S, { type: 'speech', who: 'A', text: '誰だ！' });
    return true;
  }
  return false;
}
function enemyADazzle(S) {                               // 懐中電灯に顔を照らされた
  const a = S.A;
  if (a.state !== 'aim') return;
  a.state = 'dazzled'; a.panicAt = S.t + CFG.flash.dazzleDelay;
}

function enemyAUpdate(S, dt) {
  const a = S.A, e = S.ents.A, E = CFG.enemy;
  if (!S.hero.alive && a.state === 'aim') return;
  if (a.state === 'aim' && S.t >= a.fireAt) {
    a.state = 'fired';
    pushLog(S, 'aFire', '敵Aが撃つ');
    fireGun(S, 'A', muzzleOf(e), aimDir(muzzleOf(e), chestOf(S.ents.hero), rnd(S, -E.aimErr, E.aimErr), rnd(S, -E.aimErr, E.aimErr)), 'aim');
  } else if (a.state === 'dazzled' && S.t >= a.panicAt) {
    a.state = 'frozen';                                  // まぶしくて、見えないまま撃つ。弾の先は天井のスプリンクラー
    pushLog(S, 'dazzle', 'まぶしくてAの弾が外れる');
    const sp = posOf(S.ents.sprk), C = CFG.flash;
    fireGun(S, 'A', muzzleOf(e), aimDir(muzzleOf(e), sp, rnd(S, -C.aimErr, C.aimErr), rnd(S, -C.aimErr, C.aimErr)), 'dazzle');
  } else if (a.state === 'turn') {
    turnToward(e, a.yawGoal, 6, dt);
    if (S.t >= a.turnEnd) a.state = 'standoff';
  } else if (a.state === 'standoff' && S.t >= a.fireTime) {
    a.state = 'fired';
    pushLog(S, 'shootout', '撃ち合い');
    fireGun(S, 'A', muzzleOf(e), aimDir(muzzleOf(e), chestOf(S.ents.B), rnd(S, -CFG.duck.aimErr, CFG.duck.aimErr), rnd(S, -CFG.duck.aimErr, CFG.duck.aimErr)), 'duel');
  } else if (a.state === 'dodge' && S.t >= a.dodgeEnd) endDodge(S, a, e, a.prevState);
}

// ---------- 敵 B ----------
function enemyBHear(S, kind, pos, loud) {
  const b = S.B, e = S.ents.B;
  if (b.state !== 'idle') return false;
  if (distXZ(posOf(e), pos) > loud * CFG.enemy.hearing) return false;
  if (kind === 'clatter') { b.state = 'seek'; b.reactAt = S.t + CFG.gunSlide.reactDelay; return true; }          // 銃が滑ってきた音
  if (kind === 'squeak') {                                                                                       // アヒルの声：A が鳴らしたと思って照らす
    const ap = posOf(S.ents.A), ep = posOf(e), D = CFG.duck;
    b.state = 'lit'; b.yawGoal = yawToward(ap.x - ep.x, ap.z - ep.z); b.turnEnd = S.t + D.bTurn + rnd(S, -D.bTurnJit, D.bTurnJit); b.fireTime = b.turnEnd + rnd(S, D.fireMin, D.fireMax);
    pushLog(S, 'bLit', 'Bも驚いてAを照らす');
    S.duelAt = Math.max(S.A.turnEnd, b.turnEnd) + rnd(S, D.fireMin, D.fireMax); S.A.fireTime = b.fireTime = S.duelAt;   // 撃ち合いは同時
    return true;
  }
  return false;
}

function enemyBUpdate(S, dt) {
  const b = S.B, e = S.ents.B, E = CFG.enemy, G = CFG.gunSlide;
  if (b.state === 'seek') {
    if (S.t < b.reactAt) return;
    const gp = posOf(S.ents.gun), p = posOf(e), dx = gp.x - p.x, dz = gp.z - p.z, l = Math.hypot(dx, dz) || 1;
    e.yaw = yawToward(dx, dz); b.heading = { x: dx / l, z: dz / l };
    if (l < G.pickDist) { b.state = 'stoop'; b.stoopT0 = S.t; pushLog(S, 'stoop', '敵Bがかがんで拾おうとする'); return; }
    const st = Math.min(l, b.speed * dt);
    e.hold.x += dx / l * st; e.hold.z += dz / l * st;
  } else if (b.state === 'stoop') {
    const t = S.t - b.stoopT0, pe = S.ents.paint;
    if (t >= G.buttAt && b.bumpAt === null) {            // かがんだお尻が棚に当たる
      b.bumpAt = S.t;
      pushLog(S, 'butt', '敵Bのお尻が棚に当たり棚が揺れる');
      emit(S, { type: 'shelfBump', pos: posOf(S.ents.shelf) });
    }
    if (t >= G.paintAt && b.paintAt === null) {          // 棚の上のペンキ缶が B の頭へ（落ち先は頭の大きさの中でばらつく）
      b.paintAt = S.t; releaseEnt(pe);
      const p = posOf(e), T = G.paintFlight, c = pe.hold;
      b.paintTarget = { x: p.x + rnd(S, -G.paintJit, G.paintJit), y: 1.12, z: p.z + rnd(S, -G.paintJit, G.paintJit) };
      pe.body.velocity.set((b.paintTarget.x - c.x) / T, (b.paintTarget.y - c.y) / T - 0.5 * CFG.phys.gravity * T, (b.paintTarget.z - c.z) / T);
      pe.body.angularVelocity.set(rnd(S, -4, 4), rnd(S, -4, 4), rnd(S, -4, 4));
    }
    if (b.paintAt !== null && S.t >= b.paintAt + G.paintFlight) {
      const cp = posOf(pe), p = posOf(e);
      if (distXZ(cp, p) < 0.4 && cp.y > 0.5 && cp.y < 1.8) {    // すっぽりかぶさる
        pe.captured = true; S.world.remove(pe.body);
        pushLog(S, 'paint', 'ペンキ缶が敵Bの頭にすっぽりかぶさる');
        emit(S, { type: 'paintCap', pos: p });
        b.state = 'blind'; b.blindT0 = S.t + CFG.blind.start;
      } else b.state = 'idle';                                 // 外れたら何も起きない
    }
  } else if (b.state === 'blind') {
    const K = CFG.blind;
    if (b.blindShots < K.shots && S.t >= b.blindT0 + b.blindShots * K.interval) {
      const hp = posOf(S.ents.hero), p = posOf(e), base = yawToward(hp.x - p.x, hp.z - p.z);
      e.yaw = base + rnd(S, -K.yawErr, K.yawErr);              // 前が見えないので、向きがめちゃくちゃ
      const f = yawFwd(e.yaw), pitch = rnd(S, K.pitchLo, K.pitchHi), m = muzzleOf(e);
      if (b.blindShots === 0) pushLog(S, 'blind', '前が見えない敵Bがめちゃくちゃに撃つ');
      b.blindShots++;
      fireGun(S, 'B', m, { x: f.x * Math.cos(pitch), y: Math.sin(pitch), z: f.z * Math.cos(pitch) }, 'blind');
    }
  } else if (b.state === 'lit') {
    turnToward(e, b.yawGoal, E.turnRate, dt);
    if (S.t >= b.turnEnd) b.state = 'standoff';
  } else if (b.state === 'standoff' && S.t >= b.fireTime) {
    b.state = 'fired';
    pushLog(S, 'shootout', '撃ち合い');
    fireGun(S, 'B', muzzleOf(e), aimDir(muzzleOf(e), chestOf(S.ents.A), rnd(S, -CFG.duck.aimErr, CFG.duck.aimErr), rnd(S, -CFG.duck.aimErr, CFG.duck.aimErr)), 'duel');
  } else if (b.state === 'dodge' && S.t >= b.dodgeEnd) endDodge(S, b, e, b.prevState === 'idle' ? 'idle' : b.prevState);
}

// ---------- 濡れた床：起き上がろうとして、すべって転ぶ（くり返し） ----------
function enemyWetLoop(S) {
  const W = CFG.wet;
  for (const [X, e] of [[S.A, S.ents.A], [S.B, S.ents.B]]) {
    if (X.state !== 'frozen' && X.state !== 'down' && X.state !== 'rising') continue;
    if (!X.lp) X.lp = { phase: X.state === 'down' ? 'down' : 'stand', until: S.t + rnd(S, W.riseMin, W.riseMax) };
    if (S.t < X.lp.until) continue;
    if (X.lp.phase === 'down') {                         // 起き上がる
      const p = posOf(e);
      e.hold.x = clamp(p.x, -3.7, 3.7); e.hold.z = clamp(p.z, -4.2, 4.2); e.hold.y = 0.9; e.yaw = rnd(S, -3, 3);
      e.held = true; X.state = 'rising'; X.lp = { phase: 'rising', until: S.t + W.standT };
    } else {                                             // すべって転ぶ
      releaseEnt(e);
      const a = rnd(S, 0, Math.PI * 2);
      e.body.velocity.set(Math.cos(a) * W.push, W.up, Math.sin(a) * W.push);
      e.body.angularVelocity.set(rnd(S, -4, 4), rnd(S, -2, 2), rnd(S, -4, 4));
      X.state = 'down'; X.lp = { phase: 'down', until: S.t + rnd(S, 0.9, 1.4) };
      X.slips = (X.slips || 0) + 1;
      pushLog(S, 'slipLoop', '起き上がろうとした敵が次々すべって転ぶ');
      emit(S, { type: 'slip', pos: posOf(e) });
    }
  }
}
