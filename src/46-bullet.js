// ===== 弾の経路と、分岐点での選択（画面上の向き）。three.js は使わない =====
const BUL = {
  // 時間の割合 tau(0〜1) → 経路の割合 u(0〜1)。経路の後ろのほう（nearFrac から先）は nearSpeed 倍の速さになる（近づいたらさらにスロー）
  u(tau) {
    const B = CFG.bullet, f = B.nearFrac, s = B.nearSpeed, tn = (1 - f) / s, total = f + tn, p = Math.max(0, Math.min(1, tau)) * total;
    return p <= f ? p : f + (p - f) * s;
  },
  // 近いか（寄りのカメラ・風切り音を強める割合 0〜1）
  near(u) { const f = CFG.bullet.nearFrac; return Math.max(0, Math.min(1, (u - f * 0.8) / (1 - f * 0.8))); },
  // 分岐点から対象へ曲がって飛ぶ 2 次ベジェ（off を渡さなければ、ふつうの曲がり方）。a は進行方向の横、b は上へのふくらみ
  base(from, to, a, b) {
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z, l = Math.hypot(dx, dy, dz);
    const sx = dz / (Math.hypot(dx, dz) || 1), sz = -dx / (Math.hypot(dx, dz) || 1);   // 進行方向の横
    const k = CFG.bullet.curve * l;
    if (a === undefined) { a = k; b = k * 0.5; }
    return { p0: from, p1: to, c: { x: (from.x + to.x) / 2 + sx * a, y: (from.y + to.y) / 2 + b, z: (from.z + to.z) / 2 + sz * a }, a, b };
  },
  // よけるべきもの（人・棚・ドラム缶・ランプ・ボンベなど）の箱。対象そのものは入れない。配置から作る（three.js は使わない）
  obstacles(id) {
    const out = [];
    for (const k in STAGE1.ents) {
      if (k === id || k === 'flash') continue;
      const d = STAGE1.ents[k], h = d.half || [d.radius, d.radius, d.radius];
      out.push({ id: k, min: [d.pos[0] - h[0], d.pos[1] - h[1], d.pos[2] - h[2]], max: [d.pos[0] + h[0], d.pos[1] + h[1], d.pos[2] + h[2]] });
    }
    return out;
  },
  // 経路といちばん近いものとのすき間（箱までの距離の最小値）。対象の近く（終点から 0.6m）は、近づいてよいので数えない
  gap(cv, id) {
    const obs = BUL.obstacles(id); let g = 1e9, who = null;
    for (let i = 0; i <= 80; i++) {
      const p = BUL.at(cv, i / 80);
      if (Math.hypot(p.x - cv.p1.x, p.y - cv.p1.y, p.z - cv.p1.z) < 0.6) continue;
      for (const o of obs) {
        const dx = Math.max(o.min[0] - p.x, 0, p.x - o.max[0]), dy = Math.max(o.min[1] - p.y, 0, p.y - o.max[1]), dz = Math.max(o.min[2] - p.z, 0, p.z - o.max[2]);
        const d = Math.hypot(dx, dy, dz); if (d < g) { g = d; who = o.id; }
      }
    }
    return { gap: g, who };
  },
  // よける経路：ふつうの曲がり方がぶつかるなら、制御点を（横の両側・上へ）少しずつずらして、すき間が CFG.bullet.clearance 以上になる一番小さな変更を探す。終点は変わらない
  curve(from, to, id) {
    const def = BUL.base(from, to);
    if (!id) return def;
    BUL._cache = BUL._cache || {};
    const key = id + '|' + from.x + ',' + from.y + ',' + from.z;
    if (BUL._cache[key]) return BUL._cache[key];
    const need = CFG.bullet.clearance;
    let best = def, bestGap = BUL.gap(def, id).gap;
    if (bestGap < need) {
      const cands = [];
      for (let da = -5; da <= 5.001; da += 0.2) for (let db = 0; db <= 3; db += 0.25) cands.push([da, db, Math.hypot(da, db * 2)]);
      cands.sort((x, y) => x[2] - y[2]);
      for (const [da, db] of cands) {
        const cv = BUL.base(from, to, def.a + da, def.b + db), g = BUL.gap(cv, id).gap;
        if (g > bestGap) { best = cv; bestGap = g; }
        if (g >= need) { best = cv; bestGap = g; break; }
      }
    }
    best.gapValue = bestGap;
    return (BUL._cache[key] = best);
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
