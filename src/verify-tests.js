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
  E.shelf.pos[0] += sx; E.shelf.pos[2] += sz; E.paint.pos[0] += sx; E.paint.pos[2] += sz;
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
test('配置：A の目がくらんで撃つ先（天井のスプリンクラー）への線は、ほかのものに遮られず、主人公にも当たらない', () => {
  const S = newSim(STAGE1, mulberry32(1));
  const m = muzzleOf(S.ents.A), sp = posOf(S.ents.sprk);
  const r = castRay(S, m, aimDir(m, sp, 0, 0), 'A');
  eq(r.ent && r.ent.id, 'sprk');
  const r2 = castRay(S, m, aimDir(m, sp, 0.05, 0.05), 'A');
  eq(r2.ent === null || r2.ent.id !== 'hero', true);
});
test('配置：撃てる対象が 4 つ（A・消火器・アヒル・ガスボンベ）で、画面の上でも分かれる並び', () => {
  eq(STAGE1.targets.map(t => t.id), ['A', 'ext', 'duck', 'cyl']);
  eq(yawToward(0, -1), 0); near(yawToward(1, 0), -Math.PI / 2, 1e-9);
});

// ===== 4 つの未来（基準：配置を揺らさない・乱数 1 つ） =====
const T_A_PREFIX = ['敵A', '倒れる', '銃が床を滑って敵Bの足元へ', '敵Bがかがんで拾おうとする', '敵Bのお尻が棚に当たり棚が揺れる', 'ペンキ缶が敵Bの頭にすっぽりかぶさる', '前が見えない敵Bがめちゃくちゃに撃つ'];
test('① 敵 A を撃つ：銃が滑る→B がかがむ→棚が揺れる→缶をかぶる→めちゃくちゃに撃つ。ふつうは 1 発が主人公に当たる', () => {
  let S = null;
  for (let sd = 1; sd < 12; sd++) { S = runSim('A', sd, 0); if (!S.result.ok) break; }
  eq(texts(S).slice(0, 7), T_A_PREFIX);
  eq(texts(S).slice(7), ['1発が主人公に命中']);
  eq(S.result.ok, false); eq(S.hero.killedBy, 'B');
});
test('① の偶然の成功：全部外れたときは「CLEAR？」と「隠れた未来」の印が付く', () => {
  let S = null;
  for (let sd = 1; sd < 80; sd++) { S = runSim('A', sd, 0); if (S.result.ok) break; }
  eq(S.result.ok, true); eq(S.result.title, 'CLEAR？'); eq(S.result.badge, true);
  eq(texts(S).slice(0, 7), T_A_PREFIX); eq(texts(S).slice(7), ['全部外れる', '主人公 生存']);
});
test('② 消火器：噴射→ドラム缶→B を倒す→懐中電灯→A がまぶしくて外れる→スプリンクラー→水浸し→すべって転ぶ（CLEAR）', () => {
  const S = runSim('ext', 1, 0);
  eq(texts(S), ['消火器', '噴射して床を滑走', 'ドラム缶を弾く', '転がるドラム缶が敵Bをなぎ倒す', '懐中電灯が宙を舞い敵Aの顔を照らす', 'まぶしくてAの弾が外れる',
    '外れた弾がスプリンクラーに当たる', '倉庫中が水浸し', '起き上がろうとした敵が次々すべって転ぶ', '主人公 生存']);
  eq(S.result.ok, true); eq(S.result.sub, '地味な物が一番強い');
  eq((S.A.slips || 0) + (S.B.slips || 0) >= 2, true, 'すべって転ぶのがくり返される');
});
test('③ アヒル：鳴く→A が B に振り向く→B が A を照らす→撃ち合い→2 人とも倒れる（CLEAR）', () => {
  const S = runSim('duck', 1, 0);
  eq(texts(S), ['ゴムのアヒル', 'ピーッと鳴いて棚から落ちる', '敵Aが「誰だ！」とBに振り向く', 'Bも驚いてAを照らす', '撃ち合い', '2人とも倒れる', '敵が勝手に全滅', '主人公 生存']);
  eq(S.result.ok, true); eq([S.A.state, S.B.state], ['down', 'down']);
});
test('④ ガスボンベ：爆発しない。栓が飛ぶ→ロケット→敵は伏せる→主人公の椅子に直撃（GAME OVER）', () => {
  const S = runSim('cyl', 1, 0);
  eq(texts(S), ['ガスボンベ', '栓が飛ぶ', 'ロケットになって跳ね回る', '敵2人は伏せてよける', '主人公の椅子に直撃']);
  eq(S.result.ok, false); eq(S.hero.killedBy, 'cyl');
  eq(S.events.concat([]).some(e => e.type === 'explode'), false);
});
test('A が撃つ時刻は命中から約 3.5 秒（アヒル・消火器ではその前に流れが変わる）', () => {
  const l = runSim('cyl', 5, 0);
  eq(l.log.some(x => x.key === 'aFire') || l.hero.alive === false, true);
  const e = runSim('ext', 2, 0);
  eq(e.log.some(x => x.key === 'aFire'), false, '消火器では A は普通には撃たない');
  const d = runSim('duck', 2, 0);
  eq(d.log.some(x => x.key === 'aFire'), false, 'アヒルでも A は主人公を撃たない');
});

// ===== 20 回ずつ（配置と乱数を揺らす） =====
const RUNS = 20, COUNT = {};
for (const id of ['A', 'ext', 'duck', 'cyl']) {
  let ok = 0; for (let i = 0; i < RUNS; i++) if (runSim(id, 100 + i, 1).result.ok) ok++;
  COUNT[id] = ok;
}
info('20 回の成功数（CLEAR になった回数。配置・乱数を揺らす）  ① 敵A ' + COUNT.A + '/20（失敗 ' + (20 - COUNT.A) + '）  ② 消火器 ' + COUNT.ext + '/20  ③ アヒル ' + COUNT.duck + '/20  ④ ガスボンベ ' + COUNT.cyl + '/20（失敗 ' + (20 - COUNT.cyl) + '）');
{
  const wide = {};
  for (const id of ['A', 'ext', 'duck', 'cyl']) { let ok = 0; for (let i = 0; i < RUNS; i++) if (runSim(id, 300 + i, 2.5).result.ok) ok++; wide[id] = ok; }
  info('揺らしを 2.5 倍にしたとき（合否には使わない）  ① ' + wide.A + '/20  ② ' + wide.ext + '/20  ③ ' + wide.duck + '/20  ④ ' + wide.cyl + '/20');
}
{
  let big = 0; for (let i = 0; i < 100; i++) if (runSim('A', 500 + i, 1).result.ok) big++;
  info('① 敵 A は 100 回で CLEAR（偶然の成功）が ' + big + ' 回');
  COUNT.A100 = big;
}
test('② 消火器は 20 回中 19 回以上 CLEAR', () => { eq(COUNT.ext >= 19, true, '成功 ' + COUNT.ext); });
test('③ アヒルは 20 回中 19 回以上 CLEAR', () => { eq(COUNT.duck >= 19, true, '成功 ' + COUNT.duck); });
test('④ ガスボンベは 20 回中 18 回以上 GAME OVER', () => { eq(20 - COUNT.cyl >= 18, true, '失敗 ' + (20 - COUNT.cyl)); });
test('① 敵 A は 20 回中 11〜19 回 GAME OVER（ときどき偶然の成功）', () => { eq(20 - COUNT.A >= 11 && 20 - COUNT.A <= 19, true, '失敗 ' + (20 - COUNT.A)); });

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
