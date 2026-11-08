# tools/blender/stair_run_12.py — procedural 12-tread stone stair run (H4 asset pipeline)
#
#   blender --background --factory-startup --python-exit-code 1 --python tools/blender/stair_run_12.py
#   (tools/build_assets.mjs runs it exactly like that)
#
# Exports ONE tread, uncompressed, to assets/src/stair_run_12.glb. The run is repeated at runtime
# with an InstancedMesh, driven by node extras written here (repeat_count / repeat_step), so these
# constants are the single source of truth for the stair geometry.
#
# RULES (learned the hard way, see 00-start-here/DAY-0-PROOF-SPIKE.md §H4):
#   - export_apply=False. The Array modifier below is a PREVIEW of the run inside Blender only.
#     Applying it bakes 12 treads into the file. tools/build_assets.mjs asserts the exported
#     triangle count equals ONE tread's, so flipping this flag fails the build.
#   - No Draco here. Blender exports uncompressed; gltf-transform compresses as separate stages.
#   - Name is lower_snake_case: glTF rewrites spaces and strips dots.
#   - Byte-stable output: geometry is written with the data API, the texture comes from a seeded
#     PRNG (no Cycles bake), and the scene starts from factory settings.

import math
import os
import sys
from pathlib import Path

import bpy
import numpy as np

# ---------------- design constants ----------------
ASSET_NAME = "stair_run_12"
TREAD_COUNT = 12
TREAD_DEPTH = 0.4                 # run of one tread (u), along +X
RISER_HEIGHT = 3.2 / TREAD_COUNT  # rise of one tread (u): 12 treads climb the gym's 3.2u landing
TREAD_WIDTH = 4.0                 # across the stair (u)
BLOCK_HEIGHT = 2 * RISER_HEIGHT   # each stone block reaches down one riser under its neighbour
NOSING_CHAMFER = 0.03             # 45deg chamfer on the top-front edge of each tread (u)

TEXTURE_SIZE = 512                # source texture; gltf-transform resizes it in the pipeline
TEXTURE_SEED = 1207
UV_UNITS_PER_TILE = 1.0           # world units covered by one texture repeat

TRIANGLE_BUDGET = 64              # per exported tread

# ---------------- movement limits (mirror src/engine/physics.ts + tools/lint-level.mjs MOVE.ground) -----
GROUND_SLOPE_LIMIT_DEG = 50.0     # kcc.maxSlopeClimbDeg / MOVE.ground.slope
AUTOSTEP_MAX_HEIGHT = 0.5         # kcc.autostepMaxHeight / MOVE.ground.autostep
AUTOSTEP_MIN_WIDTH = 0.2          # kcc.autostepMinWidth
RISER_CLIMBABLE_MAX = 0.4         # H4 rule: keep risers under 0.4u (margin below the 0.5 autostep)

OUT = Path(__file__).resolve().parents[2] / "assets" / "src" / f"{ASSET_NAME}.glb"


def fail(msg):
    print(f"FAIL {ASSET_NAME}: {msg}", file=sys.stderr)
    sys.exit(1)


# ---------------- climbability asserts (before anything is built) ----------------
slope_deg = math.degrees(math.atan2(RISER_HEIGHT, TREAD_DEPTH))
if not RISER_HEIGHT < RISER_CLIMBABLE_MAX:
    fail(f"riser {RISER_HEIGHT:.4f}u >= {RISER_CLIMBABLE_MAX}u climbable limit")
if not RISER_HEIGHT < AUTOSTEP_MAX_HEIGHT:
    fail(f"riser {RISER_HEIGHT:.4f}u >= {AUTOSTEP_MAX_HEIGHT}u autostep")
if not slope_deg < GROUND_SLOPE_LIMIT_DEG:
    fail(f"stair slope {slope_deg:.2f}deg >= {GROUND_SLOPE_LIMIT_DEG}deg ground slope limit")
if not TREAD_DEPTH - NOSING_CHAMFER > AUTOSTEP_MIN_WIDTH:
    fail(f"flat tread {TREAD_DEPTH - NOSING_CHAMFER:.3f}u <= {AUTOSTEP_MIN_WIDTH}u autostep min width")
if not NOSING_CHAMFER < RISER_HEIGHT:
    fail("nosing chamfer taller than the riser")

# ---------------- scene ----------------
bpy.ops.wm.read_factory_settings(use_empty=True)

# Tread profile in the XZ plane (Blender Z up), extruded along Y. Local origin = floor level at the
# front of the riser, so instance k sits at k * (TREAD_DEPTH, 0, RISER_HEIGHT) and its top is at
# (k + 1) * RISER_HEIGHT.
R, D, H, C, W = RISER_HEIGHT, TREAD_DEPTH, BLOCK_HEIGHT, NOSING_CHAMFER, TREAD_WIDTH
profile = [  # counter-clockwise seen from -Y
    (0.0, R - H),  # bottom front
    (D, R - H),    # bottom back
    (D, R),        # top back
    (C, R),        # top, start of nosing chamfer
    (0.0, R - C),  # front, end of nosing chamfer
]
n = len(profile)
y0, y1 = -W / 2, W / 2
verts = [(x, y0, z) for x, z in profile] + [(x, y1, z) for x, z in profile]
faces = [
    tuple(range(n)),                         # -Y cap (normal -Y)
    tuple(n + i for i in reversed(range(n))),  # +Y cap (normal +Y)
]
for i in range(n):
    j = (i + 1) % n
    faces.append((i, n + i, n + j, j))       # side quads, outward normals

mesh = bpy.data.meshes.new(ASSET_NAME)
mesh.from_pydata(verts, [], faces)
mesh.validate(clean_customdata=False)
mesh.update()
# Sanity: every face normal must point away from the block centroid (outward), or lighting and
# back-face culling break.
centroid = np.mean(np.array(verts), axis=0)
for p in mesh.polygons:
    if np.dot(np.array(p.center) - centroid, np.array(p.normal)) <= 0:
        fail(f"face {p.index} normal points inward")

# Box-projected UVs: project each face onto the plane its normal is closest to.
uv = mesh.uv_layers.new(name="UVMap")
for p in mesh.polygons:
    ax = int(np.argmax(np.abs(np.array(p.normal))))
    for li in p.loop_indices:
        x, y, z = mesh.vertices[mesh.loops[li].vertex_index].co
        u, v = {0: (y, z), 1: (x, z), 2: (x, y)}[ax]
        uv.data[li].uv = (u / UV_UNITS_PER_TILE, v / UV_UNITS_PER_TILE)
for p in mesh.polygons:
    p.use_smooth = False  # flat-shaded cut stone

# ---------------- seeded procedural stone texture ----------------
rng = np.random.default_rng(TEXTURE_SEED)
S = TEXTURE_SIZE


def value_noise(cells):
    g = rng.random((cells + 1, cells + 1))
    g[-1, :], g[:, -1] = g[0, :], g[:, 0]  # wrap so the texture tiles
    t = np.linspace(0, cells, S, endpoint=False)
    i = t.astype(int)
    f = t - i
    f = f * f * (3 - 2 * f)
    a = g[np.ix_(i, i)]
    b = g[np.ix_(i, i + 1)]
    c = g[np.ix_(i + 1, i)]
    d = g[np.ix_(i + 1, i + 1)]
    fx, fy = f[None, :], f[:, None]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


noise = sum(value_noise(c) * w for c, w in ((4, 0.5), (8, 0.25), (16, 0.15), (64, 0.10)))
grain = rng.random((S, S)) * 0.06
lum = 0.42 + 0.22 * noise + grain               # mid-grey stone
tint = np.stack([lum * 1.00, lum * 0.97, lum * 0.92, np.ones_like(lum)], axis=-1)  # slightly warm
pixels = np.clip(tint, 0, 1).astype(np.float32)

img = bpy.data.images.new(f"{ASSET_NAME}_albedo", width=S, height=S, alpha=False)
img.colorspace_settings.name = "sRGB"
img.pixels.foreach_set(pixels.ravel())
img.file_format = "PNG"
img.pack()

mat = bpy.data.materials.new(f"{ASSET_NAME}_stone")
mat.use_nodes = True
nt = mat.node_tree
bsdf = next(nd for nd in nt.nodes if nd.type == "BSDF_PRINCIPLED")
bsdf.inputs["Roughness"].default_value = 0.92
bsdf.inputs["Metallic"].default_value = 0.0
tex = nt.nodes.new("ShaderNodeTexImage")
tex.image = img
tex.interpolation = "Linear"
nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
mesh.materials.append(mat)

obj = bpy.data.objects.new(ASSET_NAME, mesh)
bpy.context.scene.collection.objects.link(obj)

# Runtime instancing contract, in glTF (Y-up) terms: Blender X -> X, Z -> Y, Y -> -Z.
obj["repeat_count"] = TREAD_COUNT
obj["repeat_step"] = [TREAD_DEPTH, RISER_HEIGHT, 0.0]
obj["tread_depth"] = TREAD_DEPTH
obj["riser_height"] = RISER_HEIGHT
obj["tread_width"] = TREAD_WIDTH
obj["slope_deg"] = round(slope_deg, 4)
obj["collider"] = "trimesh"

# Preview of the full run inside Blender ONLY — never applied on export (see RULES).
arr = obj.modifiers.new("run_preview", "ARRAY")
arr.count = TREAD_COUNT
arr.use_relative_offset = False
arr.use_constant_offset = True
arr.constant_offset_displace = (TREAD_DEPTH, 0.0, RISER_HEIGHT)

# ---------------- export ----------------
OUT.parent.mkdir(parents=True, exist_ok=True)
if OUT.exists():
    OUT.unlink()
res = bpy.ops.export_scene.gltf(
    filepath=str(OUT),
    export_format="GLB",
    use_selection=False,
    export_apply=False,                          # DO NOT bake the Array modifier
    export_draco_mesh_compression_enable=False,  # DO NOT use Blender's Draco
    export_extras=True,                          # carries repeat_count / repeat_step
    export_yup=True,
    export_materials="EXPORT",
    export_image_format="AUTO",
    export_normals=True,
    export_tangents=False,
    export_vertex_color="NONE",
    export_attributes=False,
    export_animations=False,
    export_cameras=False,
    export_lights=False,
    export_skins=False,
    export_morph=False,
    export_gpu_instances=False,
)
if "FINISHED" not in res or not OUT.exists():
    fail(f"glTF export did not finish: {res}")

triangles = sum(len(p.vertices) - 2 for p in mesh.polygons)
size = os.path.getsize(OUT)
print(f"ASSET {ASSET_NAME}  triangles={triangles}  bytes={size}  "
      f"treads={TREAD_COUNT} tread={TREAD_DEPTH}u riser={RISER_HEIGHT:.4f}u width={TREAD_WIDTH}u slope={slope_deg:.2f}deg "
      f"-> {OUT.relative_to(OUT.parents[2])}")
if triangles > TRIANGLE_BUDGET:
    fail(f"{triangles} triangles > budget {TRIANGLE_BUDGET}")
