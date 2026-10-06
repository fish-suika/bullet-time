// ===== STAGE 1「単純な未来」の配置（データだけ。three.js は使わない） =====
// 座標：x は右、y は上、z は手前（窓の側）。部屋は x ±4.2、z -4.8〜4.8、高さ 4.2。
// 向き yaw：0 で -z（奥）を向く。yawToward(dx,dz) で向きたい方向から求める
// 撃てる対象は 4 つ：敵 A（普通の答え）／消火器（地味な置物）／ゴムのアヒル（どうでもいい物）／ガスボンベ（いかにも正解）
const STAGE1 = {
  title: '単純な未来',
  goal: '主人公を助けろ',
  room: { x: 4.2, zBack: -4.8, zFront: 4.8, h: 4.2 },
  window: { x: 0, y: 1.75, w: 1.5, h: 1.1 },        // 手前の壁の窓（ここを割って弾が入る）
  gun: { x: 0, y: 1.75, z: 9.5 },                    // 窓の外の狙撃銃
  branch: { x: 0, y: 1.75, z: 1.8 },                 // 分岐点（時間が止まる場所）
  // half は箱の半分の大きさ、radius は球。held：手を離されるまで動かない
  ents: {
    hero:  { kind: 'person', pos: [0, 0.7, -4.15],  half: [0.3, 0.7, 0.3],   mass: 60, yaw: Math.PI },
    A:     { kind: 'person', pos: [0, 0.9, -1.3],   half: [0.28, 0.9, 0.22], mass: 75, yaw: 0 },
    B:     { kind: 'person', pos: [2.6, 0.9, -2.4], half: [0.28, 0.9, 0.22], mass: 75, yaw: Math.PI * 0.85 },
    lamp:  { kind: 'lamp',   pos: [0, 3.0, -2.1],   radius: 0.3, mass: 4 },                 // 部屋の明かり（ずっと吊られている）
    sprk:  { kind: 'sprk',   pos: [-0.8, 4.05, -3.4], radius: 0.16, mass: 0 },             // 天井のスプリンクラー（A の外れ弾の先）
    ext:   { kind: 'ext',    pos: [-1.2, 0.1, 1.6], half: [0.32, 0.1, 0.1], mass: 5, yaw: 0.727 },   // 床に寝ている消火器（向きはドラム缶のほう）
    drum:  { kind: 'drum',   pos: [0.6, 0.32, 0.0], radius: 0.32, mass: 10 },
    shelf: { kind: 'shelf',  pos: [3.4, 0.85, -2.85], half: [0.3, 0.85, 0.5], mass: 40 },   // B の後ろの棚
    paint: { kind: 'paint',  pos: [3.4, 1.82, -2.85], half: [0.1, 0.12, 0.1], mass: 1.5, held: true },   // 棚の上のペンキ缶
    duck:  { kind: 'duck',   pos: [-3.3, 1.42, -3.2], radius: 0.09, mass: 0.15, held: true },          // 左奥の棚の上のアヒル
    gun:   { kind: 'gun',    pos: [0.3, 0.3, -1.7], half: [0.05, 0.03, 0.11], mass: 0.5, held: true }, // 敵 A の銃（A が倒れると手を離れる）
    flash: { kind: 'flash',  pos: [2.3, 1.0, -2.7], half: [0.04, 0.04, 0.12], mass: 0.3, held: true }, // B の懐中電灯
    cyl:   { kind: 'cyl',    pos: [2.1, 0.65, 0.5], half: [0.17, 0.65, 0.17], mass: 30 },
  },
  chainTop: 4.2,             // 鎖の上端（天井）
  // 撃てる対象。aim は弾が当たる点
  targets: [
    { id: 'A',    name: '敵A',        aim: { x: 0,    y: 1.3,  z: -1.05 } },
    { id: 'ext',  name: '消火器',     aim: { x: -1.2, y: 0.22, z: 1.6 } },
    { id: 'duck', name: 'ゴムのアヒル', aim: { x: -3.3, y: 1.44, z: -3.2 } },
    { id: 'cyl',  name: 'ガスボンベ', aim: { x: 2.1,  y: 1.0,  z: 0.5 } },
  ],
};

function yawToward(dx, dz) { return Math.atan2(-dx, -dz); }
function yawFwd(yaw) { return { x: -Math.sin(yaw), z: -Math.cos(yaw) }; }
