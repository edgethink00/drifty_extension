#!/usr/bin/env bash
set -e

# ===== 스크립트 위치 기준 =====
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SVG="$SCRIPT_DIR/icon.svg"
SIZES=(16 48 128)

# ===== 파일 확인 =====
if [ ! -f "$SVG" ]; then
  echo "❌ icon.svg not found: $SVG"
  exit 1
fi

# ===== 아이콘 생성 =====
for SIZE in "${SIZES[@]}"; do
  rsvg-convert \
    -w "$SIZE" \
    -h "$SIZE" \
    "$SVG" \
    -o "$SCRIPT_DIR/icon${SIZE}.png"

  echo "✅ icon${SIZE}.png generated"
done

echo "🎉 All icons generated successfully"
