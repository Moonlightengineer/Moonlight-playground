#!/usr/bin/env bash
# Composite the title layer over the rendered plates, add the soundtrack and
# encode two deliverables (both two-pass H.264 + AAC, BT.709 tagged):
#   <out>-hq.mp4   ~20 Mbit/s, for uploading (YouTube, Instagram …)
#   <out>-web.mp4  ~3 Mbit/s (about 12 MB), for the web page
# usage: assemble.sh <plates.mkv | concat.txt> <overlay_dir> <score.wav> <out>
set -euo pipefail
FF=${FFMPEG:-ffmpeg}
plates=$1 overlay=$2 audio=$3 out=$4
if [[ $plates == *.txt ]]; then input=(-f concat -safe 0 -i "$plates"); else input=(-i "$plates"); fi
# RGB → BT.709 limited-range YUV, tagged, so colours match on every player
graph="[0:v][1:v]overlay=format=auto,scale=out_color_matrix=bt709:out_range=tv,format=yuv420p[v]"
tags=(-colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv)
encode() { # name preset video-bitrate maxrate bufsize audio-bitrate
  for pass in 1 2; do
    if [ $pass = 1 ]; then dest=(-an -f mp4 /dev/null); else dest=(-map 2:a -c:a aac -b:a "$6" -ar 48000 -movflags +faststart -shortest "$out-$1.mp4"); fi
    "$FF" -y -loglevel error "${input[@]}" -framerate 24 -i "$overlay/o_%04d.png" -i "$audio" \
      -filter_complex "$graph" -map "[v]" \
      -c:v libx264 -preset "$2" -tune film -b:v "$3" -maxrate "$4" -bufsize "$5" -pass $pass -passlogfile "$out-$1-x264" \
      -profile:v high -level 4.1 -pix_fmt yuv420p "${tags[@]}" "${dest[@]}"
  done
  rm -f "$out-$1-x264"*
}
encode hq slow 20M 30M 40M 320k
encode web veryslow 2900k 6000k 9000k 160k
ls -l "$out-hq.mp4" "$out-web.mp4"
