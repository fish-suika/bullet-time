// ===== 敵の状態と射撃。three.js は使わない =====
// A：aim（主人公を狙う）→ 時刻が来たら撃つ。近くで物が砕けると startled（驚いて反射で撃つ・銃口が跳ねる）。倒れたら down
// B：idle → 音で行動が変わる（allyDown: 振り向いて撃つ / crash: 伏せる / drop: 駆け寄る）。転ぶと slip（暴発）
function newEnemyA(S) {
  return { state: 'aim', fireAt: CFG.time.aFireAt + rnd(S, -CFG.time.aFireJit, CFG.time.aFireJit), panicAt: 0, byBullet: false, noised: false };
}
function newEnemyB(S) {
  const e = S.ents.B;
  return { state: 'idle', reactAt: 0, target: null, speed: CFG.enemy.bRun + rnd(S, -CFG.enemy.bRunJit, CFG.enemy.bRunJit),
    turnEnd: 0, duckEnd: 0, misfireAt: 0, heading: yawFwd(e.yaw), chaseEnd: 0, yawGoal: e.yaw };
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

function enemyAHear(S, kind, pos, loud) {
  const a = S.A, e = S.ents.A;
  if (a.state !== 'aim') return false;
  if (kind === 'crash' && distXZ(posOf(e), pos) < CFG.enemy.startleDist) {
    a.state = 'startled'; a.panicAt = S.t + CFG.enemy.panicDelay;
    pushLog(S, 'startle', '敵が驚く');
    return true;
  }
  return false;
}

function enemyAUpdate(S, dt) {
  const a = S.A, e = S.ents.A, E = CFG.enemy;
  if (a.state === 'aim' && S.t >= a.fireAt) {
    a.state = 'fired';
    pushLog(S, 'aFire', '敵Aが撃つ');
    fireGun(S, 'A', muzzleOf(e), aimDir(muzzleOf(e), chestOf(S.ents.hero), rnd(S, -E.aimErr, E.aimErr), rnd(S, -E.aimErr, E.aimErr)), 'aim');
  } else if (a.state === 'startled' && S.t >= a.panicAt) {
    a.state = 'frozen';                                   // 驚いて撃ったあとは固まる
    fireGun(S, 'A', muzzleOf(e), aimDir(muzzleOf(e), chestOf(S.ents.hero), rnd(S, -0.3, 0.3), E.panicPitch + rnd(S, -E.panicJit, E.panicJit)), 'panic');
    if (S.hero.alive) pushLog(S, 'miss', '銃撃が外れる');
  }
}

function enemyBHear(S, kind, pos, loud) {
  const b = S.B, e = S.ents.B;
  if (b.state !== 'idle' && b.state !== 'duck') return false;
  if (distXZ(posOf(e), pos) > loud * CFG.enemy.hearing) return false;
  const E = CFG.enemy;
  if (kind === 'allyDown') {
    const hp = posOf(S.ents.hero), ep = posOf(e);
    b.state = 'turn'; b.turnEnd = S.t + E.bTurn; b.yawGoal = yawToward(hp.x - ep.x, hp.z - ep.z);
    pushLog(S, 'bTurn', '物音で敵Bが振り向く');
    return true;
  }
  if (kind === 'crash' && b.state === 'idle') { b.state = 'duck'; b.duckEnd = S.t + E.bDuck; return true; }
  if (kind === 'drop' && b.state === 'idle') {
    b.state = 'investigate'; b.reactAt = S.t + rnd(S, E.bReactMin, E.bReactMax); b.chaseEnd = b.reactAt + E.chaseTimeout;
    return true;
  }
  return false;
}

function enemyBUpdate(S, dt) {
  const b = S.B, e = S.ents.B, E = CFG.enemy;
  if (b.state === 'turn') {
    const diff = Math.atan2(Math.sin(b.yawGoal - e.yaw), Math.cos(b.yawGoal - e.yaw));
    e.yaw += Math.sign(diff) * Math.min(Math.abs(diff), dt * 4.5);
    if (S.t >= b.turnEnd) {
      b.state = 'shot'; e.yaw = b.yawGoal;
      pushLog(S, 'bFire', '敵Bが撃つ');
      fireGun(S, 'B', muzzleOf(e), aimDir(muzzleOf(e), chestOf(S.ents.hero), rnd(S, -E.aimErr, E.aimErr), rnd(S, -E.aimErr, E.aimErr)), 'aim');
    }
  } else if (b.state === 'duck') {
    if (S.t >= b.duckEnd) b.state = 'idle';
  } else if (b.state === 'investigate') {
    if (S.t < b.reactAt) return;
    const bp = posOf(S.ents.banana), p = posOf(e);
    const dx = bp.x - p.x, dz = bp.z - p.z, l = Math.hypot(dx, dz) || 1;
    if (l < E.slipDist && bp.y < 0.4) {                    // 踏んだ
      b.state = 'slip'; b.heading = { x: dx / l, z: dz / l };
      releaseEnt(e);
      e.body.velocity.set(-b.heading.x * 2.2, 2.6, -b.heading.z * 2.2);
      e.body.angularVelocity.set(-3 * b.heading.z, 0, 3 * b.heading.x);   // 後ろへのけぞって倒れる
      b.misfireAt = S.t + E.misfireDelay;
      pushLog(S, 'slip', '敵Bが転ぶ');
      emit(S, { type: 'slip', pos: p });
      return;
    }
    if (S.t > b.chaseEnd) { b.state = 'idle'; return; }
    const st = Math.min(l, b.speed * dt);
    e.hold.x += dx / l * st; e.hold.z += dz / l * st;
    e.yaw = yawToward(dx, dz); b.heading = { x: dx / l, z: dz / l };
  } else if (b.state === 'slip') {
    if (S.t >= b.misfireAt) {
      b.state = 'down';                                    // 暴発は 1 回だけ
      const cyl = S.ents.cyl;
      if (cyl.broken) return;
      const p = posOf(e), from = { x: p.x, y: p.y + 0.4, z: p.z }, to = posOf(cyl);
      pushLog(S, 'misfire', '銃が暴発');
      fireGun(S, 'B', from, aimDir(from, to, rnd(S, -E.misfireErr, E.misfireErr), rnd(S, -E.misfireErr, E.misfireErr)), 'misfire');
    }
  }
}
