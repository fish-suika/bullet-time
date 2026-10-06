// ===== 検証ハーネス =====
const __results = [], __info = [];
function test(name, fn) {
  try { fn(); __results.push({ name, ok: true }); }
  catch (e) { __results.push({ name, ok: false, why: e.message }); }
}
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error((label ? label + ': ' : '') + 'expected ' + b + ' but got ' + a);
}
function near(actual, expected, tol, label) {
  if (!(Math.abs(actual - expected) <= tol)) throw new Error((label ? label + ': ' : '') + 'expected ' + expected + ' ±' + tol + ' but got ' + actual);
}
function info(s) { __info.push(s); }

// ===== 道具 =====
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
// 配置を少し揺らした STAGE1（乱数で）。jit=0 なら元のまま
function jitterStage(seed, jit) {
  const st = JSON.parse(JSON.stringify(STAGE1)), r = mulberry32(seed * 7919 + 13), j = (a) => (r() * 2 - 1) * a * jit;
  const E = st.ents;
  E.A.pos[0] += j(0.1); E.A.pos[2] += j(0.1);
  E.B.pos[0] += j(0.25); E.B.pos[2] += j(0.25); E.B.yaw += j(0.4);
  const sx = j(0.08), sz = j(0.08);
  E.shelf.pos[0] += sx; E.shelf.pos[2] += sz;
  E.drum.pos[0] += j(0.15); E.drum.pos[2] += j(0.15);
  E.ext.pos[0] += j(0.15); E.ext.pos[2] += j(0.15);
  E.duck.pos[0] += j(0.03);
  E.cyl.pos[0] += j(0.15); E.cyl.pos[2] += j(0.15);
  return st;
}
function runSim(target, seed, jit) {
  const S = newSim(jitterStage(seed, jit === undefined ? 1 : jit), mulberry32(seed + 1));
  simShoot(S, target);
  let n = 0;
  while (S.state === 'running' && n++ < 60 * 14) simStep(S, CFG.time.step);
  return S;
}
function texts(S) { return S.log.map(l => l.text); }

// ===== 弾の経路・選択 =====
test('弾の速さ：u(0)=0、u(1)=1、単調で、近づくと遅くなる', () => {
  near(BUL.u(0), 0, 1e-9); near(BUL.u(1), 1, 1e-9);
  let prev = -1; for (let i = 0; i <= 20; i++) { const u = BUL.u(i / 20); if (u < prev) throw new Error('逆戻り'); prev = u; }
  const far = BUL.u(0.2) - BUL.u(0.1), nr = BUL.u(0.95) - BUL.u(0.85);
  eq(nr < far * 0.6, true, '近い間は遅い');
});
test('曲がる経路：始点と終点を通り、途中で直線から離れる', () => {
  const cv = BUL.curve(STAGE1.branch, STAGE1.targets[2].aim);
  const a = BUL.at(cv, 0), b = BUL.at(cv, 1), m = BUL.at(cv, 0.5);
  near(a.x, STAGE1.branch.x, 1e-9); near(b.z, STAGE1.targets[2].aim.z, 1e-9);
  const lx = (a.x + b.x) / 2, ly = (a.y + b.y) / 2, lz = (a.z + b.z) / 2;
  eq(Math.hypot(m.x - lx, m.y - ly, m.z - lz) > 0.2, true, '直線ではない');
});
test('選択：画面の向きで次の対象へ移る（左は近いバナナから、さらに左で瓶）', () => {
  const items = [{ id: 'A', x: 500, y: 300 }, { id: 'lamp', x: 500, y: 100 }, { id: 'banana', x: 250, y: 380 }, { id: 'bottle', x: 170, y: 360 }];
  eq(pickDir(items, 'A', { x: -1, y: 0 }), 'banana');
  eq(pickDir(items, 'banana', { x: -1, y: 0 }), 'bottle');
  eq(pickDir(items, 'A', { x: 0, y: -1 }), 'lamp');
  eq(pickDir(items, 'lamp', { x: 0, y: 1 }), 'A');
  eq(pickDir(items, 'bottle', { x: 1, y: 0 }), 'banana');
  eq(pickDir(items, 'A', { x: 1, y: 0 }), 'A', '右には何もない → そのまま');
});

// ===== レイキャスト・配置 =====
test('レイキャスト：主人公に当たる／手前に敵 A がいると遮られる／天井へ撃つと天井に当たる', () => {
  const S = newSim(STAGE1, mulberry32(1));
  let r = castRay(S, { x: 0, y: 1.0, z: -2.5 }, { x: 0, y: 0, z: -1 }, 'A');
  eq(r.ent && r.ent.id, 'hero');
  r = castRay(S, { x: 0, y: 1.0, z: -0.2 }, { x: 0, y: 0, z: -1 }, null);
  eq(r.ent && r.ent.id, 'A', 'A が手前で遮る');
  r = castRay(S, { x: 1.5, y: 1.3, z: -2 }, { x: 0, y: 1, z: 0 }, 'A');
  eq([r.ent === null, r.surface], [true, 'ceiling']);
});
test('配置：A の銃口からガスボンベへ撃つと、遮られずにボンベに当たる（① の暴発）', () => {
  const S = newSim(STAGE1, mulberry32(1));
  const m = muzzleOf(S.ents.A), c = posOf(S.ents.cyl);
  const r = castRay(S, m, aimDir(m, c, 0, 0), 'A');
  eq(r.ent && r.ent.id, 'cyl');
});
test('配置：ボンベの爆発の致死範囲に主人公が入り、A も B も爆風の範囲にいる', () => {
  const S = newSim(STAGE1, mulberry32(1)), c = posOf(S.ents.cyl);
  eq(dist3(posOf(S.ents.hero), c) < CFG.blast.lethal, true, '主人公');
  eq(dist3(posOf(S.ents.A), c) < CFG.blast.radius && dist3(posOf(S.ents.B), c) < CFG.blast.radius, true, 'A・B');
});
test('配置：撃てる対象が 4 つ（A・消火器・アヒル・ガスボンベ）', () => {
  eq(STAGE1.targets.map(t => t.id), ['A', 'ext', 'duck', 'cyl']);
  eq(yawToward(0, -1), 0); near(yawToward(1, 0), -Math.PI / 2, 1e-9);
});

test('弾の経路：どの対象でも、対象以外の人・棚・ドラム缶などとのすき間が clearance 以上で、終点は対象にぴったり', () => {
  const rows = [];
  for (const t of STAGE1.targets) {
    const before = BUL.gap(BUL.base(STAGE1.branch, t.aim), t.id), cv = BUL.curve(STAGE1.branch, t.aim, t.id), after = BUL.gap(cv, t.id), end = BUL.at(cv, 1);
    rows.push(t.id + ' ' + before.gap.toFixed(2) + '→' + after.gap.toFixed(2) + 'm');
    eq(after.gap >= CFG.bullet.clearance - 1e-6, true, t.id + ' のすき間 ' + after.gap.toFixed(2) + '（' + after.who + '）');
    near(end.x, t.aim.x, 1e-9, t.id + ' 終点 x'); near(end.y, t.aim.y, 1e-9, t.id + ' 終点 y'); near(end.z, t.aim.z, 1e-9, t.id + ' 終点 z');
  }
  info('弾の経路のすき間（ふつうの曲がり方 → よける曲がり方）  ' + rows.join('  '));
});
// ===== 4 つの未来（基準：配置を揺らさない・乱数 1 つ） =====
test('① 敵 A を撃つ：撃たれた拍子に狙いがずれる→弾が主人公の横のガスボンベに命中→大爆発で主人公も吹き飛ぶ（GAME OVER）', () => {
  const S = runSim('A', 1, 0);
  eq(texts(S), ['敵A', '撃たれた拍子に敵Aの狙いがずれる', '弾が主人公の横のガスボンベに命中', '大爆発で全員吹き飛ぶ']);
  eq(S.result.ok, false); eq(S.result.sub, '主人公も吹き飛んだ'); eq(S.hero.killedBy, 'blast');
  eq([S.A.state, S.B.state], ['down', 'down'], '全員吹き飛んだ');
});
test('① 爆発で主人公が椅子ごと実際に飛ぶ（1.5m 以上動いて宙に浮く）。ほかの未来（②③）では動かない', () => {
  const S = newSim(STAGE1, mulberry32(1)); simShoot(S, 'A'); const h0 = posOf(S.ents.hero); let maxY = 0, n = 0;
  while (S.state === 'running' && n++ < 900) { simStep(S, CFG.time.step); if (S.exploded) maxY = Math.max(maxY, posOf(S.ents.hero).y); }
  eq(dist3(posOf(S.ents.hero), h0) > 1.5, true, '主人公の移動 ' + dist3(posOf(S.ents.hero), h0).toFixed(2) + 'm'); eq(maxY > 1.2, true, '最高 ' + maxY.toFixed(2));
  for (const id of ['ext', 'duck']) { const T = runSim(id, 1, 0); eq(dist3(posOf(T.ents.hero), { x: 0, y: 0.7, z: -4.15 }) < 0.05, true, id + ' で主人公は動かない'); }
});
test('爆発のルール：プレイヤーの弾（④）ではボンベは爆発しない。爆発するのは A の暴発の弾だけ', () => {
  const S = runSim('cyl', 1, 0);
  eq(S.exploded, false);
  const T = newSim(STAGE1, mulberry32(1)), m = muzzleOf(T.ents.A), c = posOf(T.ents.cyl);
  fireGun(T, 'B', m, aimDir(m, c, 0, 0), 'aim');                  // B の弾・ふつうの弾では火がつかない
  eq(T.ignite.at, null);
  fireGun(T, 'A', m, aimDir(m, c, 0, 0), 'discharge');
  eq(T.ignite.at !== null, true);
});
test('② 消火器：ロケットのように飛ぶ→A の顔面に直撃→A が吹っ飛んで B を巻き込む（CLEAR）', () => {
  const S = runSim('ext', 1, 0);
  eq(texts(S), ['消火器', '消火器がロケットのように飛ぶ', '敵Aの顔面に直撃', 'Aが吹っ飛んでBを巻き込む', '主人公 生存']);
  eq(S.result.ok, true); eq(S.result.sub, '地味な物が一番強い');
  eq(S.log.some(x => x.key === 'aFire'), false, 'A は撃たない');
});
test('③ アヒル：鳴く→A と B が驚いて撃ち合う→2 人とも倒れる（CLEAR「敵が勝手に全滅」）', () => {
  const S = runSim('duck', 1, 0);
  eq(texts(S), ['ゴムのアヒル', 'アヒルが「ピーッ」と鳴く', '敵AとBが驚いて撃ち合う', '2人とも倒れる', '主人公 生存']);
  eq(S.result.ok, true); eq(S.result.sub, '敵が勝手に全滅'); eq([S.A.state, S.B.state], ['down', 'down']);
});
test('④ ガスボンベ：爆発せず、ロケットになって跳ね回る→主人公に直撃（GAME OVER）', () => {
  const S = runSim('cyl', 1, 0);
  eq(texts(S), ['ガスボンベ', '爆発せず、ロケットになって跳ね回る', '主人公に直撃']);
  eq(S.result.ok, false); eq(S.hero.killedBy, 'cyl'); eq(S.result.sub, 'いちばん派手な方法で失敗');
});
test('字幕は各未来で 2〜3 ステップ（対象の名前と結果の行を除く）', () => {
  for (const id of ['A', 'ext', 'duck', 'cyl']) {
    const n = runSim(id, 3, 0).log.filter(l => l.key !== 'target' && l.key !== 'end').length;
    eq(n >= 2 && n <= 3, true, id + ' のステップ数 ' + n);
  }
});

// ===== 20 回ずつ（配置と乱数を揺らす） =====
const RUNS = 20, COUNT = {};
for (const id of ['A', 'ext', 'duck', 'cyl']) {
  let ok = 0; for (let i = 0; i < RUNS; i++) if (runSim(id, 100 + i, 1).result.ok) ok++;
  COUNT[id] = ok;
}
info('20 回の CLEAR の数（配置・乱数を揺らす）  ① 敵A ' + COUNT.A + '/20  ② 消火器 ' + COUNT.ext + '/20  ③ アヒル ' + COUNT.duck + '/20  ④ ガスボンベ ' + COUNT.cyl + '/20');
{
  const wide = {};
  for (const id of ['A', 'ext', 'duck', 'cyl']) { let ok = 0; for (let i = 0; i < RUNS; i++) if (runSim(id, 300 + i, 2.5).result.ok) ok++; wide[id] = ok; }
  info('揺らしを 2.5 倍にしたとき（合否には使わない）  ① ' + wide.A + '/20  ② ' + wide.ext + '/20  ③ ' + wide.duck + '/20  ④ ' + wide.cyl + '/20');
}
test('① 敵 A は 20 回すべて GAME OVER（大爆発）', () => { eq(COUNT.A, 0); });
test('② 消火器は 20 回すべて CLEAR', () => { eq(COUNT.ext, 20); });
test('③ アヒルは 20 回すべて CLEAR', () => { eq(COUNT.duck, 20); });
test('④ ガスボンベは 20 回すべて GAME OVER', () => { eq(COUNT.cyl, 0); });
test('④ ロケットは主人公に当たる前に、壁・天井・床で 3 回以上跳ね返る（20 回すべて・主人公への直撃で終わる）', () => {
  const bs = [], ts = [];
  for (let i = 0; i < RUNS; i++) {
    const S = runSim('cyl', 100 + i, 1);
    eq(S.hero.killedBy, 'cyl', '回 ' + i + ' の死因');
    bs.push(S.hero.bouncesAtHit); ts.push(S.hero.hitAt);
  }
  info('④ 主人公に当たるまでの跳ね返り回数（20 回）最小 ' + Math.min(...bs) + ' 最大 ' + Math.max(...bs) + ' 平均 ' + (bs.reduce((a, b) => a + b, 0) / RUNS).toFixed(1) + '／当たるまでの内部時間 最大 ' + Math.max(...ts).toFixed(1) + ' 秒');
  eq(Math.min(...bs) >= 3, true, '最小 ' + Math.min(...bs));
});

test('④ ロケットは部屋を回る：4 回以上、3 つ以上の別々の面で跳ね返り、続く跳ね返りの点は 2m 以上離れ、最後は主人公に当たる（20 回）', () => {
  const rows = [], surfs = {};
  for (let i = 0; i < RUNS; i++) {
    const S = runSim('cyl', 100 + i, 1), P = S.rocket.pts;
    eq(S.hero.killedBy, 'cyl', '回 ' + i + ' の死因');
    eq(P.length >= 4, true, '回 ' + i + ' の跳ね返り ' + P.length);
    const ss = new Set(P.map(q => q.surf)); eq(ss.size >= 3, true, '回 ' + i + ' の面 ' + [...ss].join(','));
    let minGap = 1e9; for (let j = 1; j < P.length; j++) minGap = Math.min(minGap, dist3(P[j], P[j - 1]));
    eq(minGap >= 2, true, '回 ' + i + ' の最短の間隔 ' + minGap.toFixed(2));
    rows.push({ n: P.length, k: ss.size, g: minGap }); for (const q of P) surfs[q.surf] = (surfs[q.surf] || 0) + 1;
  }
  info('④ 跳ね返り回数 ' + Math.min(...rows.map(r => r.n)) + '〜' + Math.max(...rows.map(r => r.n)) + '／別の面の数 最小 ' + Math.min(...rows.map(r => r.k)) + '／続く点の間隔 最小 ' + Math.min(...rows.map(r => r.g)).toFixed(2) + 'm／面ごとの回数（20 回の合計） ' + JSON.stringify(surfs));
  const S0 = runSim('cyl', 100, 1); info('④ 基準の 1 回：' + S0.rocket.pts.map(q => q.surf + '(' + q.x.toFixed(1) + ',' + q.y.toFixed(1) + ',' + q.z.toFixed(1) + ')').join(' → ') + '／主人公に当たるまで内部 ' + S0.hero.hitAt.toFixed(2) + ' 秒');
});
test('② 消火器が A に当たる向きと、A が吹っ飛ぶ向きの角度は 20° 以下（20 回）。消火器は最後ほぼ水平', () => {
  const an = [], el = [];
  for (let i = 0; i < RUNS; i++) {
    const S = runSim('ext', 100 + i, 1), x = S.ext, u = x.impV, w = x.aV;
    eq(!!(u && w), true, '回 ' + i + ' 直撃した');
    const ang = Math.acos((u.x * w.x + u.y * w.y + u.z * w.z) / (Math.hypot(u.x, u.y, u.z) * Math.hypot(w.x, w.y, w.z))) * 180 / Math.PI;
    an.push(ang); el.push(Math.atan2(u.y, Math.hypot(u.x, u.z)) * 180 / Math.PI);
    eq(ang <= 20, true, '回 ' + i + ' の角度 ' + ang.toFixed(1));
  }
  info('② 角度（消火器の速度 vs A の飛ぶ向き）最大 ' + Math.max(...an).toFixed(1) + '° 平均 ' + (an.reduce((a, b) => a + b, 0) / RUNS).toFixed(1) + '°／消火器の当たる直前の仰角 ' + Math.min(...el).toFixed(1) + '〜' + Math.max(...el).toFixed(1) + '°');
});

// ===== リトライの軽さ =====
test('シミュレーションの作り直しは速い（20 回の平均）', () => {
  const t0 = performance.now(); for (let i = 0; i < 20; i++) newSim(STAGE1, mulberry32(i));
  const ms = (performance.now() - t0) / 20;
  info('newSim 1 回 ' + ms.toFixed(2) + ' ms');
  eq(ms < 50, true, ms + ' ms');
});

// ===== 結果表示 =====
(function () {
  const out = document.getElementById('out');
  let pass = 0;
  for (const r of __results) {
    const d = document.createElement('div');
    d.className = 'r ' + (r.ok ? 'ok' : 'ng');
    d.textContent = r.name;
    out.appendChild(d);
    if (r.ok) pass++;
    else { const w = document.createElement('div'); w.className = 'why'; w.textContent = r.why; out.appendChild(w); }
  }
  for (const s of __info) { const d = document.createElement('div'); d.className = 'info'; d.textContent = s; out.appendChild(d); }
  const sum = pass + '/' + __results.length;
  document.getElementById('sum').textContent = (pass === __results.length ? 'すべて通過 ' : '失敗あり ') + sum;
  document.title = (pass === __results.length ? 'PASS ' : 'FAIL ') + sum;
})();
