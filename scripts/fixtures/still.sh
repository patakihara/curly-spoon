#!/usr/bin/env bash
# Makes the stand-in bodies of Audiobookshelf's and Jellyfin's recorded image calls: one flat
# square in the format each recorded answer names. The real bodies are household cover art and are
# never committed. Bitexact and no metadata keep ffmpeg's name and version out.
#
#   scripts/fixtures/still.sh <out.webp|out.jpg>
#
# - .webp: Audiobookshelf's cover. 64 x 64 px, mid grey, lossless WebP.
# - .jpg: Jellyfin's primary image. 64 x 64 px, mid grey, baseline JPEG.
set -euo pipefail

out="${1:?usage: still.sh <out.webp|out.jpg>}"
common=(-map_metadata -1 -fflags +bitexact -flags:v +bitexact -frames:v 1)
case "$out" in
  *.webp)
    ffmpeg -hide_banner -loglevel error -y \
      -f lavfi -i 'color=c=0x808080:s=64x64' \
      -c:v libwebp -lossless 1 "${common[@]}" -f webp "$out"
    ;;
  *.jpg)
    ffmpeg -hide_banner -loglevel error -y \
      -f lavfi -i 'color=c=0x808080:s=64x64' \
      -c:v mjpeg -pix_fmt yuvj420p -q:v 5 "${common[@]}" -f image2 "$out"
    ;;
  *)
    echo "still.sh: no stand-in for $out" >&2
    exit 2
    ;;
esac
ffprobe -hide_banner -loglevel error \
  -show_entries stream=codec_name,width,height \
  -of default=noprint_wrappers=1 "$out"
