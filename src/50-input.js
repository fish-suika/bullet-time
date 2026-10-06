// ===== 入力：キー（← → ↑ ↓ で選ぶ・Enter / Space で撃つ・R でやり直し）とタップ =====
const INPUT = { touch: false };
function initInput(h) {
  addEventListener('touchstart', () => { INPUT.touch = true; document.body.classList.add('touch'); }, { passive: true });
  const dirs = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1], KeyA: [-1, 0], KeyD: [1, 0], KeyW: [0, -1], KeyS: [0, 1] };
  addEventListener('keydown', e => {
    if (e.repeat && !dirs[e.code]) return;
    h.any();
    if (dirs[e.code]) { e.preventDefault(); h.dir(dirs[e.code][0], dirs[e.code][1]); }
    else if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); h.confirm(); }
    else if (e.code === 'KeyR') h.retry();
  });
  addEventListener('pointerdown', () => h.any());
}
