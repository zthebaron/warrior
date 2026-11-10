#!/bin/sh
# Serial: one paid call at a time. Usage: run-inputs.sh <version> <name> [<name> ...]
# e.g. run-inputs.sh v1 pine cliff   -> payloads/in-pine.json -> assets/build/gen/in/pine_v1.png
v="$1"; shift
for n in "$@"; do
  node tools/gen/fal-call.mjs call fal-ai/nano-banana/edit \
    --input "tools/gen/payloads/in-$n.json" --for "input image: $n $v" \
    --out assets/build/gen/in --name "$(echo "$n" | tr - _)_$v" 2>&1 | tail -3
done
node tools/gen/fal-call.mjs total
