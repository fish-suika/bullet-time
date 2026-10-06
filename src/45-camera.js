// ===== カメラ：見回し・弾への追従・寄り・引き画（縦長の画面用） =====
// fov は「横の視野角」で持つ。縦の視野角は画面の縦横比から求める（縦長でも横に同じだけ入る）
const CAM = { cam: null, p: { x: 0, y: 2, z: 5 }, l: { x: 0, y: 1.5, z: 0 }, fov: 60 };

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
  const v = Math.min(118, 2 * Math.atan(Math.tan(C.fov * Math.PI / 360) / c.aspect) * 180 / Math.PI);
  if (Math.abs(c.fov - v) > 0.01) { c.fov = v; c.updateProjectionMatrix(); }
}
function camShot(w) { return { x: w.x, y: w.y, z: w.z, lx: w.lx, ly: w.ly, lz: w.lz, fov: w.fov }; }
function camWide() { return camShot(CFG.camera.wide); }
function camFreeze() { return camShot(CFG.camera.freeze); }
// 弾の斜め後ろから追う。near（0〜1）が大きいほど近く・狭く
function camFollow(pos, dir, near) {
  const f = CFG.camera.follow, n = CFG.camera.near, k = near || 0;
  const back = f.back + (n.back - f.back) * k, up = f.up + (n.up - f.up) * k, side = f.side + (n.side - f.side) * k;
  const sx = dir.z, sz = -dir.x, sl = Math.hypot(sx, sz) || 1;       // 進行方向の右
  return { x: pos.x - dir.x * back + sx / sl * side, y: pos.y - dir.y * back + up, z: pos.z - dir.z * back + sz / sl * side,
    lx: pos.x + dir.x * 1.5, ly: pos.y + dir.y * 1.5, lz: pos.z + dir.z * 1.5, fov: CFG.camera.follow.fov + (n.fov - CFG.camera.follow.fov) * k };
}
// 状況を見る：部屋をゆっくり見回す（u: 0〜1）。机 → 敵 A と主人公 → 敵 B の順に縦へ・横へ
function camIntro(u) {
  const e = u * u * (3 - 2 * u);
  return { x: -0.8 + e * 1.6, y: 3.4 - e * 0.5, z: 4.5, lx: -1.0 + e * 3.0, ly: 1.1, lz: 0.2 - e * 3.6, fov: 58 };
}
