// ===== 敵の状態と射撃。three.js は使わない =====
// A：aim（主人公を狙い、時刻が来たら撃つ）／turn → standoff → fired（アヒルの声で B に振り向いて撃ち合う）／down／dodge（ロケットが来たら伏せる）
// B：idle（窓を見張る）／lit → standoff → fired（アヒルの声で A を照らして撃ち合う）／down／dodge
function newEnemyA(S) {
  return { state: 'aim', fireAt: CFG.time.aFireAt + rnd(S, -CFG.time.aFireJit, CFG.time.aFireJit),
    yawGoal: 0, turnEnd: 0, fireTime: 0, removed: false };
}
function newEnemyB(S) {
  const e = S.ents.B;
  return { state: 'idle', yawGoal: e.yaw, turnEnd: 0, fireTime: 0, removed: false };
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
    emit(S, { type: 'speech', who: 'A', text: '誰だ！' });
    return true;
  }
  return false;
}

function enemyAUpdate(S, dt) {
  const a = S.A, e = S.ents.A, E = CFG.enemy;
  if (!S.hero.alive && a.state === 'aim') return;
  if (S.rocket.on && a.state === 'aim') return;                 // ④ ロケットが跳ね回っている間、A は撃たない（よけている）
  if (a.state === 'aim' && S.t >= a.fireAt) {
    a.state = 'fired';
    pushLog(S, 'aFire', '敵Aが撃つ');
    fireGun(S, 'A', muzzleOf(e), aimDir(muzzleOf(e), chestOf(S.ents.hero), rnd(S, -E.aimErr, E.aimErr), rnd(S, -E.aimErr, E.aimErr)), 'aim');
  } else if (a.state === 'turn') {
    turnToward(e, a.yawGoal, 6, dt);
    if (S.t >= a.turnEnd) a.state = 'standoff';
  } else if (a.state === 'standoff' && S.t >= a.fireTime) {
    a.state = 'fired';
    pushLog(S, 'shootout', '敵AとBが驚いて撃ち合う');
    fireGun(S, 'A', muzzleOf(e), aimDir(muzzleOf(e), chestOf(S.ents.B), rnd(S, -CFG.duck.aimErr, CFG.duck.aimErr), rnd(S, -CFG.duck.aimErr, CFG.duck.aimErr)), 'duel');
  } else if (a.state === 'dodge' && S.t >= a.dodgeEnd) endDodge(S, a, e, a.prevState);
}

// ---------- 敵 B ----------
function enemyBHear(S, kind, pos, loud) {
  const b = S.B, e = S.ents.B;
  if (b.state !== 'idle') return false;
  if (distXZ(posOf(e), pos) > loud * CFG.enemy.hearing) return false;
  if (kind === 'squeak') {                                                                                       // アヒルの声：A が鳴らしたと思って照らす
    const ap = posOf(S.ents.A), ep = posOf(e), D = CFG.duck;
    b.state = 'lit'; b.yawGoal = yawToward(ap.x - ep.x, ap.z - ep.z); b.turnEnd = S.t + D.bTurn + rnd(S, -D.bTurnJit, D.bTurnJit);
    S.duelAt = Math.max(S.A.turnEnd, b.turnEnd) + rnd(S, D.fireMin, D.fireMax); S.A.fireTime = b.fireTime = S.duelAt;   // 撃ち合いは同時
    return true;
  }
  return false;
}

function enemyBUpdate(S, dt) {
  const b = S.B, e = S.ents.B, E = CFG.enemy;
  if (b.state === 'lit') {
    turnToward(e, b.yawGoal, E.turnRate, dt);
    if (S.t >= b.turnEnd) b.state = 'standoff';
  } else if (b.state === 'standoff' && S.t >= b.fireTime) {
    b.state = 'fired';
    pushLog(S, 'shootout', '敵AとBが驚いて撃ち合う');
    fireGun(S, 'B', muzzleOf(e), aimDir(muzzleOf(e), chestOf(S.ents.A), rnd(S, -CFG.duck.aimErr, CFG.duck.aimErr), rnd(S, -CFG.duck.aimErr, CFG.duck.aimErr)), 'duel');
  } else if (b.state === 'dodge' && S.t >= b.dodgeEnd) endDodge(S, b, e, b.prevState);
}
