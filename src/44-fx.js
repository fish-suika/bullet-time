// ===== 演出：ガラス片・爆発・弾と軌跡・揺らぎ・予測線 =====
const FX = { scene: null, parts: [], free: [], shake: 0, flashLight: null, rings: [], tracers: [], bullet: null, trail: null, trailPts: [],
  preview: null, glow: null };

function glowTexture() {
  return canvasTex(64, 64, (g, w, h) => {
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,230,170,.8)'); r.addColorStop(1, 'rgba(255,200,120,0)');
    g.fillStyle = r; g.fillRect(0, 0, w, h);
  });
}

function initFx(scene) {
  FX.scene = scene;
  const bg = new THREE.BoxGeometry(1, 1, 1), sg = new THREE.SphereGeometry(1, 8, 6);
  for (let i = 0; i < 360; i++) {
    const m = new THREE.Mesh(i % 3 === 0 ? sg : bg, new THREE.MeshBasicMaterial({ transparent: true }));
    m.visible = false; scene.add(m);
    FX.parts.push({ m, life: 0, max: 1, vel: new THREE.Vector3(), grav: 0, spin: new THREE.Vector3(), s0: 1, s1: 1, o0: 1, sphere: i % 3 === 0 });
    FX.free.push(FX.parts[i]);
  }
  FX.flashLight = new THREE.PointLight(0xffa050, 0, 18, 1.5); scene.add(FX.flashLight);
  // 弾：真ちゅうの弾体と光（3 倍の大きさ。小さすぎて見えないので）
  const b = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.16, 12), new THREE.MeshBasicMaterial({ color: 0xffd27a })); body.rotation.x = Math.PI / 2; b.add(body);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.1, 12), new THREE.MeshBasicMaterial({ color: 0xfff0c0 })); tip.rotation.x = -Math.PI / 2; tip.position.z = -0.13; b.add(tip);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xaad4ff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
  glow.scale.set(0.16, 0.16, 1); b.add(glow); FX.glow = glow;
  b.scale.setScalar(2.4); b.visible = false; scene.add(b); FX.bullet = b;
  // 軌跡（過去の位置を点でつなぐ。古いほど暗い）
  const N = 60, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); tg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  FX.trail = new THREE.Line(tg, new THREE.LineBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
  FX.trail.frustumCulled = false; FX.trail.visible = false; scene.add(FX.trail);
  // 予測線（点線）
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(24 * 3), 3));
  FX.preview = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xffe08a, size: 0.07, transparent: true, opacity: 0.95, depthTest: false, sizeAttenuation: true }));
  FX.preview.frustumCulled = false; FX.preview.visible = false; FX.preview.renderOrder = 9; scene.add(FX.preview);
  // 空気の揺らぎ（弾の周りに広がる輪）
  const rg = new THREE.RingGeometry(0.9, 1.0, 40);
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0x8fc8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }));
    m.visible = false; scene.add(m); FX.rings.push(m);
  }
}

function fxSpawn(o) {
  const p = FX.free.pop(); if (!p) return null;
  const m = p.m;
  m.visible = true; m.position.set(o.x, o.y, o.z);
  m.material.color.setHex(o.color === undefined ? 0xffffff : o.color);
  m.material.blending = o.add ? THREE.AdditiveBlending : THREE.NormalBlending;
  m.material.depthWrite = !o.add;
  m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
  p.life = p.max = o.life; p.grav = o.grav || 0; p.s0 = o.s0; p.s1 = o.s1 === undefined ? o.s0 : o.s1; p.o0 = o.op === undefined ? 1 : o.op;
  p.vel.set(o.vx || 0, o.vy || 0, o.vz || 0);
  p.spin.set((Math.random() - 0.5) * (o.spin || 0), (Math.random() - 0.5) * (o.spin || 0), (Math.random() - 0.5) * (o.spin || 0));
  p.flat = !!o.flat;
  m.scale.setScalar(p.s0);
  if (o.flat) m.scale.set(p.s0, p.s0 * 0.15, p.s0 * 0.6);
  return p;
}
function rr(a) { return (Math.random() - 0.5) * 2 * a; }

function fxUpdate(dt) {
  for (const p of FX.parts) {
    if (p.life <= 0) continue;
    p.life -= dt;
    const m = p.m;
    if (p.life <= 0) { m.visible = false; FX.free.push(p); continue; }
    p.vel.y += p.grav * dt;
    m.position.addScaledVector(p.vel, dt);
    m.rotation.x += p.spin.x * dt; m.rotation.y += p.spin.y * dt; m.rotation.z += p.spin.z * dt;
    const k = 1 - p.life / p.max, s = p.s0 + (p.s1 - p.s0) * k;
    if (p.flat) m.scale.set(s, s * 0.15, s * 0.6); else m.scale.setScalar(s);
    m.material.opacity = p.o0 * (1 - k * k);
    if (m.position.y < 0.02 && p.grav < 0) { m.position.y = 0.02; p.vel.set(p.vel.x * 0.4, 0, p.vel.z * 0.4); p.spin.multiplyScalar(0.2); }
  }
  FX.shake = Math.max(0, FX.shake - dt * 2.2);
  FX.flashLight.intensity = Math.max(0, FX.flashLight.intensity - dt * 28);
}

function fxClear() {
  for (const p of FX.parts) if (p.life > 0) { p.life = 0; p.m.visible = false; FX.free.push(p); }
  FX.shake = 0; FX.flashLight.intensity = 0;
  for (const m of FX.rings) m.visible = false;
  for (const t of FX.tracers) FX.scene.remove(t.line);
  FX.tracers.length = 0;
  FX.bullet.visible = false; FX.trail.visible = false; FX.preview.visible = false; FX.trailPts.length = 0;
}

// --- 具体的な演出 ---
function fxGlassBreak(x, y, z, n) {                          // ガラス片（スローで舞う）
  for (let i = 0; i < n; i++) fxSpawn({ x: x + rr(0.7), y: y + rr(0.5), z, color: 0xcfe4ff, op: 0.75, life: 3.5, s0: 0.05 + Math.random() * 0.07, s1: 0.05,
    vx: rr(1.2), vy: Math.random() * 1.5, vz: -1 - Math.random() * 3, grav: -9, spin: 14, flat: true });
}
function fxShards(pos, color, n, up) {
  for (let i = 0; i < n; i++) fxSpawn({ x: pos.x, y: pos.y, z: pos.z, color, op: 0.9, life: 1.8, s0: 0.04 + Math.random() * 0.06, s1: 0.03,
    vx: rr(2.2), vy: (up || 2) * Math.random() + 0.5, vz: rr(2.2), grav: -9.8, spin: 18, flat: true });
}
function fxSparks(pos, n, color, power) {
  for (let i = 0; i < n; i++) fxSpawn({ x: pos.x, y: pos.y, z: pos.z, color: color || 0xffd890, add: true, life: 0.25 + Math.random() * 0.4, s0: 0.035, s1: 0.01,
    vx: rr(power || 3), vy: rr(power || 3) + 1, vz: rr(power || 3), grav: -6, spin: 0 });
}
function fxExplosion(pos) {
  for (let i = 0; i < 16; i++) fxSpawn({ x: pos.x + rr(0.3), y: pos.y + 0.2 + Math.random() * 0.8, z: pos.z + rr(0.3), color: i % 2 ? 0xff7a1a : 0xffc860, add: true, op: 0.95,
    life: 0.55 + Math.random() * 0.35, s0: 0.35, s1: 1.5 + Math.random() * 0.8, vx: rr(2.5), vy: Math.random() * 3, vz: rr(2.5), spin: 0 });
  for (let i = 0; i < 14; i++) fxSpawn({ x: pos.x + rr(0.4), y: pos.y + 0.5 + Math.random(), z: pos.z + rr(0.4), color: 0x2a2826, op: 0.8,
    life: 1.8 + Math.random(), s0: 0.5, s1: 2.2, vx: rr(1.5), vy: 1 + Math.random() * 2, vz: rr(1.5), spin: 0 });
  fxSparks(pos, 40, 0xffb050, 9);
  for (let i = 0; i < 18; i++) fxSpawn({ x: pos.x, y: pos.y + 0.4, z: pos.z, color: 0x3a3a3c, life: 1.6, s0: 0.07 + Math.random() * 0.1, s1: 0.07,
    vx: rr(8), vy: 2 + Math.random() * 7, vz: rr(8), grav: -9.8, spin: 14 });
  FX.flashLight.position.set(pos.x, pos.y + 1, pos.z); FX.flashLight.color.setHex(0xffa050); FX.flashLight.intensity = 9;
  FX.shake = Math.min(1.4, FX.shake + 1.0);
}
function fxMuzzle(pos) {
  FX.flashLight.position.set(pos.x, pos.y, pos.z); FX.flashLight.color.setHex(0xffd8a0); FX.flashLight.intensity = 4;
  fxSpawn({ x: pos.x, y: pos.y, z: pos.z, color: 0xffe8b0, add: true, life: 0.08, s0: 0.28, s1: 0.1, spin: 0 });
  fxSparks(pos, 6, 0xffe0a0, 2);
}
function fxTracer(a, b) {
  const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(a.x, a.y, a.z), new THREE.Vector3(b.x, b.y, b.z)]);
  const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 1, blending: THREE.AdditiveBlending }));
  FX.scene.add(line); FX.tracers.push({ line, life: 0.18 });
}
function fxTracerUpdate(dt) {
  for (let i = FX.tracers.length - 1; i >= 0; i--) {
    const t = FX.tracers[i]; t.life -= dt; t.line.material.opacity = Math.max(0, t.life / 0.18);
    if (t.life <= 0) { FX.scene.remove(t.line); t.line.geometry.dispose(); FX.tracers.splice(i, 1); }
  }
}

// 弾（位置と向き）。軌跡は pushTrail で足す
function fxBullet(pos, dir, vis) {
  const b = FX.bullet; b.visible = vis;
  if (!vis) return;
  b.position.set(pos.x, pos.y, pos.z);
  b.lookAt(pos.x + dir.x, pos.y + dir.y, pos.z + dir.z);
}
function fxTrailPush(pos) {
  const t = FX.trailPts; t.push({ x: pos.x, y: pos.y, z: pos.z });
  if (t.length > 60) t.shift();
}
function fxTrailDraw() {
  const t = FX.trailPts, g = FX.trail.geometry, p = g.attributes.position.array, c = g.attributes.color.array;
  FX.trail.visible = t.length > 1;
  for (let i = 0; i < 60; i++) {
    const q = t[Math.min(i, t.length - 1)] || { x: 0, y: 0, z: 0 }, k = t.length ? Math.max(0, 1 - (t.length - 1 - Math.min(i, t.length - 1)) / 60) : 0;
    p[i * 3] = q.x; p[i * 3 + 1] = q.y; p[i * 3 + 2] = q.z;
    const f = i < t.length ? Math.pow(i / Math.max(1, t.length - 1), 1.5) : 0;
    c[i * 3] = 0.55 * f; c[i * 3 + 1] = 0.8 * f; c[i * 3 + 2] = 1.0 * f;
  }
  g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true;
  g.setDrawRange(0, Math.max(0, t.length));
}

// 予測線：分岐点から選んだ対象まで、曲がる経路を点線で
function fxPreview(cv) {
  const pos = FX.preview.geometry.attributes.position.array;
  for (let i = 0; i < 24; i++) { const p = BUL.at(cv, i / 23); pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z; }
  FX.preview.geometry.attributes.position.needsUpdate = true; FX.preview.visible = true;
}

// 弾の周りの揺らぎ（輪が広がって消えるのを繰り返す）。camPos：輪を向ける先
function fxRings(pos, time, camPos, on) {
  FX.rings.forEach((m, i) => {
    if (!on) { m.visible = false; return; }
    const ph = ((time * 0.8 + i / 3) % 1);
    m.visible = true; m.position.set(pos.x, pos.y, pos.z); m.lookAt(camPos);
    m.scale.setScalar(0.1 + ph * 0.45);
    m.material.opacity = (1 - ph) * 0.3;
  });
}
