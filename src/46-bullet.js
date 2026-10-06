// ===== 弾の経路と、分岐点での選択（画面上の向き）。three.js は使わない =====
const BUL = {
  // 時間の割合 tau(0〜1) → 経路の割合 u(0〜1)。経路の後ろのほう（nearFrac から先）は nearSpeed 倍の速さになる（近づいたらさらにスロー）
  u(tau) {
    const B = CFG.bullet, f = B.nearFrac, s = B.nearSpeed, tn = (1 - f) / s, total = f + tn, p = Math.max(0, Math.min(1, tau)) * total;
    return p <= f ? p : f + (p - f) * s;
  },
  // 近いか（寄りのカメラ・風切り音を強める割合 0〜1）
  near(u) { const f = CFG.bullet.nearFrac; return Math.max(0, Math.min(1, (u - f * 0.8) / (1 - f * 0.8))); },
  // 分岐点から対象へ曲がって飛ぶ 2 次ベジェ
  curve(from, to) {
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z, l = Math.hypot(dx, dy, dz);
    const sx = dz / (Math.hypot(dx, dz) || 1), sz = -dx / (Math.hypot(dx, dz) || 1);   // 進行方向の横
    const k = CFG.bullet.curve * l;
    return { p0: from, p1: to, c: { x: (from.x + to.x) / 2 + sx * k, y: (from.y + to.y) / 2 + k * 0.5, z: (from.z + to.z) / 2 + sz * k } };
  },
  at(cv, u) {
    const a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, c = u * u;
    return { x: a * cv.p0.x + b * cv.c.x + c * cv.p1.x, y: a * cv.p0.y + b * cv.c.y + c * cv.p1.y, z: a * cv.p0.z + b * cv.c.z + c * cv.p1.z };
  },
};

// 画面上の向き dir（{x,y}。y は下が正）にある、次の対象を選ぶ。items: [{id, x, y}]（画面の座標）
function pickDir(items, curId, dir) {
  const cur = items.find(i => i.id === curId);
  if (!cur) return curId;
  let best = null, bestScore = 1e9;
  for (const it of items) {
    if (it.id === curId) continue;
    const vx = it.x - cur.x, vy = it.y - cur.y, l = Math.hypot(vx, vy);
    if (l < 1) continue;
    const cos = (vx * dir.x + vy * dir.y) / l;
    if (cos < 0.35) continue;                              // 向きがだいぶ違うものは選ばない
    const score = l * (2 - cos);
    if (score < bestScore) { bestScore = score; best = it.id; }
  }
  return best || curId;
}
