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
    chainScale: 0.6,         // 命中後の連鎖を流す速さ（1 でそのまま。論理の時間は変えず、見る速さだけ遅くする）
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
  // 敵の共通
  enemy: {
    hearing: 7,              // 音が届く距離（音の大きさ 1 のとき）
    aimErr: 0.015,           // ふだんの狙いのずれ（ラジアン）
    bRun: 4.4, bRunJit: 0.4, // B の駆け足の速さ
    turnRate: 4.5,           // 振り向く速さ（rad/s）。光が主人公へ振れるのが見える速さ
  },
  // ① 敵 A を撃つ：銃が滑る → B が拾おうとする → 棚が揺れる → ペンキ缶 → B がめちゃくちゃに撃つ
  gunSlide: {
    speed: 3.4,              // 銃が床を滑り出す速さ（B の足元で止まるように）
    aim: { x: 2.2, z: -2.2 },// 銃の行き先（B の足元）
    aimJit: 0.12,
    reactDelay: 0.3,         // 音を聞いてから動き出すまで
    pickDist: 0.45,          // この近さまで来たらかがむ
    buttAt: 0.35,            // かがんでからお尻が棚に当たるまで
    paintAt: 0.55,           // かがんでからペンキ缶が飛ぶまで
    paintFlight: 0.45,       // 缶の飛んでいる時間
    paintJit: 0.05,          // 缶の落ち先のばらつき（頭の大きさ内）
    shelfWobble: 0.9,        // 棚が揺れている時間
  },
  blind: {
    start: 0.45,             // 缶をかぶってから撃ち始めるまで
    shots: 7,                // めちゃくちゃに撃つ回数
    interval: 0.27,
    yawErr: 0.55,            // 主人公の方を中心にした、向きのばらつき（片側）
    pitchLo: -0.2, pitchHi: 0.15,
  },
  // ② 消火器：噴射して滑る → ドラム缶 → B をなぎ倒す → 懐中電灯 → A がまぶしい → スプリンクラー → 水浸し
  ext: {
    thrust: 45,              // 噴射の力（N）
    maxT: 2.6,               // 噴射の最長
    afterHit: 0.25,          // ドラム缶に当たってから噴射が止まるまで
  },
  drum: {
    homing: 38,              // 転がるドラム缶を B のほうへ寄せる力（N）
    homingT: 2.2,
    knockSpeed: 0.7,         // B を倒す最低の速さ
    push: 3.6, up: 1.6,      // B が飛ばされる強さ
  },
  flash: {
    throwDelay: 0.12,        // B が倒れてから懐中電灯が手を離れるまで
    flight: 0.55,            // 宙を舞う時間
    face: { dx: 0.1, y: 1.65, dz: -0.9 },   // A の顔の前（A の位置からの差）
    dazzleDelay: 0.45,       // 照らされてから A が反射で撃つまで
    aimErr: 0.03,            // スプリンクラーへの狙いのずれ
  },
  wet: {
    floodDelay: 0.7,         // スプリンクラーが当たってから「水浸し」になるまで
    riseMin: 0.45, riseMax: 0.9,   // 倒れてから起き上がり始めるまで
    standT: 0.55,            // 起き上がってからすべるまで
    friction: 0.08,          // 濡れた床の摩擦
    push: 2.6, up: 2.0,
  },
  // ③ アヒル：鳴く → A が B のほうへ振り向く → B が A を照らす → 撃ち合い
  duck: {
    loud: 0.95,
    aTurn: 0.4, bTurn: 0.35, bTurnJit: 0.08,
    fireMin: 0.12, fireMax: 0.3,     // 振り向いてから撃つまで
    aimErr: 0.02,
    push: 3.6, up: 1.2,              // 撃たれて飛ばされる強さ
  },
  // ④ ガスボンベ：爆発しない。栓が飛ぶ → ロケット → 敵は伏せる → 主人公の椅子に直撃
  rocket: {
    thrust: 450,             // 噴射の力（N）。速さの向きに押す
    maxSpeed: 9.5,
    launch: { x: -0.7, y: 0.28, z: 0.65 },   // 最初の向き（跳ね回ってから主人公へ寄る）
    steerFrom: 1.2,          // この時刻から主人公のほうへ寄せ始める
    steerRamp: 0.8,          // 完全に主人公へ向くまで
    restitution: 0.85,       // 壁・天井・床での跳ね返り
    dodgeDist: 3.2,          // 敵がこの近さまで来たら伏せる
    dodgeT: 1.1,
    hitSpeed: 2,             // 主人公に当たる最低の速さ
  },
  // 音の大きさ（1 で hearing の距離まで届く）
  loud: { clatter: 0.8 },
  // 物理
  phys: { gravity: -9.8, friction: 0.5, restitution: 0.15, iterations: 12 },
  // カメラ
  camera: {
    // fov は横の視野角（縦長の画面でも横に同じだけ入るように。縦は画面の比から求める）
    wide: { x: -1.0, y: 3.7, z: 4.6, lx: 0.5, ly: 0.7, lz: -2.4, fov: 68 },
    wideBy: { A: { x: -0.4, y: 3.2, z: 4.4, lx: 1.5, ly: 0.9, lz: -2.7, fov: 56 } },     // 対象ごとの引き画（① は B・棚・主人公のあたりを大きく）
    freeze: { x: 0, y: 3.6, z: 4.6, lx: 0, ly: 1.0, lz: -1.2, fov: 62 },
    follow: { back: 2.0, up: 0.45, side: 0.6, fov: 56 },
    near: { back: 0.9, up: 0.2, side: 0.3, fov: 30 },
    introSec: 2.5,
  },
  // 連鎖の見せ場：ステップ（ログ）が来るたびに一瞬スローにして、そのステップの物へカメラが寄る
  beat: { slow: 0.3, dur: 0.7, ease: 0.2, cooldown: 0.5, ffScale: 3,
    // 寄るのは 1 つの未来につき 1 回だけ（その未来の山場のステップ）。ほかのステップは、カメラを動かさず光る輪で示す
    key: { A: 'paint', ext: 'flashA', duck: 'shootout', cyl: 'heroHit' }, pushDur: 2.0, pushIn: 0.5, pushOut: 0.6, pushDist: 3.2, pushFov: 46, hlDur: 0.8, hlFade: 0.25,
    bounceSlow: 0.25, bounceDur: 0.45, bounceCool: 0.2, bounceMax: 6,   // ロケットの跳ね返り 1 回ごとの小さな見せ場（回数に上限）
    capMin0: 1.3, capBase: 0.7, capPer: 0.08,   // 字幕 1 つが最低限出ている実時間 = max(capMin0, capBase + capPer × 文字数)
    backlogScale: 0.25,                          // 字幕が追いついていない間の、見る速さ（さらに掛ける）
    rocketScale: 0.8 },                                                  // ロケットの間は、さらに少しゆっくり（見る速さだけ）
  // ロケットの間のカメラ：手前の壁を消して、部屋の外から全体を見る。ボンベと次にぶつかる所を結んで、ゆっくり追う
  rocketCam: { x: 0, y: 2.7, z: 9.2, cx: 0, cy: 1.4, cz: -0.3, fov: 52, k: 2.0 },
  ui: { hintSec: 2.2 },
  futures: 4,
};
