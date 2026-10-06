// ===== 画面の文字・印・結果 =====
const HUD = { shownAt: 0 };
const $ = id => document.getElementById(id);

let __popTimer = 0;
function hudPop(text, sec) {
  const el = $('pop'); el.textContent = text; el.classList.add('on');
  clearTimeout(__popTimer); __popTimer = setTimeout(() => el.classList.remove('on'), (sec || 1.0) * 1000);
}
function hudFut(n) { $('futN').textContent = n; }
function hudIntro(on) { $('intro').classList.toggle('on', on); }
function hudTint(on) { $('tint').classList.toggle('on', on); }
function hudFlash(op, ms) {
  const el = $('flash'); el.style.transition = 'none'; el.style.opacity = op;
  requestAnimationFrame(() => { el.style.transition = 'opacity ' + (ms || 300) + 'ms'; el.style.opacity = 0; });
}
function hudHurt() {
  const el = $('hurt'); el.style.transition = 'none'; el.style.opacity = 1;
  requestAnimationFrame(() => { el.style.transition = 'opacity 1200ms'; el.style.opacity = 0; });
}
function hudRetryBtn(on) { $('retryBtn').classList.toggle('off', !on); }

// 分岐点：印を出す。items: [{id,x,y}]（画面の座標）、sel: 選んでいる id
function hudMarkers(items, sel) {
  for (const el of document.querySelectorAll('.mk')) {
    const it = items && items.find(i => i.id === el.dataset.id);
    el.classList.toggle('on', !!it);
    if (!it) continue;
    el.style.left = it.x + 'px'; el.style.top = it.y + 'px';
    el.classList.toggle('sel', it.id === sel);
    const t = it.id === sel ? '狙う' : '変更';
    const sp = el.querySelector('span'); if (sp.textContent !== t) sp.textContent = t;
  }
  $('fireBtn').classList.toggle('on', !!items);
  $('hint').classList.toggle('on', !!items);
}

function hudResult(res, found) {
  $('resTitle').textContent = res.title || (res.ok ? 'CLEAR' : 'GAME OVER');
  $('resTitle').className = res.ok ? 'ok' : 'ng';
  $('resSub').textContent = res.sub;
  const c = $('chain'); c.innerHTML = '';
  res.lines.forEach((t, i) => {
    if (i) { const b = document.createElement('b'); b.textContent = '→'; c.appendChild(b); }
    const s = document.createElement('span'); s.textContent = t;
    if (i === res.lines.length - 1) s.className = 'last ' + (res.ok ? 'ok' : 'ng');
    c.appendChild(s);
  });
  $('resFut').innerHTML = '見つけた未来　<b>' + found + '</b> / ' + CFG.futures;
  $('result').classList.add('on'); $('stage').classList.add('res');
  HUD.shownAt = performance.now();
}
function hudHideResult() { $('result').classList.remove('on'); $('stage').classList.remove('res'); }
function hudResultOn() { return $('result').classList.contains('on'); }

// 連鎖の「いま」の字幕（ログと同じ文）。次のステップが来たら入れ替わり、しばらくしたら消える
let __stepTimer = 0;
function hudStep(text, hold) {
  const el = $('step');
  clearTimeout(__stepTimer);
  if (!text) { el.classList.remove('on'); return; }
  el.classList.remove('on'); void el.offsetWidth;            // 入れ替わりの動きをやり直す
  el.textContent = text; el.classList.add('on');
  __stepTimer = setTimeout(() => el.classList.remove('on'), (hold || 2.6) * 1000);
}
