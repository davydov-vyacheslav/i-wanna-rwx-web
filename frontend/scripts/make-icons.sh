#!/usr/bin/env bash
# Regenerates the PWA icons in frontend/public from the iOS app artwork.
# Usage: scripts/make-icons.sh "<path to AppIcon 1.png>"   (needs ImageMagick 7: magick)
#
# The artwork is a 1024x1024 rounded tile on a black matte. The full-bleed icons are a square crop
# of the artwork that lies inside the tile's rounded corners (owner decision: crop, not extend).
# Parameters (tuned by eye on the contact sheet):
#   CROP, OFFSET     the square taken from the artwork: CROP px wide, OFFSET px in from every edge;
#                    the square's corners must stay inside the tile's rounded corners
# Self-check: the four 8x8 corner blocks of every output must have mean luminance above
# MIN_CORNER_LUMA (the black matte is 0; the artwork's own darkest corner is far above 3%).
set -euo pipefail

SRC=${1:?usage: make-icons.sh "<path to AppIcon 1.png>"}
OUT="$(cd "$(dirname "$0")/.." && pwd)/public"
CROP=780 OFFSET=122
MIN_CORNER_LUMA=0.03

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
# -strip and fixed chunks keep reruns byte-identical
PNG=(-strip -define png:exclude-chunks=date,time -depth 8 -alpha off)

# 1. the square crop
magick "$SRC" -crop "${CROP}x${CROP}+${OFFSET}+${OFFSET}" +repage "${PNG[@]}" "$WORK/full.png"

# 2. maskable: the same crop with no padding (owner decision: no flat border). Android's mask cuts only
# the corners; the character, books and key sit well inside the central 80% safe circle.
magick "$WORK/full.png" -filter Lanczos -resize 512x512 "${PNG[@]}" "$WORK/maskable.png"

# 3. outputs
magick "$WORK/full.png" -filter Lanczos -resize 180x180 "${PNG[@]}" "$OUT/apple-touch-icon.png"
magick "$WORK/full.png" -filter Lanczos -resize 192x192 "${PNG[@]}" "$OUT/icon-192.png"
magick "$WORK/full.png" -filter Lanczos -resize 512x512 "${PNG[@]}" "$OUT/icon-512.png"
cp "$WORK/maskable.png" "$OUT/icon-maskable-512.png"
magick "$WORK/full.png" -filter Lanczos -resize 48x48 "${PNG[@]}" "$OUT/favicon.png"

# 4. corner check (see header)
for f in apple-touch-icon icon-192 icon-512 icon-maskable-512 favicon; do
  size=$(magick identify -format %w "$OUT/$f.png")
  for geo in "+0+0" "+$((size - 8))+0" "+0+$((size - 8))" "+$((size - 8))+$((size - 8))"; do
    luma=$(magick "$OUT/$f.png" -crop "8x8$geo" +repage -colorspace Gray -format '%[fx:mean]' info:)
    awk -v l="$luma" -v m="$MIN_CORNER_LUMA" -v f="$f" 'BEGIN { if (l <= m) { print f ": corner luminance " l " <= " m; exit 1 } }'
  done
done
echo "icons written to $OUT"
