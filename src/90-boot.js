// ===== 起動とメインループ =====
// 流れ：intro（状況を見る・最初の 1 回だけ）→ fly1（窓から分岐点へ）→ freeze（時間が止まる・対象を選ぶ）→ fly2（曲がって命中へ）
//       → sim（通常の速さで連鎖）→ result。リトライは fly1 の頭（発射直後）から。
(function boot() {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  const stage = document.getElementById('stage');
  stage.prepend(renderer.domElement);
  const SZ = { w: 1, h: 1 };
  function fit() {                                           // 枠（縦 9:16）の大きさに描画を合わせ、文字の基準 --u（枠の幅の 1/100）を入れる
    SZ.w = stage.clientWidth; SZ.h = stage.clientHeight;
    renderer.setSize(SZ.w, SZ.h);
    document.documentElement.style.setProperty('--u', SZ.w / 100 + 'px');
    if (typeof camera !== 'undefined') { camera.aspect = SZ.w / SZ.h; camera.updateProjectionMatrix(); }
  }

  const scene = new THREE.Scene();
  buildRoom(scene); buildProps(scene); buildPeople(scene); initFx(scene); initRain(scene);
  const camera = new THREE.PerspectiveCamera(70, 9 / 16, 0.1, 80);
  fit();
  CAM.cam = camera;

  const G = { phase: 'intro', S: null, sel: 'A', introDone: false, glassBroken: false, found: {}, nFound: 0, t: 0, time: 0, ts: 1, acc: 0,
    curve: null, f1: null, grade: 0, lastRetry: 0, camDir: { x: 0, y: 0, z: -1 }, hero: false };
  window.GAME = G;                                           // 確認用（テストプレイで局面を直接動かす）

  const portrait = matchMedia('(orientation: landscape) and (pointer: coarse)');   // スマホが横向き（縦専用なので止めて案内を出す）
  let touched = false, triedLandscape = false;
  addEventListener('touchstart', () => { touched = true; }, { passive: true });
  function tryLandscape() {                                  // スマホで最初にタップしたとき、全画面＋縦向き固定を試す（できない端末では何もしない）
    if (triedLandscape || !touched) return; triedLandscape = true;
    const el = document.documentElement;
    if (!el.requestFullscreen) return;
    el.requestFullscreen().then(() => { if (screen.orientation && screen.orientation.lock) return screen.orientation.lock('portrait'); }).catch(() => {});
  }

  const __nz = new THREE.Vector3();
  const B = CFG.bullet, br = STAGE1.branch;
  const tgt = id => STAGE1.targets.find(t => t.id === id);

  // ---------- 局面の切り替え ----------
  function startRound() {                                    // 新しい世界を作って、発射直後からやり直す（0.3 秒もかからない）
    hudHideResult(); hudMarkers(null); hudTint(false); hudIntro(false);
    sndWhooshStop(); sndRainStop(); fxClear();
    G.S = newSim(STAGE1, Math.random);
    roomReset(); G.acc = 0; G.hero = false;
    startFly1();
  }
  function startIntro() {
    G.phase = 'intro'; G.t = 0; G.capB = false; G.S = newSim(STAGE1, Math.random); roomReset(); hudIntro(true); hudRetryBtn(false);
  }
  function endIntro() {
    G.introDone = true; hudIntro(false); document.getElementById('cap').classList.remove('on'); startRound();
  }
  function startFly1() {
    const outside = !G.glassBroken;
    G.phase = 'fly1'; G.t = 0;
    G.f1 = { outside, ex: outside ? B.fly1Extra : 0, broke: !outside, startZ: outside ? B.startZ : STAGE1.room.zFront };
    G.ts = outside ? 1 : B.slowScale;
    if (outside) sndShot();
    sndWhooshStart(); sndWhooshSet(0.1);
    hudRetryBtn(true);
    FX.trailPts.length = 0;
    const p = { x: STAGE1.gun.x, y: STAGE1.gun.y, z: G.f1.startZ };
    G.camDir = { x: 0, y: 0, z: -1 };
    const g = camFollow(p, G.camDir, 0); camGo(g, 0, null);
    if (outside) fxMuzzle({ x: p.x, y: p.y, z: p.z + 0.5 });
  }
  function enterFreeze() {
    G.phase = 'freeze'; G.t = 0; G.ts = 0.01;
    sndWhooshStop(); sndFreeze(); hudTint(true);
    G.sel = G.lastTarget || 'A';
  }
  function fire() {
    if (G.phase !== 'freeze') return;
    G.phase = 'fly2'; G.t = 0;
    G.curve = BUL.curve(br, tgt(G.sel).aim);
    G.lastTarget = G.sel;
    hudMarkers(null); hudTint(false); FX.preview.visible = false;
    sndConfirm(); sndWhooshStart();
  }
  function impact() {
    G.phase = 'sim'; G.ts = 1; G.t = 0; G.acc = 0;
    fxBullet(br, G.camDir, false); FX.trailPts.length = 0; fxRings(br, 0, camera.position, false);
    sndWhooshStop(); sndImpact();
    hudFlash(0.55, 350);
    G.S.events.length = 0;
    simShoot(G.S, G.sel);
    if (!G.found[G.sel]) { G.found[G.sel] = true; G.nFound++; }
    hudFut(G.nFound);
    handleEvents();
  }
  function showResult() {
    G.phase = 'result'; hudRetryBtn(false);
    const res = G.S.result;
    hudResult(res, G.nFound);
    sndResult(res.ok);
  }

  // ---------- 連鎖の出来事 → 見た目と音 ----------
  function handleEvents() {
    const S = G.S, list = S.events; S.events = [];
    for (const ev of list) {
      switch (ev.type) {
        case 'impact': fxSparks(ev.point, 18, 0xffd890, 5); FX.shake += 0.3; break;
        case 'gunshot':
          sndGun(); fxMuzzle(ev.from); fxTracer(ev.from, ev.to);
          if (ev.hit === 'ceiling' || ev.hit === 'wall' || ev.hit === 'floor' || ev.hit === 'sprk') fxSparks(ev.to, 12, 0xffd890, 4);
          FX.shake += 0.25;
          break;
        case 'thud': sndThud(ev.speed); break;
        case 'heroHit': hudHurt(); FX.shake += 0.5; break;
        // ① 敵 A
        case 'gunDrop': sndThud(4); break;
        case 'shelfBump': sndClang(); FX.shake += 0.2; break;
        case 'paintCap': sndClang(); fxSparks(ev.pos, 8, 0xffffff, 2); hudPop('ゴンッ！', 0.9); break;
        // ② 消火器
        case 'extStart': sndHiss(); break;
        case 'extHit': sndClang(); fxSparks(ev.pos, 10, 0xffe0a0, 3); break;
        case 'flashThrow': sndThud(2); break;
        case 'sprinkler': sndGlass(); fxSparks(ev.pos, 14, 0xdfeeff, 3); sndRainStart(); break;
        case 'flood': roomWet(); hudPop('水浸し！', 1.1); break;
        case 'slip': sndSplash(); if (!G.popSlip || performance.now() - G.popSlip > 900) { G.popSlip = performance.now(); hudPop('ツルッ！', 0.7); } break;
        // ③ アヒル
        case 'squeak': sndSqueak(); hudPop('ピーッ！', 0.9); break;
        case 'speech': hudPop('「' + ev.text + '」', 0.9); break;
        // ④ ガスボンベ
        case 'capPop': sndPop(); fxCapPop(ev.pos); FX.shake += 0.3; break;
        case 'rocketStart': sndJet(); break;
        case 'ricochet': sndClang(); fxSparks(ev.pos, 10, 0xffe0a0, 4); FX.shake += 0.25; break;
        case 'done': showResult(); break;
      }
    }
  }

  // ---------- 入力 ----------
  function markerItems() {                                   // 対象の印の、いまの画面の位置
    camera.updateMatrixWorld();
    return STAGE1.targets.map(t => {
      const v = new THREE.Vector3(t.aim.x, t.aim.y, t.aim.z).project(camera);
      return { id: t.id, x: (v.x + 1) / 2 * SZ.w, y: (1 - v.y) / 2 * SZ.h };
    });
  }
  function doDir(dx, dy) {
    if (G.phase !== 'freeze') return;
    const n = pickDir(markerItems(), G.sel, { x: dx, y: dy });
    if (n !== G.sel) { G.sel = n; sndTick(); }
  }
  function doRetry() {
    if (G.phase === 'intro') return;
    const now = performance.now(); if (now - G.lastRetry < 200) return; G.lastRetry = now;
    startRound();
  }
  initInput({
    any() { sndInit(); tryLandscape(); if (G.phase === 'intro' && !portrait.matches) endIntro(); },
    dir: doDir,
    confirm() { if (G.phase === 'freeze') fire(); else if (G.phase === 'result') doRetry(); },
    retry: doRetry,
  });
  for (const el of document.querySelectorAll('.mk')) {
    el.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation(); sndInit();
      if (G.phase !== 'freeze') return;
      if (el.dataset.id === G.sel) fire(); else { G.sel = el.dataset.id; sndTick(); }
    });
  }
  $('fireBtn').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); fire(); });
  $('retryBtn').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); doRetry(); });
  $('againBtn').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); doRetry(); });
  $('result').addEventListener('pointerdown', () => { if (performance.now() - HUD.shownAt > 500) doRetry(); });

  addEventListener('resize', fit);

  // ---------- 色合い（分岐点では冷たい青白い光に） ----------
  const hemiN = new THREE.Color(0x4a5870), hemiF = new THREE.Color(0x7aa4e8), lampN = new THREE.Color(0xffb464), lampF = new THREE.Color(0xa6c4ff);
  function applyGrade(dt) {
    const want = G.phase === 'freeze' ? 1 : G.phase === 'fly2' ? 0.5 : 0;
    G.grade += (want - G.grade) * Math.min(1, dt * 6);
    ROOM.hemi.color.copy(hemiN).lerp(hemiF, G.grade); ROOM.hemi.intensity = 0.4 + G.grade * 0.2 + (G.S.ents.lamp.broken ? 0.28 : 0);
    if (ROOM.lampLight.intensity > 0.5) ROOM.lampLight.color.copy(lampN).lerp(lampF, G.grade);
  }

  // ---------- 毎フレーム ----------
  startIntro();
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;     // 止めている間も last は進める
    if (portrait.matches) { renderer.render(scene, camera); return; }
    G.time += dt;
    const S = G.S;

    if (G.phase === 'intro') {
      G.t += dt; G.ts = 1;
      camGo(camIntro(Math.min(1, G.t / CFG.camera.introSec)), dt, null);
      if (!G.capB && G.t >= CFG.camera.introSec * 0.68) { G.capB = true; hudCap('敵B：窓を見張っている', 1.6); }
      if (G.t >= CFG.camera.introSec) endIntro();
    } else if (G.phase === 'fly1') {
      G.t += dt;
      const f = G.f1, slow = G.t >= f.ex;
      let z;
      if (!slow) z = f.startZ + (STAGE1.room.zFront - f.startZ) * (G.t / f.ex);
      else z = STAGE1.room.zFront + (br.z - STAGE1.room.zFront) * Math.min(1, (G.t - f.ex) / B.fly1Sec);
      const p = { x: br.x, y: br.y, z };
      if (!f.broke && slow) {                                  // ガラスが割れる
        f.broke = true; G.glassBroken = true; ROOM.glass.visible = false; G.ts = B.slowScale;
        sndGlass(); fxGlassBreak(p.x, p.y, STAGE1.room.zFront, 36); FX.shake += 0.4; hudFlash(0.25, 250);
      }
      fxBullet(p, G.camDir, true); fxTrailPush(p); fxTrailDraw();
      camGo(camFollow(p, G.camDir, 0), dt, null);
      sndWhooshSet(0.15);
      if (G.t >= f.ex + B.fly1Sec) { fxBullet(br, G.camDir, true); enterFreeze(); }
    } else if (G.phase === 'freeze') {
      G.t += dt; G.ts = 0.01;
      camGo(camFreeze(), dt, 3);
      camApply(0); camera.updateMatrixWorld();
      const items = markerItems();
      hudMarkers(items, G.sel);
      fxPreview(BUL.curve(br, tgt(G.sel).aim));
      fxBullet(br, { x: 0, y: 0, z: -1 }, true);
      fxRings(br, G.time, camera.position, true);
      fxTrailDraw();
    } else if (G.phase === 'fly2') {
      G.t += dt;
      const tau = Math.min(1, G.t / B.fly2Sec), u = BUL.u(tau), near = BUL.near(u);
      const p = BUL.at(G.curve, u), q = BUL.at(G.curve, Math.min(1, u + 0.02)), r = BUL.at(G.curve, Math.max(0, u - 0.02));
      const d = u < 0.98 ? { x: q.x - p.x, y: q.y - p.y, z: q.z - p.z } : { x: p.x - r.x, y: p.y - r.y, z: p.z - r.z };
      const dl = Math.hypot(d.x, d.y, d.z) || 1; d.x /= dl; d.y /= dl; d.z /= dl;
      G.camDir.x += (d.x - G.camDir.x) * Math.min(1, dt * 5); G.camDir.y += (d.y - G.camDir.y) * Math.min(1, dt * 5); G.camDir.z += (d.z - G.camDir.z) * Math.min(1, dt * 5);
      G.ts = B.slowScale + (B.nearScale - B.slowScale) * near;
      fxBullet(p, d, true); fxTrailPush(p); fxTrailDraw();
      fxRings(p, G.time, camera.position, near > 0.3);
      camGo(camFollow(p, G.camDir, near), dt, 7);
      sndWhooshSet(0.25 + near * 0.75);
      if (tau >= 1) impact();
    } else {                                                   // sim / result
      if (G.phase === 'sim') {
        G.acc += dt; let n = 0;
        while (G.acc >= CFG.time.step && G.S.state === 'running' && n++ < 10) { simStep(G.S, CFG.time.step); G.acc -= CFG.time.step; if (G.S.events.length) handleEvents(); }
        if (G.S.events.length) handleEvents();
      }
      G.ts = 1;
      const F = G.S.flags, X = G.S.ext;                       // 消火器の噴射・ロケットの噴射（毎フレームの粒）
      if (F.extOn && ROOM.extNozzle) { ROOM.views.ext.obj.updateMatrixWorld(true); ROOM.extNozzle.getWorldPosition(__nz); fxSpray(__nz, { x: -X.dirx, y: 0.05, z: -X.dirz }); if ((G.frameN = (G.frameN || 0) + 1) % 5 === 0) sndHiss(); }
      if (F.rocketOn && ROOM.cylTail) { ROOM.views.cyl.obj.updateMatrixWorld(true); ROOM.cylTail.getWorldPosition(__nz); const cv = G.S.ents.cyl.body.velocity, cs = Math.hypot(cv.x, cv.y, cv.z) || 1; fxJet(__nz, { x: -cv.x / cs, y: -cv.y / cs, z: -cv.z / cs }); if ((G.frameN = (G.frameN || 0) + 1) % 6 === 0) sndJet(); }
      camGo(camWide(G.S.target), dt, 2.2);
    }

    roomSync(G.S, G.time); peopleSync(G.S, G.time);
    applyGrade(dt);
    fxUpdate(dt * G.ts); fxTracerUpdate(dt);
    fxRainUpdate(dt * G.ts, G.S.flags.rain && (G.phase === 'sim' || G.phase === 'result'), posOf(G.S.ents.sprk));
    if (G.phase !== 'freeze') camApply(FX.shake);
    renderer.render(scene, camera);
  }
  G.dbg = { fire, retry: doRetry, endIntro, intro: startIntro };
  requestAnimationFrame(frame);
})();
