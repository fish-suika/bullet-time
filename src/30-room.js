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
  const floorM = stdMat(0xffffff, 0.9, 0, { map: concrete }); ROOM.floorM = floorM;
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
  for (let z = -4; z <= 2; z += 2) mkBox(scene, Wd, 0.25, 0.18, darkM, 0, H - 0.12, z);
  for (const sx of [-1, 1]) {
    mkBox(scene, 0.35, H, 0.35, wallM, sx * (R.x - 0.3), H / 2, -4.3);
    mkBox(scene, 0.35, H, 0.35, wallM, sx * (R.x - 0.3), H / 2, 1.5);
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, D, 8), metalM);
    pipe.rotation.x = Math.PI / 2; pipe.position.set(sx * (R.x - 0.1), 3.5, (zf + zl) / 2); scene.add(pipe);
  }
  // 棚と木箱（奥・左）
  mkBox(scene, 0.12, 2.4, 0.5, metalM, -3.9, 1.2, -3.2); mkBox(scene, 0.12, 2.4, 0.5, metalM, -2.6, 1.2, -3.2);
  for (const y of [0.6, 1.3, 2.0]) mkBox(scene, 1.4, 0.06, 0.55, metalM, -3.25, y, -3.2);
  mkBox(scene, 0.5, 0.4, 0.4, woodM, -3.5, 0.83, -3.2); mkBox(scene, 0.4, 0.3, 0.4, woodM, -2.9, 1.53, -3.2);
  mkBox(scene, 0.6, 0.6, 0.6, woodM, -3.5, 0.3, -1.6); mkBox(scene, 0.55, 0.5, 0.55, woodM, -2.8, 0.25, -1.5);
  for (const [x, z] of [[-3.6, 3.6], [-2.9, 3.9], [3.6, 2.8]]) {
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

// 動く小物・棚・ドラム缶など（STAGE1.ents ごとに見た目を作る。位置は剛体から毎フレーム反映）
function buildProps(scene) {
  const RZ = STAGE1.room.zFront;
  ROOM.front = scene.children.filter(m => m.isMesh && m.position.z > RZ - 0.06 && m.position.z < RZ + 0.4);   // 手前の壁（窓つき）。ロケットの間だけ消して、外から中を見せる
  const E = STAGE1.ents;
  const darkM = stdMat(0x1a1b1d, 0.9), metalG = stdMat(0x6b7078, 0.5, 0.6);
  const V = ROOM.views;
  const wrap = (id, build) => { const g = new THREE.Group(); build(g); scene.add(g); V[id] = { obj: g }; return g; };
  const cyl = (g, r0, r1, h, mat, x, y, z, cast) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, 16), mat); m.position.set(x, y, z); m.castShadow = cast !== false; g.add(m); return m; };

  wrap('ext', g => {                                       // 床に寝ている消火器（軸は x。ノズルは +x 側）
    const red = stdMat(0xc02a20, 0.35, 0.3), c = cyl(g, 0.085, 0.085, 0.48, red, -0.02, 0, 0); c.rotation.z = Math.PI / 2;
    const top = cyl(g, 0.05, 0.085, 0.07, red, -0.28, 0, 0); top.rotation.z = -Math.PI / 2;
    const band = cyl(g, 0.088, 0.088, 0.1, stdMat(0xeae4d0, 0.6), -0.05, 0, 0); band.rotation.z = Math.PI / 2;
    const valve = mkBox(g, 0.07, 0.04, 0.05, darkM, -0.2, 0.1, 0);
    const hose = cyl(g, 0.012, 0.012, 0.18, darkM, -0.3, -0.04, 0); hose.rotation.z = Math.PI / 2 + 0.5;
    ROOM.extNozzle = new THREE.Object3D(); ROOM.extNozzle.position.set(-0.4, -0.08, 0); g.add(ROOM.extNozzle);
  });
  wrap('drum', g => {                                      // 青いドラム缶（物理は球。転がるとごろごろ回る）
    const blue = stdMat(0x2a5a9a, 0.45, 0.4);
    cyl(g, 0.3, 0.3, 0.56, blue, 0, 0, 0);
    for (const y of [-0.17, 0.17]) cyl(g, 0.312, 0.312, 0.035, stdMat(0x1f4472, 0.5, 0.5), 0, y, 0);
    cyl(g, 0.27, 0.27, 0.02, stdMat(0x1b3f6a, 0.5, 0.4), 0, 0.29, 0);
  });
  wrap('shelf', g => {                                     // B の後ろの金属の棚（4 段・一番上にペンキ缶）
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mkBox(g, 0.05, 1.7, 0.05, metalG, sx * 0.27, 0, sz * 0.47);
    for (const y of [-0.82, -0.25, 0.32, 0.85]) mkBox(g, 0.6, 0.04, 1.0, metalG, 0, y, 0);
    mkBox(g, 0.4, 0.3, 0.4, stdMat(0x7a5530, 0.8), 0, -0.64, -0.1);
    mkBox(g, 0.35, 0.22, 0.5, stdMat(0x5a5f66, 0.6, 0.3), 0, -0.1, 0.1);
    mkBox(g, 0.3, 0.2, 0.3, stdMat(0x8a6a3a, 0.8), 0, 0.45, -0.15);
  });
  wrap('duck', g => {                                      // ゴムのアヒル（前は -Z）
    const y = stdMat(0xffd830, 0.5), o = stdMat(0xff8a1a, 0.5);
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 10), y); b.scale.set(1, 0.85, 1.25); b.castShadow = true; g.add(b);
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), y); h.position.set(0, 0.095, -0.07); g.add(h);
    mkBox(g, 0.05, 0.016, 0.045, o, 0, 0.09, -0.125, false);
    for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 6), new THREE.MeshBasicMaterial({ color: 0x111111 })); e.position.set(sx * 0.03, 0.11, -0.105); g.add(e); }
    const tail = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), y); tail.position.set(0, 0.04, 0.1); g.add(tail);
  });
  wrap('cyl', g => {                                       // ガスボンベ（赤）。ロケットになると軸 +y が機首
    const r = 0.17, hh = E.cyl.half[1], m = stdMat(0xe63424, 0.4, 0.3, { emissive: 0x7a1208, emissiveIntensity: 0.9 });   // 明るい赤＋うっすら自ら光る（暗い壁の前でも見える）
    cyl(g, r, r, hh * 2 - 0.2, m, 0, 0, 0);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), m); dome.position.y = hh - 0.1; dome.castShadow = true; g.add(dome);
    cyl(g, 0.04, 0.04, 0.14, stdMat(0xb8a040, 0.4, 0.8), 0, hh + 0.05, 0, false);
    cyl(g, r + 0.004, r + 0.004, 0.1, stdMat(0xe8e0d0, 0.6), 0, -0.3, 0, false);
    ROOM.cylTail = new THREE.Object3D(); ROOM.cylTail.position.set(0, -hh, 0); g.add(ROOM.cylTail);
  });
  wrap('lamp', g => {
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.3, 20, 1, true), new THREE.MeshStandardMaterial({ color: 0x2d4a36, roughness: 0.5, metalness: 0.4, side: THREE.DoubleSide }));
    shade.position.y = 0.12; shade.castShadow = false; g.add(shade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), new THREE.MeshBasicMaterial({ color: 0xffe4a8 })); bulb.position.y = -0.04; g.add(bulb);
    cyl(g, 0.04, 0.04, 0.12, stdMat(0x25282b, 0.5, 0.7), 0, 0.32, 0);
    ROOM.lampShade = shade;
  });
  // 鎖（天井からランプまで）
  const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1, 6), stdMat(0x333333, 0.4, 0.8));
  scene.add(chain); ROOM.chain = chain;
}

// 場面をはじめの状態に戻す（リトライのとき）
function roomReset() {
  for (const id in ROOM.views) ROOM.views[id].obj.visible = true;
  ROOM.lampLight.intensity = 1.7; ROOM.lampLight.color.setHex(0xffb464);
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
  const y = lamp.body.position.y + 0.3, len = top - y;
  ROOM.chain.scale.y = len; ROOM.chain.position.set(lamp.body.position.x, y + len / 2, lamp.body.position.z);
  ROOM.lampLight.position.set(lamp.body.position.x, lamp.body.position.y - 0.05, lamp.body.position.z);
  // ほこり
  for (const m of ROOM.dust) {
    const u = m.userData;
    m.position.y += Math.sin(time * u.sp + u.ph) * 0.0006; m.position.x += Math.cos(time * u.sp * 0.7 + u.ph) * 0.0006;
  }
}
