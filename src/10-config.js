// ===== 調整する数字はここだけ =====
const CFG = {
  // 時間の流れ
  time: {
    step: 1 / 60,            // 物理を進める刻み（秒）
    aFireAt: 3.5,            // 敵 A が主人公を撃つ時刻（命中から。資料どおり 3.5 秒）
    aFireJit: 0.15,          // 撃つ時刻のばらつき
    endAt: 6.0,              // 命中からこの時刻まで主人公が無事なら CLEAR
    hitHold: 1.3,            // 主人公が撃たれてから結果を出すまでの間
    simMax: 9,               // 念のための上限
  },
  // 弾の飛行（slow は演出用の「ゲーム内の時間の遅さ」。弾の進みは下の秒数で決める）
  bullet: {
    slowScale: 0.08,         // 飛行中の周りの時間（ガラス片・ちり）の速さ
    nearScale: 0.03,         // 命中直前の周りの時間
    fly1Sec: 0.95,           // 窓から分岐点まで
    fly1Extra: 0.55,         // 最初の 1 回だけ、窓の外から始まる分の追加秒
    fly2Sec: 1.8,            // 分岐点から命中まで
    nearFrac: 0.65,          // 経路のここから先を「近い」とする
    nearSpeed: 0.35,         // 近い間の速さ（それまでを 1 として）
    curve: 0.28,             // 曲がり方
    startZ: 9.5,             // 最初の 1 回の弾の出発点（窓の外）
  },
  // 敵
  enemy: {
    hearing: 7,              // 音が届く距離（音の大きさ 1 のとき）
    aimErr: 0.015,           // ふだんの狙いのずれ（ラジアン）
    startleDist: 3.2,        // A が驚く距離（砕ける音がこの近さ）
    panicDelay: 0.3,         // 驚いてから反射で撃つまで
    panicPitch: 0.75,        // 驚いたときに銃口が上へ跳ねる角度
    panicJit: 0.2,
    bTurn: 0.45,             // B が振り向いてから撃つまで
    bReactMin: 0.25, bReactMax: 0.45,   // バナナの音から駆け出すまで
    bRun: 4.4, bRunJit: 0.4, // 駆け足の速さ
    bDuck: 3.0,              // 伏せている時間
    slipDist: 0.55,          // バナナを踏む距離
    chaseTimeout: 3.0,
    misfireDelay: 0.18,      // 転んでから暴発するまで
    misfireErr: 0.04,        // 暴発の向きのずれ（ボンベのほうを向いている）
  },
  // バナナ
  banana: {
    landX: 1.8, landZ: -1.3, // 撃たれたバナナが落ちる場所（B の足元）
    land: 0.3,               // 落下点のばらつき（半径）
    flight: 1.0,             // 飛んでいる時間
    flightJit: 0.06,
  },
  // 爆発
  blast: {
    radius: 7.5,             // 吹き飛ぶ範囲
    lethal: 2.4,             // 主人公に当たる致死範囲（椅子ごと倒れてかわせるのはこの外）
    speed: 9,                // 吹き飛ぶ速さ
    min: 0.35,               // 遠くでも最低これだけの強さ
    up: 0.55,                // 上向きの成分
    spin: 3,
  },
  // 撃たれたときの衝撃
  hit: {
    aPush: 6.5,              // 敵 A を押す速さ
    aUp: 1.5,
  },
  // 音の大きさ（1 で hearing の距離まで届く）
  loud: { lamp: 1.0, allyDown: 0.9, banana: 0.5, bottle: 0.4 },
  // 物理
  phys: { gravity: -9.8, friction: 0.5, restitution: 0.15, iterations: 12, bananaFriction: 0.9 },
  // カメラ
  camera: {
    // fov は横の視野角（縦長の画面でも横に同じだけ入るように。縦は画面の比から求める）
    wide: { x: -1.3, y: 3.7, z: 4.6, lx: 1.0, ly: 0.7, lz: -2.4, fov: 66 },
    freeze: { x: 0, y: 3.6, z: 4.6, lx: 0, ly: 1.0, lz: -1.2, fov: 62 },
    follow: { back: 2.0, up: 0.45, side: 0.6, fov: 56 },
    near: { back: 0.9, up: 0.2, side: 0.3, fov: 30 },
    introSec: 2.5,
  },
  ui: { hintSec: 2.2 },
  futures: 4,
};
