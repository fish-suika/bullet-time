// ===== カメラ：見回し・弾への追従・寄り・引き画 =====
const CAM = { cam: null, p: { x: 0, y: 2, z: 5 }, l: { x: 0, y: 1.5, z: 0 }, fov: 62, baseFov: 62 };

function camMinFov(aspect) {                       // 横が狭い画面でも左右の対象が入るように、縦の視野を広げる
  return 2 * Math.atan(Math.tan(80 * Math.PI / 360) / aspect) * 180 / Math.PI;
}
// goal: {x,y,z,lx,ly,lz,fov}。k: 追いつく速さ（1 秒あたり）。k が null なら即座に
function camGo(goal, dt, k) {
  const f = k === null ? 1 : Math.min(1, dt * k);
  const C = CAM;
  C.p.x += (goal.x - C.p.x) * f; C.p.y += (goal.y - C.p.y) * f; C.p.z += (goal.z - C.p.z) * f;
  C.l.x += (goal.lx - C.l.x) * f; C.l.y += (goal.ly - C.l.y) * f; C.l.z += (goal.lz - C.l.z) * f;
  C.fov += (goal.fov - C.fov) * f;
}
function camApply(shake) {
  const C = CAM, c = C.cam, s = shake || 0;
  c.position.set(C.p.x + rr(s * 0.15), C.p.y + rr(s * 0.15), C.p.z + rr(s * 0.15));
  c.lookAt(C.l.x, C.l.y, C.l.z);
  const fov = Math.max(C.fov, camMinFov(c.aspect));
  if (Math.abs(c.fov - fov) > 0.01) { c.fov = fov; c.updateProjectionMatrix(); }
}
function camWide() { const w = CFG.camera.wide; return { x: w.x, y: w.y, z: w.z, lx: w.lx, ly: w.ly, lz: w.lz, fov: w.fov }; }
function camFreeze() { const w = CFG.camera.freeze; return { x: w.x, y: w.y, z: w.z, lx: w.lx, ly: w.ly, lz: w.lz, fov: w.fov }; }
// 弾の斜め後ろから追う。near（0〜1）が大きいほど近く・狭く
function camFollow(pos, dir, near) {
  const f = CFG.camera.follow, n = CFG.camera.near, k = near || 0;
  const back = f.back + (n.back - f.back) * k, up = f.up + (n.up - f.up) * k, side = f.side + (n.side - f.side) * k;
  const sx = dir.z, sz = -dir.x, sl = Math.hypot(sx, sz) || 1;       // 進行方向の右
  return { x: pos.x - dir.x * back + sx / sl * side, y: pos.y - dir.y * back + up, z: pos.z - dir.z * back + sz / sl * side,
    lx: pos.x + dir.x * 1.5, ly: pos.y + dir.y * 1.5, lz: pos.z + dir.z * 1.5, fov: CFG.camera.fov + (n.fov - CFG.camera.fov) * k };
}
// 状況を見る：部屋をゆっくり見回す（u: 0〜1）
function camIntro(u) {
  const e = u * u * (3 - 2 * u);
  return { x: -3.6 + e * 6.2, y: 2.9 - e * 0.5, z: 4.3, lx: -0.8 + e * 2.4, ly: 1.3, lz: -2.4, fov: 66 };
}
