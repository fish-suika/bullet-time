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
  buildRoom(scene); buildProps(scene); buildPeople(scene); initFx(scene); initHighlight(scene);
  const camera = new THREE.PerspectiveCamera(70, 9 / 16, 0.1, 80);
  fit();
  CAM.cam = camera;

  const G = { phase: 'intro', S: null, sel: 'A', introDone: false, glassBroken: false, found: {}, nFound: 0, t: 0, time: 0, ts: 1, acc: 0,
    capQ: [], capCur: null, pendingResult: false, capShownAt: 0, capMin: 0, curve: null, f1: null, grade: 0, lastRetry: 0, camDir: { x: 0, y: 0, z: -1 }, hero: false };
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
    sndWhooshStop(); sndLoopsStop(); fxClear(); G.fast = false; G.beat = null; G.hl = null; G.push = null; G.bounceN = 0; G.beatOk = 0; G.capQ = []; G.capCur = null; G.pendingResult = false; hudStep(null); $('ff').classList.remove('on');
    G.S = newSim(STAGE1, Math.random);
    roomReset(); G.acc = 0; G.hero = false;
    startFly1();
  }
  function startIntro() {
    G.phase = 'intro'; G.t = 0; G.S = newSim(STAGE1, Math.random); roomReset(); hudIntro(true); hudRetryBtn(false);
  }
  function endIntro() {
    G.introDone = true; hudIntro(false); startRound();
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
    G.curve = BUL.curve(br, tgt(G.sel).aim, G.sel);
    G.lastTarget = G.sel;
    hudMarkers(null); hudTint(false); FX.preview.visible = false;
    sndConfirm(); sndWhooshStart();
  }
  function impact() {
    G.phase = 'sim'; G.ts = 1; G.t = 0; G.acc = 0; G.simT0 = G.time;
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
    G.phase = 'result'; hudRetryBtn(false); hudStep(null); sndLoopsStop();
    const res = G.S.result;
    hudResult(res, G.nFound);
    sndResult(res.ok);
  }

  // 目印：いまの字幕の主役の足元に、細い輪を床に置く。出るのは字幕の最初の 0.8 秒だけ、ふわっと出て消える。カメラは動かさない
  const HL_R = { A: 0.7, B: 0.7, hero: 0.7, shelf: 0.9, drum: 0.5, ext: 0.45, gun: 0.35, flash: 0.35, sprk: 0.6, duck: 0.35, cyl: 0.5 };
  function hlUpdate() {
    const hl = G.hl, m = FX.hl[0];
    const on = hl && !G.push && !G.fast && G.phase === 'sim' && G.time - hl.t0 < CFG.beat.hlDur;
    if (!on) { m.visible = false; return; }
    const p = posOf(G.S.ents[hl.a]), age = G.time - hl.t0, T = CFG.beat.hlDur, f = CFG.beat.hlFade;
    const dist = Math.hypot(p.x - camera.position.x, p.y - camera.position.y, p.z - camera.position.z);
    const r = Math.min(HL_R[hl.a] || 0.5, dist * 0.085);                                     // 近くでも画面上で大きくならない
    m.visible = true; m.position.set(p.x, 0.03, p.z); m.scale.setScalar(r);
    m.material.opacity = 0.45 * Math.min(1, age / f) * (1 - clamp((age - (T - f)) / f, 0, 1));
  }

  // ---------- 連鎖の 1 ステップ（ログに足されたとき）：字幕・カメラ・見せ場のスロー ----------
  function stepBeat(ev) {                                    // ステップが来たら字幕の行列に並べる（出す順番と時間は capTick が決める）
    if (G.fast) return;
    G.capQ.push(ev);
  }
  // 字幕の行列：いまの字幕が最低限の時間（文字数に応じて）出てから、次を出す。次の字幕が出る瞬間に、そのステップのカメラ・スローを始める（絵と文字をそろえる）。
  // 行列がたまっている（出来事のほうが字幕より先に進んでいる）間は、見る速さをさらに落として、動きが文字を追い越さないようにする
  function capTick() {
    const K = CFG.beat;
    const ready = !G.capCur || G.time - G.capShownAt >= G.capMin;
    if (G.capQ.length && ready) {
      const ev = G.capQ.shift();
      G.capCur = ev; G.capShownAt = G.time; G.capMin = Math.max(K.capMin0, K.capBase + K.capPer * ev.text.length);
      hudStep(ev.text, G.capMin + 0.9);
      if (ev.focus) { G.hl = { a: ev.focus, t0: G.time }; }          // 光る輪（見る場所）
      if (ev.focus && K.key[G.S.target] === ev.key) G.push = { t0: G.time, focus: ev.focus };                                    // 山場だけ 1 回寄る
      if (!G.beat) { G.beat = { t0: G.time, dur: K.dur, slow: K.slow }; G.beatOk = G.time + K.dur + K.cooldown; }
    }
    return { backlog: G.capQ.length > 0 && !ready, ready };
  }

  // ロケットの跳ね返り 1 回ごとの小さな見せ場（ログのステップではないので、ここで別に作る。回数に上限、近すぎるものは束ねる）
  function bounceBeat() {
    const K = CFG.beat;
    if (G.fast || (G.bounceN || 0) >= K.bounceMax) return;
    if (!G.beat && G.time >= (G.beatOk || 0)) { G.beat = { t0: G.time, dur: K.bounceDur, slow: K.bounceSlow, bounce: true }; G.beatOk = G.time + K.bounceDur + K.bounceCool; G.bounceN = (G.bounceN || 0) + 1; }
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
        case 'heroHit': hudHurt(); FX.shake += 0.5; if (ev.who === 'cyl') { sndBonk(); hudPop('ゴン！', 0.9); } break;
        case 'step': stepBeat(ev); break;
        // ① 大爆発（ボンベが爆発して、主人公も吹き飛ぶ）
        case 'explode': sndBoom(); fxBigExplosion(ev.pos); hudFlash(0.55, 500); break;
        // ② 消火器
        case 'extStart': sndPop(); break;
        case 'faceHit': sndBonk(); sndClang(); fxSparks(ev.pos, 20, 0xffffff, 6); fxBounce(ev.pos); FX.shake += 0.6; hudPop('ガンッ！', 0.9); break;
        // ③ アヒル
        case 'squeak': sndSqueak(); hudPop('ピーッ！', 0.9); break;
        case 'speech': hudPop('「' + ev.text + '」', 0.9); break;
        // ④ ガスボンベ
        case 'capPop': sndPop(); fxCapPop(ev.pos); FX.shake += 0.3; break;
        case 'rocketStart': break;
        case 'ricochet': sndBonk(); fxBounce(ev.pos); FX.shake += 0.35; bounceBeat(); break;
        case 'done': G.pendingResult = true; break;                // 字幕を読み終えてから結果へ
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
    any() { sndInit(); tryLandscape(); if (G.phase === 'intro' && !portrait.matches) endIntro(); else if (G.phase === 'sim' && !G.fast) { G.fast = true; G.capQ = []; hudStep(null); } },
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
    let wallOff = false;
    if (portrait.matches) { renderer.render(scene, camera); return; }
    G.time += dt;
    const S = G.S;

    if (G.phase === 'intro') {
      G.t += dt; G.ts = 1;
      camGo(camIntro(Math.min(1, G.t / CFG.camera.introSec)), dt, null);
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
      fxPreview(BUL.curve(br, tgt(G.sel).aim, G.sel));
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
      const K = CFG.beat;
      let scale = 1;
      if (G.phase === 'sim') {
        // 連鎖はゆっくり流す（chainScale）。ステップごとに「見せ場」で一瞬さらに遅く。タップで 3 倍速の早送り
        let beat = 1;
        if (G.beat) {
          const age = G.time - G.beat.t0, bd = G.beat.dur, bs = G.beat.slow, ez = Math.min(K.ease, bd / 3);
          if (age >= bd) G.beat = null;
          else beat = age < ez ? 1 + (bs - 1) * (age / ez) : age > bd - ez ? bs + (1 - bs) * ((age - (bd - ez)) / ez) : bs;
        }
        const ct = G.fast ? { backlog: false, ready: true } : capTick();
        scale = G.fast ? K.ffScale : CFG.time.chainScale * beat * (G.S.flags.rocketOn && G.S.hero.alive ? K.rocketScale : 1) * (ct.backlog ? K.backlogScale : 1);
        if (G.pendingResult && (G.fast || (!G.capQ.length && ct.ready))) { showResult(); return; }
        G.acc += dt * scale; let n = 0;
        while (G.acc >= CFG.time.step && G.S.state === 'running' && n++ < 12) { simStep(G.S, CFG.time.step); G.acc -= CFG.time.step; if (G.S.events.length) handleEvents(); }
        if (G.S.events.length) handleEvents();
      }
      G.ts = scale; $('ff').classList.toggle('on', G.phase === 'sim' && !G.fast && G.time - G.simT0 < 4);
      const F = G.S.flags;                       // 消火器の噴射・ロケットの噴射（毎フレームの粒と、1 つだけのループ音）
      if (F.extOn && ROOM.extNozzle) { ROOM.views.ext.obj.updateMatrixWorld(true); ROOM.extNozzle.getWorldPosition(__nz); const ev2 = G.S.ents.ext.body.velocity, es = Math.hypot(ev2.x, ev2.y, ev2.z) || 1; fxSpray(__nz, { x: -ev2.x / es, y: -ev2.y / es, z: -ev2.z / es }); sndSprayStart(); } else sndLoopStop('spray');
      if (F.rocketOn && ROOM.cylTail) { ROOM.views.cyl.obj.updateMatrixWorld(true); ROOM.cylTail.getWorldPosition(__nz); const cv = G.S.ents.cyl.body.velocity, cs = Math.hypot(cv.x, cv.y, cv.z) || 1; fxJet(__nz, { x: -cv.x / cs, y: -cv.y / cs, z: -cv.z / cs }); sndJetStart(); }
      if (G.phase === 'result') sndLoopStop('jet');
      // カメラの方針：連鎖の間は「安定した引き画」のまま。ステップごとには動かさない（見る場所は光る輪で示す）。
      // 寄るのは 1 つの未来につき 1 回だけ（CFG.beat.key のステップ）。寄ったらもとの引き画へゆっくり戻る。
      // ロケットの間（④）は、手前の壁を消して外から部屋全体を見る。ボンベを追う目線の動きはごく小さく。
      let base = camWide(G.S.target);
      if (G.S.target === 'cyl' && F.rocketOn) {
        const RC = CFG.rocketCam, cp = posOf(G.S.ents.cyl);
        base = { x: RC.x, y: RC.y, z: RC.z, lx: RC.cx * 0.7 + cp.x * 0.3, ly: RC.cy * 0.7 + cp.y * 0.3, lz: RC.cz * 0.7 + cp.z * 0.3, fov: RC.fov };
        if (G.S.hero.alive) { fxTrailPush(cp); fxTrailDraw(); }      // ボンベのうしろの短い軌跡
      }
      let goal = base, kk = G.S.target === 'cyl' && F.rocketOn ? CFG.rocketCam.k : 2.2;
      if (G.push && G.phase === 'sim' && !G.fast) {
        const age = G.time - G.push.t0;
        if (age >= K.pushDur) G.push = null;
        else {
          const sm = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
          const wgt = sm(age / K.pushIn) * (1 - sm((age - (K.pushDur - K.pushOut)) / K.pushOut));
          const p = posOf(G.S.ents[G.push.focus]), w = camWide(G.S.target);
          let dx = w.x - p.x, dz = w.z - p.z; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
          const t = { x: clamp(p.x + dx * K.pushDist, -3.8, 3.8), y: clamp(p.y + 1.3, 1.9, 3.6), z: Math.min(4.5, p.z + dz * K.pushDist), lx: p.x, ly: Math.max(0.6, p.y), lz: p.z, fov: K.pushFov };
          goal = {}; for (const k in base) goal[k] = base[k] + (t[k] - base[k]) * wgt;
          kk = 6;
        }
      }
      camGo(goal, dt, kk);
      wallOff = G.S.target === 'cyl' && CAM.p.z > 4.5;              // 外から見ている間は手前の壁を消す
      hlUpdate();
    }

    for (const m of ROOM.front) m.visible = !wallOff;
    if (G.phase === 'result' && FX.trailPts.length) { FX.trailPts.length = 0; fxTrailDraw(); }
    roomSync(G.S, G.time); peopleSync(G.S, G.time);
    applyGrade(dt);
    fxUpdate(dt * G.ts); fxTracerUpdate(dt); fxShockUpdate(dt * G.ts);
    if (G.phase !== 'freeze') camApply(FX.shake);
    renderer.render(scene, camera);
  }
  G.dbg = { fire, retry: doRetry, endIntro, intro: startIntro };
  requestAnimationFrame(frame);
})();
