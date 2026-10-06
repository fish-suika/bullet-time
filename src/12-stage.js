// ===== STAGE 1「単純な未来」の配置（データだけ。three.js は使わない） =====
// 座標：x は右、y は上、z は手前（窓の側）。部屋は x ±5.5、z -4.8〜4.8、高さ 4.2。
// 向き yaw：0 で -z（奥）を向く。yawToward(dx,dz) で向きたい方向から求める
const STAGE1 = {
  title: '単純な未来',
  goal: '主人公を助けろ',
  room: { x: 4.2, zBack: -4.8, zFront: 4.8, h: 4.2 },
  window: { x: 0, y: 1.75, w: 1.5, h: 1.1 },        // 手前の壁の窓（ここを割って弾が入る）
  gun: { x: 0, y: 1.75, z: 9.5 },                    // 窓の外の狙撃銃
  branch: { x: 0, y: 1.75, z: 1.8 },                 // 分岐点（時間が止まる場所）
  // body: half は箱の半分の大きさ。mass 0 は動かない
  ents: {
    hero:   { kind: 'person', pos: [0, 0.7, -4.15],  half: [0.3, 0.7, 0.3],   mass: 60, yaw: Math.PI },
    A:      { kind: 'person', pos: [0, 0.9, -1.3],   half: [0.28, 0.9, 0.22], mass: 75, yaw: 0 },
    B:      { kind: 'person', pos: [2.6, 0.9, -2.4], half: [0.28, 0.9, 0.22], mass: 75, yaw: Math.PI * 0.85 },
    lamp:   { kind: 'lamp',   pos: [0, 3.0, -2.1],   radius: 0.3, mass: 4 },
    table:  { kind: 'table',  pos: [0, 0.4, 0.6], half: [1.7, 0.4, 0.5],   mass: 0 },
    banana: { kind: 'banana', pos: [-1.2, 0.87, 0.6], half: [0.14, 0.04, 0.06], mass: 0.3, yaw: 0.5 },
    bottle: { kind: 'bottle', pos: [1.2, 0.95, 0.6], half: [0.045, 0.15, 0.045], mass: 0.6 },
    crate:  { kind: 'crate',  pos: [3.2, 0.4, -3.2], half: [0.4, 0.4, 0.4],   mass: 25 },
    cyl:    { kind: 'cyl',    pos: [3.6, 0.65, -4.4], half: [0.17, 0.65, 0.17], mass: 30 },
  },
  chainTop: 4.2,             // 鎖の上端（天井）
  // 撃てる対象。aim は弾が当たる点
  targets: [
    { id: 'A',      name: '敵A',     aim: { x: 0,     y: 1.3,  z: -1.05 } },
    { id: 'lamp',   name: 'ランプ',  aim: { x: 0,     y: 3.85, z: -2.1 } },
    { id: 'banana', name: 'バナナ',  aim: { x: -1.2, y: 0.95, z: 0.6 } },
    { id: 'bottle', name: 'ワイン瓶', aim: { x: 1.2,  y: 1.08, z: 0.6 } },
  ],
};

function yawToward(dx, dz) { return Math.atan2(-dx, -dz); }
function yawFwd(yaw) { return { x: -Math.sin(yaw), z: -Math.cos(yaw) }; }
