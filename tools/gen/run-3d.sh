#!/bin/sh
# Serial image-to-3D calls through the wrapper. One paid call at a time.
#   run-3d.sh trellis  <name> [<name> ...]   2 cent test   -> assets/build/gen/trellis/<name>.glb
#   run-3d.sh hunyuan  <name> [<name> ...]   final         -> assets/hero/raw/<name>.glb
# Payloads are written here from the accepted input in assets/hero/input/<name>.png, so the price
# the wrapper computes is the price of exactly this payload.
mode="$1"; shift
mkdir -p assets/build/gen/payloads
for n in "$@"; do
  p="assets/build/gen/payloads/$mode-$n.json"
  case "$mode" in
    trellis)
      printf '{ "image_url": "file:assets/hero/input/%s.png", "texture_size": 1024 }\n' "$n" > "$p"
      node tools/gen/fal-call.mjs call fal-ai/trellis --input "$p" --for "trellis test: $n" \
        --out assets/build/gen/trellis --name "$n" 2>&1 | tail -4 ;;
    hunyuan)
      printf '{ "input_image_url": "file:assets/hero/input/%s.png", "generate_type": "Normal", "enable_pbr": true }\n' "$n" > "$p"
      node tools/gen/fal-call.mjs call fal-ai/hunyuan3d-v3/image-to-3d --input "$p" --for "final: $n (Normal + PBR)" \
        --out assets/hero/raw --name "$n" 2>&1 | tail -8 ;;
    *) echo "unknown mode $mode"; exit 2 ;;
  esac
done
node tools/gen/fal-call.mjs total
