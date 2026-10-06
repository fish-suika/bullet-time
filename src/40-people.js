// ===== 人型（箱の組み合わせ）。立っている間は位置を追い、倒れる・吹き飛ぶときは剛体の動きにそのまま乗る =====
const PEOPLE = {};

function makePerson(scene, id, look) {
  const d = STAGE1.ents[id], hy = d.half[1];
  const outer = new THREE.Group(), g = new THREE.Group();     // outer：剛体の中心に合わせる／g：足元が原点
  g.position.y = -hy; outer.add(g); scene.add(outer);
  const skin = stdMat(0xd6a984, 0.7), cloth = stdMat(look.cloth, 0.8), pants = stdMat(look.pants, 0.85), dark = stdMat(0x111214, 0.5, 0.4);
  const P = { outer, g, id, limbs: {}, seated: id === 'hero' };
  const limb = (x, y, w, h, d2, mat, pivotY) => {            // 上端を軸に回せる四肢
    const piv = new THREE.Group(); piv.position.set(x, y, 0); g.add(piv);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d2), mat); m.position.y = -h / 2; m.castShadow = true; m.receiveShadow = true; piv.add(m);
    return piv;
  };
  if (!P.seated) {
    P.limbs.legL = limb(-0.1, 0.84, 0.16, 0.84, 0.18, pants);
    P.limbs.legR = limb(0.1, 0.84, 0.16, 0.84, 0.18, pants);
  } else {
    // 椅子にすわる：ももは前へ、すねは下へ。椅子と縄
    const wood = stdMat(0x4a3320, 0.8);
    mkBox(g, 0.5, 0.06, 0.5, wood, 0, 0.45, 0.02);
    mkBox(g, 0.5, 0.55, 0.05, wood, 0, 0.75, 0.27);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mkBox(g, 0.05, 0.45, 0.05, wood, sx * 0.21, 0.22, sz * 0.21 + 0.02);
    for (const sx of [-1, 1]) {
      mkBox(g, 0.16, 0.16, 0.45, pants, sx * 0.1, 0.56, -0.2);
      mkBox(g, 0.15, 0.45, 0.15, pants, sx * 0.1, 0.3, -0.42);
    }
    P.rope = mkBox(g, 0.54, 0.06, 0.34, stdMat(0xb89a64, 0.9), 0, 1.0, 0);
  }
  const torsoY = P.seated ? 0.88 : 1.16;
  const torso = mkBox(g, 0.5, 0.62, 0.28, cloth, 0, torsoY, 0); P.torso = torso;
  P.head = new THREE.Group(); P.head.position.set(0, torsoY + 0.42, 0); g.add(P.head);
  const masked = !!look.mask, face = { x: 0, y: 0, z: -0.121 };      // 顔は体の前（-Z）。ここに目がある
  const hm = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.27, 0.24), masked ? stdMat(0x17181b, 0.9) : skin); hm.castShadow = true; P.head.add(hm);
  if (!masked) { const hair = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.1, 0.26), stdMat(look.hair, 0.9)); hair.position.set(0, 0.11, 0.01); P.head.add(hair); }
  const eyeM = new THREE.MeshBasicMaterial({ color: masked ? 0xfff2cc : 0x16120e });
  if (masked) {                                            // 目出し帽：前だけに肌色の細い窓と、明るい目
    const slit = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.055, 0.006), skin); slit.position.set(0, 0.03, face.z); P.head.add(slit);
  }
  for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.032, 0.006), eyeM); e.position.set(sx * 0.052, 0.03, face.z - 0.004); P.head.add(e); }
  if (look.vest) {                                         // 体の前：明るいベストとベルトのバックル（背中は無地）
    mkBox(g, 0.36, 0.44, 0.02, stdMat(look.vest, 0.7), 0, torsoY + 0.03, -0.145, false);
    mkBox(g, 0.5, 0.06, 0.3, dark, 0, torsoY - 0.3, 0, false);
    mkBox(g, 0.075, 0.055, 0.02, stdMat(0xc8a84a, 0.3, 0.8), 0, torsoY - 0.3, -0.155, false);
  }
  if (P.seated) {
    const gag = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.05, 0.26), stdMat(0xd8d0c0, 0.9)); gag.position.y = -0.06; P.head.add(gag);
  } else {
    P.limbs.armL = limb(-0.31, torsoY + 0.27, 0.11, 0.6, 0.11, cloth);
    P.limbs.armR = limb(0.31, torsoY + 0.27, 0.11, 0.6, 0.11, cloth);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.2, 0.08), dark); gun.position.set(0, -0.68, -0.02); gun.castShadow = true; P.limbs.armR.add(gun);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), skin); hand.position.y = -0.62; P.limbs.armR.add(hand);
  }
  PEOPLE[id] = P;
  return P;
}

function buildPeople(scene) {
  makePerson(scene, 'hero', { cloth: 0xc8c4b8, pants: 0x3a4a63, hair: 0x2a1c12 });
  makePerson(scene, 'A', { cloth: 0x1b1d24, pants: 0x15161a, hair: 0x101010, mask: true, vest: 0x8f939b });
  makePerson(scene, 'B', { cloth: 0x4a5a3a, pants: 0x2a2a25, hair: 0x4a3a20, mask: true, vest: 0xc4bc9c });
}

function setArms(P, a, b, za, zb) {                    // x：前へ上げる角度／z：横へ開く角度（腕は肩を軸に回る）
  const L = P.limbs; if (!L.armL) return;
  L.armL.rotation.set(a, 0, za || 0, 'YXZ'); L.armR.rotation.set(b, 0, zb || 0, 'YXZ');
}
// 銃を持つ右腕だけを、狙う相手の胸へ向ける（体の向きに対する横の振れと、上下の角度を、肩から相手への方向で求める）
function aimRightArm(P, e, tp) {
  const p = e.body.position, y = e.yaw, hy = STAGE1.ents[e.id].half[1];
  const sx = p.x + Math.cos(y) * 0.31, sy = p.y - hy + 1.16 + 0.27, sz = p.z - Math.sin(y) * 0.31;    // 右肩の位置
  const dx = tp.x - sx, dy = tp.y - sy, dz = tp.z - sz;
  const yaw = Math.atan2(Math.sin(yawToward(dx, dz) - y), Math.cos(yawToward(dx, dz) - y));
  P.limbs.armR.rotation.set(Math.PI / 2 + Math.atan2(dy, Math.hypot(dx, dz)), yaw, 0, 'YXZ');
}

// 剛体 → 見た目、状態 → ポーズ
function peopleSync(S, time) {
  for (const id of ['hero', 'A', 'B']) {
    const P = PEOPLE[id], e = S.ents[id], p = e.body.position, q = e.body.quaternion;
    P.outer.position.set(p.x, p.y, p.z); P.outer.quaternion.set(q.x, q.y, q.z, q.w);
    let crouch = 1, headTilt = 0;
    if (id === 'hero') {
      P.head.rotation.x = S.hero.alive ? Math.sin(time * 1.3) * 0.05 : 0.6;
      continue;
    }
    const en = id === 'A' ? S.A : S.B, held = e.held;
    const L = P.limbs, st = en.state;
    let la = 0, ra = 0, za = 0, zb = 0, legs = 0, aimAt = null;
    // 全状態：A = aim / turn / standoff / fired / dodge / down、B = idle / lit / standoff / fired / dodge / down。
    // 撃つ姿勢は「銃を持つ右腕だけ」を相手へ向け、左腕は下ろす。倒れた・吹き飛んだ（down）ときは腕も足も力が抜けて、振らない。
    if (st === 'down') { la = 0.45; ra = -0.35; za = -0.5; zb = 0.6; legs = 0.25; }
    else if (st === 'dodge') { crouch = 0.55; la = ra = 2.4; }
    else if (id === 'A') {
      if (st === 'aim' || st === 'fired' || st === 'turn' || st === 'standoff') aimAt = chestOf(S.ents[S.target === 'duck' ? 'B' : 'hero']);   // 主人公を狙う。アヒルの未来では B のほうへ振り向く
    } else {
      if (st === 'idle') { la = 1.3; ra = 0.25; P.head.rotation.y = Math.sin(time * 0.5) * 0.15; }
      else if (st === 'lit' || st === 'standoff' || st === 'fired') aimAt = chestOf(S.ents.A);
    }
    setArms(P, la, ra, za, zb);
    if (aimAt) aimRightArm(P, e, aimAt);
    if (L.legL) { L.legL.rotation.x = legs; L.legR.rotation.x = -legs; }
    P.g.scale.y = crouch; P.g.position.y = -STAGE1.ents[id].half[1];
    if (id === 'A') P.head.rotation.x = headTilt;
  }
}
