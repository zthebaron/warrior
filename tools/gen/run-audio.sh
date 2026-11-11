#!/bin/sh
# The game's sound, bought (D-022). Serial: one paid call at a time, each through fal-call.mjs, each held to
# this task's ceiling: the ledger stood at $11.60 when TITLE-AUDIO-SWORD began and the task may spend $4.00.
#
#   sh tools/gen/run-audio.sh <name>...     e.g.  sh tools/gen/run-audio.sh music-s11 jump slash
#
# A name is a payload, tools/gen/payloads/au-<name>.json (node tools/gen/make-audio-payloads.mjs writes them).
# Downloads go to assets/build/gen/audio/ (git-ignored). A second take of a name: add a suffix after a colon,
# `jump:b`, and the download is saved as jump_b.
set -e
cd "$(dirname "$0")/../.."
MAX_TOTAL=15.60
OUT=assets/build/gen/audio
for arg in "$@"; do
  name=${arg%%:*}
  take=${arg#*:}
  [ "$take" = "$arg" ] && stem=$name || stem=${name}_$take
  case $name in
    music-*) endpoint=fal-ai/stable-audio-25/text-to-audio ;;
    *) endpoint=fal-ai/elevenlabs/sound-effects/v3 ;;
  esac
  node tools/gen/fal-call.mjs call "$endpoint" --input "tools/gen/payloads/au-$name.json" --for "audio: $stem" --out "$OUT" --name "$stem" --max-total "$MAX_TOTAL"
done
node tools/gen/fal-call.mjs total
