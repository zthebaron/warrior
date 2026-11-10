#!/bin/sh
# After a final download: keep ONE untouched GLB in assets/hero/raw/, then build the shipped GLB.
#   finish.sh <name>
# fal returns the same GLB twice (model_glb and model_urls.glb) plus an OBJ and a thumbnail.
# The duplicate is byte-compared before it is dropped; the OBJ and thumbnail are not kept.
#
# Per-asset colour treatment (process.mjs explains each flag):
#   warrior  tone-matched to its painting, hue kept (he is the one asset with real colour)
#   torii    one flat hue: the authored accent vermilion_a from assets/src/accent.json
#   pine     tone-matched, then a single-hue ramp whose median is STYLE-BIBLE ink-deep (pine mass)
#   the rest tone-matched, then a single-hue ramp whose median is STYLE-BIBLE stone-mid
n="$1"
raw=assets/hero/raw
if [ -f "$raw/$n.model_glb.glb" ]; then
  cmp -s "$raw/$n.model_glb.glb" "$raw/$n.model_urls_glb.glb" || { echo "the two GLB downloads for $n differ; keeping both, stopping"; exit 1; }
  mv "$raw/$n.model_glb.glb" "$raw/$n.glb"
  rm -f "$raw/$n.model_urls_glb.glb" "$raw/$n.model_urls_obj.obj" "$raw/$n.thumbnail.png"
fi
mkdir -p assets/build/gen/out
case "$n" in
  warrior) set -- --match "assets/hero/input/$n.png" ;;
  torii)   set -- --tint e34234 --pin-median ;;
  pine)    set -- --match "assets/hero/input/$n.png" --elev 40 --tint 383838 --pin-median ;;
  *)       set -- --match "assets/hero/input/$n.png" --elev 25 --tint 827d76 --pin-median ;;
esac
# a2's importer (D-020) reads every assets/hero/*.glb as a shippable static hero asset, so a model
# that should not ship is kept one level down, out of its glob.
out="assets/hero/$n.glb"
[ "$n" = pine ] && { mkdir -p assets/hero/rejected; out="assets/hero/rejected/$n.glb"; }
node tools/gen/process.mjs "$raw/$n.glb" "$out" "$@" --stats "assets/build/gen/out/$n.stats.json" || exit 1
node tools/gen/render-glb.mjs "$out" "assets/build/gen/out/$n.views.png" --size 420 --views 0,35,90,215
