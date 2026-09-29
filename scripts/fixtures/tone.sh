#!/usr/bin/env bash
# Makes the stand-in bodies of Audiobookshelf's recorded audio calls: sine tones in the codec and
# container each recorded answer names. The real bodies are household audiobooks and are never
# committed. Bitexact and no metadata keep ffmpeg's name and version out; MPEG-TS names its
# service instead of taking ffmpeg's default. The MP3 frames still carry LAME's encoder tag.
#
#   scripts/fixtures/tone.sh <out.m4a|out.mp3|out.mp2t>
#
# - .m4a: the single-file book's file call. 20 s at 440 Hz, AAC mono 22.05 kHz in MP4, with
#   faststart so a player can start from the first range.
# - .mp3: the multi-file book's file calls. 5 s at 330 Hz, MP3 mono 44.1 kHz.
# - .mp2t: the transcode's segment. 6 s at 550 Hz, MP3 mono 44.1 kHz in MPEG-TS, as ABS copies
#   an MP3 book into its HLS segments. Not .ts, which TypeScript would take for a source file.
set -euo pipefail

out="${1:?usage: tone.sh <out.m4a|out.mp3|out.mp2t>}"
common=(-map_metadata -1 -fflags +bitexact -flags:a +bitexact)
case "$out" in
  *.m4a)
    ffmpeg -hide_banner -loglevel error -y \
      -f lavfi -i 'sine=frequency=440:sample_rate=22050:duration=20' \
      -ac 1 -c:a aac -b:a 32k "${common[@]}" \
      -movflags +faststart -f mp4 "$out"
    ;;
  *.mp3)
    ffmpeg -hide_banner -loglevel error -y \
      -f lavfi -i 'sine=frequency=330:sample_rate=44100:duration=5' \
      -ac 1 -c:a libmp3lame -b:a 32k "${common[@]}" -write_xing 0 -id3v2_version 0 \
      -f mp3 "$out"
    ;;
  *.mp2t)
    ffmpeg -hide_banner -loglevel error -y \
      -f lavfi -i 'sine=frequency=550:sample_rate=44100:duration=6' \
      -ac 1 -c:a libmp3lame -b:a 32k "${common[@]}" \
      -metadata service_provider=Auralis -metadata service_name=tone \
      -f mpegts "$out"
    ;;
  *)
    echo "tone.sh: no stand-in for $out" >&2
    exit 2
    ;;
esac
ffprobe -hide_banner -loglevel error \
  -show_entries stream=codec_name,sample_rate,channels:format=format_name,duration \
  -of default=noprint_wrappers=1 "$out"
