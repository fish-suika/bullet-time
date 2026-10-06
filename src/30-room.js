// ===== 部屋・光・小物の見た目（薄暗い夜の倉庫） =====
const ROOM = { lampLight: null, hemi: null, moon: null, glass: null, views: {}, chain: null, lampBase: null, dust: [] };

function canvasTex(w, h, draw, rx, ry) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx || 1, ry || 1);
  t.anisotropy = 4;
  return t;
}
function noiseFill(g, w, h, base, amp, n) {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) {
    const v = Math.floor((Math.random() - 0.5) * amp);
    g.fillStyle = v > 0 ? 'rgba(255,255,255,' + (v / 255) + ')' : 'rgba(0,0,0,' + (-v / 255) + ')';
    g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 3);
  }
}
function mkBox(parent, w, h, d, mat, x, y, z, cast) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.castShadow = cast !== false; m.receiveShadow = true;
  parent.add(m); return m;
}
const stdMat = (color, rough, metal, extra) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: rough === undefined ? 0.85 : rough, metalness: metal || 0 }, extra || {}));

function buildRoom(scene) {
  const R = STAGE1.room, W = STAGE1.window, H = R.h, zl = R.zBack, zf = R.zFront, Wd = R.x * 2, D = zf - zl;
  scene.background = new THREE.Color(0x05070a);
  scene.fog = new THREE.Fog(0x05070a, 9, 24);

  // 材質（キャンバスで作った模様）
  const concrete = canvasTex(256, 256, (g, w, h) => {
    noiseFill(g, w, h, '#4a4c4e', 70, 2600);
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 2;
    g.strokeRect(1, 1, w - 2, h - 2);
  }, R.x * 2 / 2.2, D / 2.2);
  const wallTex = canvasTex(256, 256, (g, w, h) => {
    noiseFill(g, w, h, '#3c3a38', 50, 1800);
    g.fillStyle = 'rgba(0,0,0,.35)';
    for (let y = 0; y < h; y += 32) { g.fillRect(0, y, w, 2); for (let x = (y / 32 % 2) * 32; x < w; x += 64) g.fillRect(x, y, 2, 32); }
  }, 6, 2);
  const woodTex = canvasTex(128, 128, (g, w, h) => {
    noiseFill(g, w, h, '#6b4a2a', 40, 600);
    g.fillStyle = 'rgba(0,0,0,.3)'; for (let y = 0; y < h; y += 16) g.fillRect(0, y, w, 1.5);
  }, 1, 1);
  const floorM = stdMat(0xffffff, 0.9, 0, { map: concrete });
  const wallM = stdMat(0xffffff, 0.95, 0, { map: wallTex });
  const darkM = stdMat(0x1a1b1d, 0.9);
  const woodM = stdMat(0xffffff, 0.8, 0, { map: woodTex });
  const metalM = stdMat(0x25282b, 0.5, 0.7);

  // 光：窓からの月明かり（青白い光の筋）、吊りランプ（暖かい光）、うっすらした環境光
  ROOM.hemi = new THREE.HemisphereLight(0x4a5870, 0x1a1410, 0.3);
  scene.add(ROOM.hemi);
  const moon = new THREE.DirectionalLight(0x7f9ad0, 0.75);
  moon.position.set(0, 5.5, 13); moon.target.position.set(0, 0, -2);
  moon.castShadow = true; moon.shadow.mapSize.set(1024, 1024);
  Object.assign(moon.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 30 });
  moon.shadow.bias = -0.001;
  scene.add(moon, moon.target); ROOM.moon = moon;
  const lamp = new THREE.PointLight(0xffb464, 1.7, 15, 1.6);
  lamp.position.set(...STAGE1.ents.lamp.pos);
  lamp.castShadow = true; lamp.shadow.mapSize.set(1024, 1024); lamp.shadow.bias = -0.003; lamp.shadow.radius = 3;
  scene.add(lamp); ROOM.lampLight = lamp;

  // 床・天井・壁
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(Wd, D), floorM);
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, (zf + zl) / 2); floor.receiveShadow = true; scene.add(floor);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(Wd, D), darkM);
  ceil.rotation.x = Math.PI / 2; ceil.position.set(0, H, (zf + zl) / 2); scene.add(ceil);
  mkBox(scene, Wd, 3, 0.3, wallM, 0, 1.5, zl - 0.15);                          // 奥
  mkBox(scene, Wd, H - 3, 0.3, wallM, 0, 3 + (H - 3) / 2, zl - 0.15);
  mkBox(scene, 0.3, H, D, wallM, R.x + 0.15, H / 2, (zf + zl) / 2);            // 左右
  mkBox(scene, 0.3, H, D, wallM, -R.x - 0.15, H / 2, (zf + zl) / 2);
  // 手前の壁（窓の穴つき）
  const wy0 = W.y - W.h / 2, wy1 = W.y + W.h / 2, wx0 = W.x - W.w / 2, wx1 = W.x + W.w / 2;
  mkBox(scene, Wd, wy0, 0.3, wallM, 0, wy0 / 2, zf + 0.15);
  mkBox(scene, Wd, H - wy1, 0.3, wallM, 0, wy1 + (H - wy1) / 2, zf + 0.15);
  mkBox(scene, wx0 + R.x, W.h, 0.3, wallM, (-R.x + wx0) / 2, W.y, zf + 0.15);
  mkBox(scene, R.x - wx1, W.h, 0.3, wallM, (R.x + wx1) / 2, W.y, zf + 0.15);
  // 窓枠・ガラス
  mkBox(scene, 0.06, W.h + 0.1, 0.1, metalM, W.x, W.y, zf);
  mkBox(scene, W.w + 0.1, 0.06, 0.1, metalM, W.x, W.y, zf);
  mkBox(scene, W.w + 0.1, 0.07, 0.12, metalM, W.x, wy0, zf);
  mkBox(scene, W.w + 0.1, 0.07, 0.12, metalM, W.x, wy1, zf);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(W.w, W.h, 0.02),
    new THREE.MeshStandardMaterial({ color: 0x9fb8d8, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.28 }));
  glass.position.set(W.x, W.y, zf); scene.add(glass); ROOM.glass = glass;
  // 梁・柱・配管（暗い倉庫らしさ）
  for (let z = -4; z <= 4; z += 2) mkBox(scene, Wd, 0.25, 0.18, darkM, 0, H - 0.12, z);
  for (const sx of [-1, 1]) {
    mkBox(scene, 0.35, H, 0.35, wallM, sx * (R.x - 0.3), H / 2, -4.3);
    mkBox(scene, 0.35, H, 0.35, wallM, sx * (R.x - 0.3), H / 2, 1.5);
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, D, 8), metalM);
    pipe.rotation.x = Math.PI / 2; pipe.position.set(sx * (R.x - 0.1), 3.5, (zf + zl) / 2); scene.add(pipe);
  }
  // 棚と木箱（奥・左）
  mkBox(scene, 0.12, 2.4, 0.5, metalM, -4.8, 1.2, -3.2); mkBox(scene, 0.12, 2.4, 0.5, metalM, -3.3, 1.2, -3.2);
  for (const y of [0.6, 1.3, 2.0]) mkBox(scene, 1.6, 0.06, 0.55, metalM, -4.05, y, -3.2);
  mkBox(scene, 0.5, 0.4, 0.4, woodM, -4.3, 0.83, -3.2); mkBox(scene, 0.4, 0.3, 0.4, woodM, -3.6, 1.53, -3.2);
  mkBox(scene, 0.6, 0.6, 0.6, woodM, -4.6, 0.3, -1.6); mkBox(scene, 0.55, 0.5, 0.55, woodM, -3.9, 0.25, -1.5);
  for (const [x, z] of [[-5.0, 3.6], [-4.3, 3.9], [5.0, 2.8]]) {
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.9, 14), stdMat(0x2c3a4a, 0.5, 0.5));
    bar.position.set(x, 0.45, z); bar.castShadow = bar.receiveShadow = true; scene.add(bar);
  }

  // ほこり（ゆっくり漂う光の粒）
  const dg = new THREE.SphereGeometry(0.012, 4, 3), dm = new THREE.MeshBasicMaterial({ color: 0xffe0b0, transparent: true, opacity: 0.55 });
  for (let i = 0; i < 70; i++) {
    const m = new THREE.Mesh(dg, dm);
    m.position.set((Math.random() - 0.5) * 9, Math.random() * 3.6, -4 + Math.random() * 8);
    m.userData = { ph: Math.random() * 6.3, sp: 0.1 + Math.random() * 0.2 };
    scene.add(m); ROOM.dust.push(m);
  }
}

// 動く小物・テーブルなど（STAGE1.ents ごとに見た目を作る。位置は剛体から毎フレーム反映）
function buildProps(scene) {
  const E = STAGE1.ents;
  const woodM = stdMat(0x5a3d22, 0.8), darkM = stdMat(0x1a1b1d, 0.9);
  const V = ROOM.views;
  const wrap = (id, build) => { const g = new THREE.Group(); build(g); scene.add(g); V[id] = { obj: g }; return g; };

  wrap('table', g => {
    const h = E.table.half;
    mkBox(g, h[0] * 2, 0.07, h[2] * 2, woodM, 0, h[1] - 0.035, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mkBox(g, 0.07, h[1] * 2 - 0.07, 0.07, woodM, sx * (h[0] - 0.08), -0.035, sz * (h[2] - 0.08));
  });
  wrap('crate', g => {
    const h = E.crate.half[0], m = stdMat(0x7a5530, 0.8);
    mkBox(g, h * 2, h * 2, h * 2, m, 0, 0, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mkBox(g, 0.06, h * 2 + 0.02, 0.06, darkM, sx * (h - 0.02), 0, sz * (h - 0.02));
    mkBox(g, h * 2 + 0.02, 0.06, h * 2 + 0.02, darkM, 0, 0, 0);
  });
  wrap('cyl', g => {
    const r = 0.17, hh = E.cyl.half[1], m = stdMat(0xc0281e, 0.4, 0.3);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, hh * 2 - 0.2, 16), m); body.castShadow = true; g.add(body);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), m); dome.position.y = hh - 0.1; dome.castShadow = true; g.add(dome);
    const valve = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.14, 8), stdMat(0xb8a040, 0.4, 0.8)); valve.position.y = hh + 0.05; g.add(valve);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.004, r + 0.004, 0.1, 16), stdMat(0xe8e0d0, 0.6)); band.position.y = 0.15; g.add(band);
  });
  wrap('banana', g => {
    const m = stdMat(0xf2cf2a, 0.55), tip = stdMat(0x4a3a1a, 0.7);
    // 曲がったバナナ：3 つの棒をつないだ
    const seg = (x, y, rz, len) => { const s = mkBox(g, len, 0.075, 0.075, m, x, y, 0); s.rotation.z = rz; return s; };
    seg(-0.1, -0.012, 0.35, 0.12); seg(0, 0.012, 0, 0.14); seg(0.1, -0.012, -0.35, 0.12);
    mkBox(g, 0.03, 0.04, 0.04, tip, -0.165, -0.04, 0); mkBox(g, 0.035, 0.04, 0.04, tip, 0.165, -0.04, 0);
    g.scale.setScalar(1.15);
  });
  wrap('bottle', g => {
    const m = stdMat(0x1c4a2a, 0.15, 0.2, { transparent: true, opacity: 0.92 });
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.2, 12), m); b.position.y = -0.04; b.castShadow = true; g.add(b);
    const n = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.03, 0.12, 10), m); n.position.y = 0.12; n.castShadow = true; g.add(n);
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.047, 0.047, 0.07, 12), stdMat(0xe8dcc0, 0.8)); l.position.y = -0.05; g.add(l);
  });
  wrap('lamp', g => {
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.3, 20, 1, true), new THREE.MeshStandardMaterial({ color: 0x2d4a36, roughness: 0.5, metalness: 0.4, side: THREE.DoubleSide }));
    shade.position.y = 0.12; shade.castShadow = false; g.add(shade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), new THREE.MeshBasicMaterial({ color: 0xffe4a8 })); bulb.position.y = -0.04; g.add(bulb);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.12, 8), metalOf()); cap.position.y = 0.32; g.add(cap);
    ROOM.lampShade = shade;
  });
  // 鎖（天井からランプまで。ランプが落ちたら短く残る）
  const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1, 6), stdMat(0x333333, 0.4, 0.8));
  scene.add(chain); ROOM.chain = chain;
  // ランプの光る傘が壁や天井にも明かりを作る（光源は本体の位置に合わせる）
  function metalOf() { return stdMat(0x25282b, 0.5, 0.7); }
}

// 場面をはじめの状態に戻す（リトライのとき）
function roomReset() {
  for (const id in ROOM.views) ROOM.views[id].obj.visible = true;
  ROOM.lampLight.intensity = 1.7; ROOM.lampLight.color.setHex(0xffb464);
  ROOM.chainCut = false;
}

// 剛体の位置・向きを見た目に反映
function roomSync(S, time) {
  for (const id in ROOM.views) {
    const e = S.ents[id], v = ROOM.views[id];
    if (!e) continue;
    if (e.broken) { v.obj.visible = false; continue; }
    const p = e.body.position, q = e.body.quaternion;
    v.obj.position.set(p.x, p.y, p.z); v.obj.quaternion.set(q.x, q.y, q.z, q.w);
  }
  const lamp = S.ents.lamp, top = STAGE1.chainTop;
  if (!lamp.broken) {
    const y = lamp.body.position.y + 0.3, len = lamp.held ? top - y : 0.9;
    ROOM.chain.visible = true;
    if (lamp.held) { ROOM.chain.scale.y = len; ROOM.chain.position.set(lamp.body.position.x, y + len / 2, lamp.body.position.z); ROOM.chain.quaternion.set(0, 0, 0, 1); }
    else { ROOM.chain.scale.y = 0.9; ROOM.chain.position.set(STAGE1.ents.lamp.pos[0], top - 0.45, STAGE1.ents.lamp.pos[2]); }   // 切れて短くなった鎖
    ROOM.lampLight.position.set(lamp.body.position.x, lamp.body.position.y - 0.05, lamp.body.position.z);
  } else {
    ROOM.chain.scale.y = 0.9; ROOM.chain.position.set(STAGE1.ents.lamp.pos[0], top - 0.45, STAGE1.ents.lamp.pos[2]);
  }
  // ほこり
  for (const m of ROOM.dust) {
    const u = m.userData;
    m.position.y += Math.sin(time * u.sp + u.ph) * 0.0006; m.position.x += Math.cos(time * u.sp * 0.7 + u.ph) * 0.0006;
  }
}
