#!/bin/sh
# 分割ソースを1枚のHTMLに結合する
cd "$(dirname "$0")"

# --- 本体 ---
cat src/00-head.html \
    src/10-config.js \
    src/12-stage.js \
    src/14-physics.js \
    src/16-chain.js \
    src/18-enemy.js \
    src/22-sound.js \
    src/30-room.js \
    src/40-people.js \
    src/44-fx.js \
    src/45-camera.js \
    src/46-bullet.js \
    src/50-input.js \
    src/60-hud.js \
    src/90-boot.js \
    src/99-tail.html > bullet-time.html
cp bullet-time.html index.html   # GitHub Pages はルートの index.html を配信する

# --- 検証ページ ---
# 本体と同じく1枚に結合する（three.js を使わない部分だけ）
cat src/verify-head.html \
    src/10-config.js \
    src/12-stage.js \
    src/14-physics.js \
    src/16-chain.js \
    src/18-enemy.js \
    src/46-bullet.js \
    src/verify-tests.js \
    src/99-tail.html > verify.html

echo "built bullet-time.html + index.html ($(wc -c < bullet-time.html) bytes)"
echo "built verify.html ($(wc -c < verify.html) bytes)"
