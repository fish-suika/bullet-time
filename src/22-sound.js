// ===== 音（Web Audio で作る。音声ファイルは使わない） =====
// ブラウザは最初の操作（クリック・タップ・キー）まで音を出せないので、そのときに作る
const SND = { ctx: null, out: null, noise: null, mute: false, whoosh: null };

function sndInit() {
  if (SND.ctx) { if (SND.ctx.state === 'suspended') SND.ctx.resume(); return; }
  try {
    const C = window.AudioContext || window.webkitAudioContext;
    SND.ctx = new C();
    SND.out = SND.ctx.createGain();
    SND.out.gain.value = 0.6;
    SND.out.connect(SND.ctx.destination);
    const len = SND.ctx.sampleRate * 2, buf = SND.ctx.createBuffer(1, len, SND.ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    SND.noise = buf;
  } catch (e) { SND.ctx = null; }                         // 音が出せない環境では鳴らさないだけ
}

// 音程のある音（freq から to へ下がる・上がる）
function sndTone(freq, to, dur, type, vol, delay) {
  if (!SND.ctx || SND.mute) return;
  const t0 = SND.ctx.currentTime + (delay || 0), o = SND.ctx.createOscillator(), g = SND.ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g); g.connect(SND.out);
  o.start(t0); o.stop(t0 + dur + 0.02);
}

// ざらついた音（フィルタの周波数を from から to へ動かす）
function sndNoise(dur, vol, filter, from, to, delay) {
  if (!SND.ctx || SND.mute) return;
  const t0 = SND.ctx.currentTime + (delay || 0), s = SND.ctx.createBufferSource(), f = SND.ctx.createBiquadFilter(), g = SND.ctx.createGain();
  s.buffer = SND.noise;
  f.type = filter; f.frequency.setValueAtTime(from, t0);
  f.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  s.connect(f); f.connect(g); g.connect(SND.out);
  s.start(t0); s.stop(t0 + dur + 0.02);
}

function sndShot() { sndNoise(0.5, 0.9, 'lowpass', 3000, 120, 0); sndTone(160, 40, 0.35, 'sawtooth', 0.5, 0); sndNoise(1.2, 0.25, 'lowpass', 900, 100, 0.12); }
function sndGlass() { sndNoise(0.5, 0.5, 'highpass', 3500, 6000, 0); for (let i = 0; i < 6; i++) sndTone(2500 + Math.random() * 3000, 1500, 0.12, 'triangle', 0.07, 0.03 + i * 0.06); }
function sndFreeze() { sndTone(220, 55, 1.2, 'sine', 0.35, 0); sndTone(880, 440, 0.6, 'sine', 0.06, 0); sndNoise(0.9, 0.12, 'bandpass', 2400, 300, 0); }
function sndTick() { sndTone(1100, 900, 0.05, 'square', 0.06, 0); }
function sndConfirm() { sndTone(600, 1500, 0.12, 'sawtooth', 0.15, 0); sndNoise(0.15, 0.2, 'highpass', 2000, 6000, 0); }
function sndImpact() { sndTone(120, 35, 0.25, 'sine', 0.7, 0); sndNoise(0.2, 0.55, 'bandpass', 2500, 300, 0); }
function sndMetal() { sndTone(1700, 1200, 0.3, 'triangle', 0.18, 0); sndTone(2900, 2200, 0.25, 'triangle', 0.1, 0.01); }
function sndShatter() { sndNoise(0.45, 0.6, 'highpass', 2500, 7000, 0); for (let i = 0; i < 7; i++) sndTone(2000 + Math.random() * 3500, 1200, 0.1, 'triangle', 0.08, i * 0.045); }
function sndThud(v) { const g = Math.min(1, (v || 3) / 8); sndTone(95, 38, 0.2, 'sine', 0.25 + g * 0.4, 0); sndNoise(0.12, 0.1 + g * 0.2, 'lowpass', 800, 120, 0); }
function sndGun() { sndNoise(0.28, 0.8, 'lowpass', 4500, 200, 0); sndTone(260, 60, 0.18, 'sawtooth', 0.35, 0); }
function sndBoom() { sndNoise(1.4, 1.0, 'lowpass', 1800, 40, 0); sndTone(90, 22, 1.0, 'sine', 0.9, 0); sndNoise(0.6, 0.4, 'bandpass', 600, 120, 0.1); }
function sndSlip() { sndTone(900, 200, 0.25, 'sine', 0.2, 0); }
function sndResult(ok) {
  if (ok) { sndTone(523, 523, 0.18, 'triangle', 0.2, 0); sndTone(659, 659, 0.18, 'triangle', 0.2, 0.15); sndTone(784, 784, 0.4, 'triangle', 0.22, 0.3); }
  else { sndTone(330, 300, 0.3, 'triangle', 0.2, 0); sndTone(247, 150, 0.7, 'triangle', 0.22, 0.28); }
}

// 風切り音：弾が飛んでいる間ずっと鳴らし、近づくほど高く・大きくする
function sndWhooshStart() {
  if (!SND.ctx || SND.mute || SND.whoosh) return;
  const s = SND.ctx.createBufferSource(), f = SND.ctx.createBiquadFilter(), g = SND.ctx.createGain();
  s.buffer = SND.noise; s.loop = true;
  f.type = 'bandpass'; f.frequency.value = 500; f.Q.value = 1.2;
  g.gain.value = 0.0;
  s.connect(f); f.connect(g); g.connect(SND.out); s.start();
  SND.whoosh = { s, f, g };
}
function sndWhooshSet(k) {                                // k: 0〜1
  const w = SND.whoosh; if (!w) return;
  const t = SND.ctx.currentTime;
  w.f.frequency.setTargetAtTime(400 + k * 2600, t, 0.05);
  w.g.gain.setTargetAtTime(0.05 + k * 0.4, t, 0.05);
}
function sndWhooshStop() {
  const w = SND.whoosh; if (!w) return;
  SND.whoosh = null;
  try { w.g.gain.setTargetAtTime(0, SND.ctx.currentTime, 0.03); w.s.stop(SND.ctx.currentTime + 0.2); } catch (e) {}
}

// ---- 新しい未来の音 ----
function sndSqueak() { sndTone(1500, 2300, 0.09, 'square', 0.22, 0); sndTone(2300, 1700, 0.16, 'square', 0.2, 0.09); }     // ゴムのアヒル「ピーッ」
function sndHiss() { sndNoise(0.12, 0.22, 'highpass', 3000, 6000, 0); }                                                    // 消火器の噴射（毎フレーム足す）
function sndPop() { sndTone(300, 80, 0.12, 'sine', 0.6, 0); sndNoise(0.18, 0.5, 'bandpass', 1800, 300, 0); }                // 栓が飛ぶ
function sndClang() { sndTone(420, 260, 0.35, 'triangle', 0.35, 0); sndTone(840, 520, 0.25, 'triangle', 0.18, 0.005); sndNoise(0.1, 0.3, 'bandpass', 2000, 600, 0); }   // ロケットの跳ね返り・ドラム缶
function sndJet() { sndNoise(0.15, 0.2, 'bandpass', 1500, 2500, 0); }                                                       // ロケットの噴射
function sndSplash() { sndNoise(0.15, 0.1, 'highpass', 1500, 5000, 0); sndTone(500, 180, 0.12, 'sine', 0.12, 0); }          // すべって転ぶ
let __rainNode = null;
function sndRainStart() {                                                                                                   // 雨音（水浸しの間ずっと）
  if (!SND.ctx || SND.mute || __rainNode) return;
  const s = SND.ctx.createBufferSource(), f = SND.ctx.createBiquadFilter(), g = SND.ctx.createGain();
  s.buffer = SND.noise; s.loop = true; f.type = 'highpass'; f.frequency.value = 2500; g.gain.value = 0.0;
  s.connect(f); f.connect(g); g.connect(SND.out); s.start(); g.gain.setTargetAtTime(0.18, SND.ctx.currentTime, 0.3);
  __rainNode = { s, g };
}
function sndRainStop() {
  if (!__rainNode) return;
  const r = __rainNode; __rainNode = null;
  try { r.g.gain.setTargetAtTime(0, SND.ctx.currentTime, 0.1); r.s.stop(SND.ctx.currentTime + 0.5); } catch (e) {}
}
