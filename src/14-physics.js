// ===== 物理（cannon.js）。世界の構築・保持・衝突の記録・レイキャスト。three.js は使わない =====
function makeWorldBodies(S) {
  const st = S.stage, P = CFG.phys, w = new CANNON.World();
  w.gravity.set(0, P.gravity, 0);
  w.broadphase = new CANNON.NaiveBroadphase();
  w.solver.iterations = P.iterations;
  w.defaultContactMaterial.friction = P.friction;
  w.defaultContactMaterial.restitution = P.restitution;
  const matRocket = new CANNON.Material('rocket'), matGround = new CANNON.Material('ground');
  w.addContactMaterial(new CANNON.ContactMaterial(matGround, matRocket, { friction: 0, restitution: CFG.rocket.restitution }));
  S.world = w;

  // 床・天井・壁（吹き飛んだものが部屋の外へ出ないように）
  const R = st.room;
  const plane = (px, py, pz, nx, ny, nz, tag) => {
    const b = new CANNON.Body({ mass: 0, material: matGround });
    b.addShape(new CANNON.Plane());
    b.quaternion.setFromVectors(new CANNON.Vec3(0, 0, 1), new CANNON.Vec3(nx, ny, nz));
    b.position.set(px, py, pz); b.tag = tag; w.addBody(b);
  };
  plane(0, 0, 0, 0, 1, 0, 'floor');
  plane(0, R.h, 0, 0, -1, 0, 'ceil');
  plane(R.x, 0, 0, -1, 0, 0, 'wall'); plane(-R.x, 0, 0, 1, 0, 0, 'wall');
  plane(0, 0, R.zBack, 0, 0, 1, 'wall'); plane(0, 0, R.zFront, 0, 0, -1, 'wall');

  S.ents = {};
  for (const id in st.ents) {
    const d = st.ents[id];
    const e = { id, def: d, body: null, held: false, hold: { x: d.pos[0], y: d.pos[1], z: d.pos[2] }, yaw: d.yaw || 0, pv: new CANNON.Vec3(), broken: false };
    const b = new CANNON.Body({ mass: d.mass, material: id === 'cyl' ? matRocket : null });
    b.addShape(d.radius ? new CANNON.Sphere(d.radius) : new CANNON.Box(new CANNON.Vec3(d.half[0], d.half[1], d.half[2])));
    b.position.set(d.pos[0], d.pos[1], d.pos[2]);
    b.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), e.yaw);
    b.tag = id;
    if (d.kind === 'person' || d.kind === 'lamp' || d.kind === 'shelf' || d.held) e.held = true;   // 立っている人・吊られたもの・棚は、手を離されるまで動かない
    if (d.kind === 'person') { b.linearDamping = 0.05; b.angularDamping = 0.15; }
    if (id === 'drum') { b.linearDamping = 0.25; b.angularDamping = 0.1; }
    if (id === 'ext') { b.linearDamping = 0.05; b.angularDamping = 0.5; }
    b.addEventListener('collide', ev => { S.collisions.push({ ent: e, other: ev.body.tag, speed: Math.hypot(e.pv.x, e.pv.y, e.pv.z), ov: ev.body.velocity }); });
    e.body = b; w.addBody(b);
    S.ents[id] = e;
  }
}

function holdEnts(S) {
  const Y = new CANNON.Vec3(0, 1, 0);
  for (const id in S.ents) {
    const e = S.ents[id];
    if (!e.held || !e.body) continue;
    const b = e.body;
    b.position.set(e.hold.x, e.hold.y, e.hold.z);
    b.velocity.set(0, 0, 0); b.angularVelocity.set(0, 0, 0);
    b.quaternion.setFromAxisAngle(Y, e.yaw);
  }
}

function physStep(S, dt) {
  holdEnts(S);
  for (const id in S.ents) { const e = S.ents[id]; if (e.body) { const v = e.body.velocity; e.pv.set(v.x, v.y, v.z); } }
  S.world.step(dt);
}

function releaseEnt(e) { e.held = false; if (e.body) e.body.wakeUp(); }

// ===== レイキャスト（敵の射撃）。箱・球と、部屋の壁・天井・床 =====
function rayEnt(from, dir, e) {
  const b = e.body, d = e.def;
  if (d.radius) {                                           // 球
    const ox = from.x - b.position.x, oy = from.y - b.position.y, oz = from.z - b.position.z;
    const bq = ox * dir.x + oy * dir.y + oz * dir.z, c = ox * ox + oy * oy + oz * oz - d.radius * d.radius;
    const disc = bq * bq - c; if (disc < 0) return null;
    const t = -bq - Math.sqrt(disc); return t > 0 ? t : null;
  }
  const qi = b.quaternion.inverse();                        // 箱：回転を戻して軸に沿った箱として調べる
  const p = qi.vmult(new CANNON.Vec3(from.x - b.position.x, from.y - b.position.y, from.z - b.position.z));
  const v = qi.vmult(new CANNON.Vec3(dir.x, dir.y, dir.z));
  let t0 = 0, t1 = 1e9;
  const pp = [p.x, p.y, p.z], vv = [v.x, v.y, v.z], hh = d.half;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(vv[i]) < 1e-9) { if (Math.abs(pp[i]) > hh[i]) return null; continue; }
    let a = (-hh[i] - pp[i]) / vv[i], c = (hh[i] - pp[i]) / vv[i];
    if (a > c) { const t = a; a = c; c = t; }
    t0 = Math.max(t0, a); t1 = Math.min(t1, c);
    if (t0 > t1) return null;
  }
  return t0 > 0 ? t0 : null;
}

// from から dir（単位ベクトル）へ撃つ。最初に当たったものを返す
function castRay(S, from, dir, exclude) {
  let best = { t: 1e9, ent: null, surface: null };
  for (const id of ['hero', 'A', 'B', 'shelf', 'cyl', 'lamp', 'drum', 'ext']) {
    if (id === exclude) continue;
    const e = S.ents[id]; if (!e || e.broken) continue;
    const t = rayEnt(from, dir, e);
    if (t !== null && t < best.t) best = { t, ent: e, surface: null };
  }
  const R = S.stage.room;
  const planes = [[dir.x > 0 ? R.x : -R.x, 'x', 'wall'], [dir.z > 0 ? R.zFront : R.zBack, 'z', 'wall'],
                  [dir.y > 0 ? R.h : 0, 'y', dir.y > 0 ? 'ceiling' : 'floor']];
  for (const [val, ax, name] of planes) {
    if (Math.abs(dir[ax]) < 1e-9) continue;
    const t = (val - from[ax]) / dir[ax];
    if (t > 0 && t < best.t) best = { t, ent: null, surface: name };
  }
  best.point = { x: from.x + dir.x * best.t, y: from.y + dir.y * best.t, z: from.z + dir.z * best.t };
  return best;
}
