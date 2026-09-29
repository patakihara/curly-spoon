#!/usr/bin/env bash
# Makes the stand-in body of Audiobookshelf's recorded file call: a 20 s 440 Hz sine tone in the
# codec and container the recorded book names (AAC mono 22.05 kHz, MP4). The real file is a
# household audiobook and is never committed. faststart puts the index first, so a player can
# start from the first range; bitexact and no metadata keep ffmpeg's name and version out.
#
#   scripts/fixtures/tone.sh <out.m4a>
set -euo pipefail

out="${1:?usage: tone.sh <out.m4a>}"
ffmpeg -hide_banner -loglevel error -y \
  -f lavfi -i 'sine=frequency=440:sample_rate=22050:duration=20' \
  -ac 1 -c:a aac -b:a 32k \
  -map_metadata -1 -fflags +bitexact -flags:a +bitexact \
  -movflags +faststart -f mp4 "$out"
ffprobe -hide_banner -loglevel error \
  -show_entries stream=codec_name,sample_rate,channels:format=format_name,duration \
  -of default=noprint_wrappers=1 "$out"
