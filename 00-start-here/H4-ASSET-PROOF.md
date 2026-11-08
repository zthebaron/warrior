# H4 asset pipeline — proof runs (2026-11-08)

Toolchain: Blender 5.2.3 LTS · KTX-Software v4.4.2 (`ktx`) · gltf-transform 4.5.1.
Pipeline: `npm run assets` = blender -> resize -> ktx2 (ETC1S) -> draco (last), then manifest + budget.

## a — `rm -rf assets/dist && npm run assets`, from nothing

```
asset            tris (inst x n)     src        resize     ktx2       draco      ratio
stair_run_12     108 x 12 = 1296     203.3 KB   81.0 KB    21.3 KB    13.1 KB    15.6x
                 collider trimesh (visual mesh) · bbox [0,0,-2]..[0.4,0.26667,2] · textures stair_run_12_stone:image/png -> image/ktx2

assets/dist: 2 files, 14.3 KB (budget 8192.0 KB; per asset 512.0 KB)
ASSETS OK  assets/dist/ regenerated
```

Reproducible: two from-nothing builds (`rm -rf assets/dist assets/build`) are byte-identical:

```
d57a685afa7307df5498effd7923d2c85c1d3045ff33d756eba410f0da0cd4e0  assets/dist/manifest.json
b8622d225da83bb16a90734bc4494969e4091e38c68fb77d6d6dc6df1a2577ed  assets/dist/stair_run_12.glb
34aef116bc7f241d0b698cef44a64c67e0f5ca7895bfcbab27f6d28b36deeaf8  assets/src/stair_run_12.glb
a3e87de11656dfeb12a5c6f0e08e5218c1b64ceee93ba5ebe248977cb2c86fea  assets/src/stair_run_12.meta.json
```

The shipped glb uses `KHR_draco_mesh_compression` + `KHR_texture_basisu` (256x256 ETC1S, 11.2 KB).

Failure paths verified: tri budget forced below 108 -> blender exit 1 -> build fails; `ktx` missing ->
exit 2 before any stage, assets/dist untouched; collision-mesh branch (forced threshold) emits
`stair_run_12_collision`, the loader collides against it and never draws it (nav green, draw calls
unchanged).

## b — lint

`LINT PASS 00-gym`. The stairs keep the critical path's 4.8u run / 3.2u rise (12 x 0.2667 risers over
0.4u treads, 33.7deg < 50deg), so the waypoint did not move.

## c — playtest

All 8 stages green, 39/39; nav 23/23 waypoints, every move type. The stair segment now takes 0.80s
(3.26s on the old 0.4-high box steps).

## d — instancing

Draw calls 30 -> 23: 8 box meshes out (-8), 1 InstancedMesh in (+1). Triangles 640 -> 1,840 =
640 - 8x12 + 12x108: all 12 treads in one draw call. Close-up with the KTX2 stone texture:
`docs/build-log/h4-stairs-closeup.png`.
