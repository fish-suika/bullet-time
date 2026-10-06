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
  E.lamp.pos[0] += j(0.1); E.lamp.pos[2] += j(0.1);
  E.banana.pos[0] += j(0.05); E.banana.pos[2] += j(0.05); E.banana.yaw += j(1);
  E.cyl.pos[0] += j(0.1); E.cyl.pos[2] += j(0.1);
  E.crate.pos[0] += j(0.1); E.crate.pos[2] += j(0.1);
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
test('配置：撃てる対象が 4 つ、分岐点から全部が見える向きにある', () => {
  eq(STAGE1.targets.map(t => t.id), ['A', 'lamp', 'banana', 'bottle']);
  for (const t of STAGE1.targets) eq(t.aim.z < STAGE1.branch.z + 3, true, t.id);
  eq(yawToward(0, -1), 0); near(yawToward(1, 0), -Math.PI / 2, 1e-9);
});

// ===== レイキャスト =====
test('レイキャスト：主人公に当たる／手前に敵 A がいると遮られる／天井へ撃つと天井に当たる', () => {
  const S = newSim(STAGE1, mulberry32(1));
  const hero = posOf(S.ents.hero);
  let r = castRay(S, { x: 0, y: 1.0, z: -2.5 }, { x: 0, y: 0, z: -1 }, 'A');
  eq(r.ent && r.ent.id, 'hero');
  r = castRay(S, { x: 0, y: 1.0, z: -0.2 }, { x: 0, y: 0, z: -1 }, null);
  eq(r.ent && r.ent.id, 'A', 'A が手前で遮る');
  r = castRay(S, { x: 1.5, y: 1.3, z: -2 }, { x: 0, y: 1, z: 0 }, 'A');
  eq([r.ent === null, r.surface], [true, 'ceiling']);
  near(hero.z, -4.15, 1e-6);
});
test('爆風：主人公は爆心から致死範囲の外（椅子ごと倒れてかわせる配置）', () => {
  const S = newSim(STAGE1, mulberry32(1));
  eq(dist3(posOf(S.ents.hero), posOf(S.ents.cyl)) > CFG.blast.lethal + 1, true);
  eq(dist3(posOf(S.ents.A), posOf(S.ents.cyl)) < CFG.blast.radius, true, 'A も爆風の範囲');
});

// ===== 4 つの未来（基準：配置を揺らさない・乱数 1 つ） =====
test('ランプ：落ちて砕け、A が驚いて銃撃が外れ、主人公は生き残る（CLEAR 正攻法）', () => {
  const S = runSim('lamp', 1, 0);
  eq(S.result.ok, true); eq(S.result.sub, '正攻法');
  eq(texts(S), ['ランプ', '落下', '敵が驚く', '銃撃が外れる', '主人公 生存']);
  eq(S.hero.alive, true);
});
test('バナナ：B が踏んで転び、暴発がボンベに当たり爆発、A も吹き飛び、主人公は無傷（CLEAR バカな方法）', () => {
  const S = runSim('banana', 1, 0);
  eq(S.result.ok, true); eq(S.result.sub, 'バカな方法');
  eq(texts(S), ['バナナ', '飛ぶ', '敵Bの足元へ', '敵Bが転ぶ', '銃が暴発', 'ボンベに命中', '爆発', '敵が吹き飛ぶ', '主人公 無傷']);
  eq([S.hero.tipped, S.A.state, S.B.state], [true, 'down', 'down'], '主人公は倒れ、A も B も倒れた');
});
test('敵 A を撃つ：倒れる物音で B が振り向いて主人公を撃つ（GAME OVER）', () => {
  const S = runSim('A', 1, 0);
  eq(S.result.ok, false);
  eq(texts(S), ['敵A', '倒れる', '物音で敵Bが振り向く', '敵Bが撃つ', '主人公 被弾']);
  eq(S.hero.killedBy, 'B');
});
test('ワイン瓶：割れるだけで誰も気にせず、A が撃つ（GAME OVER「何も変わらなかった」）', () => {
  const S = runSim('bottle', 1, 0);
  eq(S.result.ok, false); eq(S.result.sub, '何も変わらなかった');
  eq(texts(S), ['ワイン瓶', '割れる', '誰も気にしない', '敵Aが撃つ', '主人公 被弾']);
  eq(S.hero.killedBy, 'A');
});
test('A が撃つ時刻は命中から約 3.5 秒、終了は約 6 秒', () => {
  const S = runSim('bottle', 2, 0);
  const l = S.log.find(x => x.key === 'aFire');
  near(l.t, CFG.time.aFireAt, CFG.time.aFireJit + 0.05, 'A が撃つ');
  const C = runSim('lamp', 2, 0);
  near(C.t, CFG.time.endAt + 0.3, 0.1, '終了');
});
test('バナナの連鎖は 3.5 秒より前に爆発する（A が撃つ前）', () => {
  const S = runSim('banana', 3, 0);
  const l = S.log.find(x => x.key === 'explode');
  eq(l.t < CFG.time.aFireAt - 0.5, true, '爆発 t=' + l.t.toFixed(2));
});

// ===== 20 回ずつ（配置と乱数を揺らす） =====
const RUNS = 20, COUNT = {};
for (const id of ['lamp', 'banana', 'A', 'bottle']) {
  let ok = 0; for (let i = 0; i < RUNS; i++) if (runSim(id, 100 + i, 1).result.ok) ok++;
  COUNT[id] = ok;
}
info('20 回の成功数（配置・乱数を揺らす）  ランプ ' + COUNT.lamp + '/20  バナナ ' + COUNT.banana + '/20  敵A ' + COUNT.A + '/20  ワイン瓶 ' + COUNT.bottle + '/20');
// 揺らしを 2.5 倍にしたとき（余裕の見積もり。合否には使わない）
{
  const wide = {};
  for (const id of ['lamp', 'banana']) { let ok = 0; for (let i = 0; i < RUNS; i++) if (runSim(id, 300 + i, 2.5).result.ok) ok++; wide[id] = ok; }
  info('揺らしを 2.5 倍にしたとき  ランプ ' + wide.lamp + '/20  バナナ ' + wide.banana + '/20');
}
test('ランプは 20 回中 19 回以上成功（ほぼ確実）', () => { eq(COUNT.lamp >= 19, true, '成功 ' + COUNT.lamp); });
test('バナナは 20 回中 18 回以上成功（物理のばらつきで偶然外れることはある）', () => { eq(COUNT.banana >= 18, true, '成功 ' + COUNT.banana); });
test('敵 A とワイン瓶は 20 回中 1 回も成功しない（ハズレ）', () => { eq([COUNT.A, COUNT.bottle], [0, 0]); });

// ===== リトライの軽さ =====
test('シミュレーションの作り直しは 0.3 秒よりずっと速い（20 回の平均）', () => {
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
