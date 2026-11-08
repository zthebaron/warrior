# tools/blender/stair_run_12.py — procedural 12-tread stone stair run.
#
#   blender --background --python-exit-code 1 --python tools/blender/stair_run_12.py
#
# Exports ONE tread, uncompressed, to assets/src/stair_run_12.glb. The run is repeated at
# runtime with InstancedMesh (metadata in assets/src/stair_run_12.meta.json) — never baked.
# Rules (00-start-here/MEASUREMENTS.md, DAY-0-PROOF-SPIKE.md §H4):
#   - no modifiers on the exported object at all: the bevel is built with bmesh, so
#     export_apply=False cannot silently drop it and no Array can ever be baked
#   - no Blender Draco: compression is a separate gltf-transform stage (tools/build_assets.mjs)
#   - collider is trimesh, always; a separate low-poly collision mesh is emitted when the
#     visual mesh exceeds COLLISION_MESH_OVER_TRIS
#   - asset names are lower_snake_case
# Any failed check raises -> blender exits 1 (with --python-exit-code 1) -> the build fails.

import json
import math
import os
import random
import re
import sys
from pathlib import Path

import bmesh
import bpy

# ---------------------------------------------------------------- parameters (edit these)
NAME = "stair_run_12"
TREAD_COUNT = 12
TREAD_DEPTH = 0.4            # m along the run (glTF +X)
RISER_HEIGHT = 3.2 / 12      # m per step (0.2667) — 12 treads rise 3.2 over 4.8, the gym's stair section
WIDTH = 4.0                  # m across the run (glTF Z)
BEVEL_WIDTH = 0.025          # m, worn stone edge
BEVEL_SEGMENTS = 2
TEXTURE_SIZE = 512           # px, source texture (the resize stage caps it)
TEXTURE_SEED = 1207          # stone noise is seeded: same input, same bytes
TRI_BUDGET_PER_TREAD = int(os.environ.get("TRI_BUDGET_PER_TREAD", "400"))
COLLISION_MESH_OVER_TRIS = int(os.environ.get("COLLISION_MESH_OVER_TRIS", "2000"))

# Movement limits the stairs must respect (MEASUREMENTS.md; MOVE.ground in tools/lint-level.mjs)
MAX_RISER = 0.4              # keep risers UNDER this
AUTOSTEP = 0.5               # PHYSICS_CONFIG.kcc.autostepMaxHeight
MAX_SLOPE_DEG = 50.0         # PHYSICS_CONFIG.kcc.maxSlopeClimbDeg

ROOT = Path(__file__).resolve().parents[2]
SRC_DIR = ROOT / "assets" / "src"
BUILD_DIR = ROOT / "assets" / "build"


def fail(msg: str) -> None:
    raise RuntimeError(f"[{NAME}] FAIL: {msg}")


# ---------------------------------------------------------------- checks before building
if not re.fullmatch(r"[a-z][a-z0-9_]*", NAME):
    fail(f'name "{NAME}" is not lower_snake_case (glTF rewrites spaces and strips dots)')
if not RISER_HEIGHT < MAX_RISER:
    fail(f"riser {RISER_HEIGHT:.4f} >= {MAX_RISER}")
if not RISER_HEIGHT <= AUTOSTEP:
    fail(f"riser {RISER_HEIGHT:.4f} > autostep {AUTOSTEP}")
slope_deg = math.degrees(math.atan2(RISER_HEIGHT * TREAD_COUNT, TREAD_DEPTH * TREAD_COUNT))
if not slope_deg < MAX_SLOPE_DEG:
    fail(f"run slope {slope_deg:.1f}deg >= ground limit {MAX_SLOPE_DEG}deg")

# ---------------------------------------------------------------- scene
bpy.ops.wm.read_factory_settings(use_empty=True)
SRC_DIR.mkdir(parents=True, exist_ok=True)
BUILD_DIR.mkdir(parents=True, exist_ok=True)


def box_bmesh(min_xyz, max_xyz) -> bmesh.types.BMesh:
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        for k in range(3):
            v.co[k] = min_xyz[k] if v.co[k] < 0 else max_xyz[k]
    return bm


def box_uv(bm: bmesh.types.BMesh, tile: float) -> None:
    """Box projection, assigned directly (UV operators are unreliable headless)."""
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        n = f.normal
        ax = max(range(3), key=lambda k: abs(n[k]))
        a, b = [k for k in range(3) if k != ax]
        for loop in f.loops:
            loop[uv].uv = (loop.vert.co[a] / tile, loop.vert.co[b] / tile)


# Blender is Z-up; the glTF exporter converts to Y-up: Blender X -> glTF X, Z -> Y, Y -> -Z.
# Tread origin: front-bottom-centre of tread 0. Tread i sits at i * (TREAD_DEPTH, RISER_HEIGHT).
lo = (0.0, -WIDTH / 2, 0.0)
hi = (TREAD_DEPTH, WIDTH / 2, RISER_HEIGHT)
bm = box_bmesh(lo, hi)
bmesh.ops.bevel(bm, geom=list(bm.edges), offset=BEVEL_WIDTH, segments=BEVEL_SEGMENTS, profile=0.5, affect="EDGES", clamp_overlap=True)
bmesh.ops.triangulate(bm, faces=list(bm.faces))
bm.normal_update()
box_uv(bm, tile=1.0)
mesh = bpy.data.meshes.new(NAME)
bm.to_mesh(mesh)
bm.free()
tread = bpy.data.objects.new(NAME, mesh)
bpy.context.scene.collection.objects.link(tread)
tris = len(mesh.polygons)  # triangulated above: 1 polygon = 1 triangle
if tris > TRI_BUDGET_PER_TREAD:
    fail(f"tread is {tris} tris > budget {TRI_BUDGET_PER_TREAD}")

# ---------------------------------------------------------------- stone texture (seeded value noise)
rng = random.Random(TEXTURE_SEED)
G = 16  # lattice cells per side
lattice = [[rng.random() for _ in range(G + 1)] for _ in range(G + 1)]
for i in range(G + 1):  # tileable
    lattice[i][G] = lattice[i][0]
    lattice[G][i] = lattice[0][i]


def noise(u: float, v: float) -> float:
    x, y = u * G, v * G
    i, j = int(x) % G, int(y) % G
    fx, fy = x - int(x), y - int(y)
    sx, sy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    a = lattice[i][j] + (lattice[i + 1][j] - lattice[i][j]) * sx
    b = lattice[i][j + 1] + (lattice[i + 1][j + 1] - lattice[i][j + 1]) * sx
    return a + (b - a) * sy


S = TEXTURE_SIZE
px = [0.0] * (S * S * 4)
for y in range(S):
    for x in range(S):
        u, v = x / S, y / S
        n = 0.6 * noise(u, v) + 0.3 * noise(u * 2 % 1, v * 2 % 1) + 0.1 * noise(u * 4 % 1, v * 4 % 1)
        g = 0.38 + 0.32 * n
        o = (y * S + x) * 4
        px[o], px[o + 1], px[o + 2], px[o + 3] = g, g * 0.98, g * 0.93, 1.0
img = bpy.data.images.new(f"{NAME}_stone", S, S, alpha=False)
img.pixels.foreach_set(px)
tex_path = BUILD_DIR / f"{NAME}_stone.png"
img.filepath_raw = str(tex_path)
img.file_format = "PNG"
img.save()

mat = bpy.data.materials.new(f"{NAME}_stone")
mat.use_nodes = True
mat.use_backface_culling = True  # closed solid: export single-sided
nodes = mat.node_tree.nodes
bsdf = nodes["Principled BSDF"]
bsdf.inputs["Roughness"].default_value = 0.92
tex = nodes.new("ShaderNodeTexImage")
tex.image = bpy.data.images.load(str(tex_path))
mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
mesh.materials.append(mat)

# ---------------------------------------------------------------- collision mesh (only when needed)
collision_name = None
if tris > COLLISION_MESH_OVER_TRIS:
    collision_name = f"{NAME}_collision"
    cbm = box_bmesh(lo, hi)
    bmesh.ops.triangulate(cbm, faces=list(cbm.faces))
    cmesh = bpy.data.meshes.new(collision_name)
    cbm.to_mesh(cmesh)
    cbm.free()
    col = bpy.data.objects.new(collision_name, cmesh)
    bpy.context.scene.collection.objects.link(col)

if tread.modifiers:
    fail("tread has modifiers — they would be dropped by export_apply=False")

# ---------------------------------------------------------------- export (uncompressed, nothing applied)
out = SRC_DIR / f"{NAME}.glb"
bpy.ops.export_scene.gltf(
    filepath=str(out),
    export_format="GLB",
    export_apply=False,                          # rule: never bake modifiers
    export_draco_mesh_compression_enable=False,  # rule: no Blender Draco
    export_image_format="AUTO",                  # PNG source -> PNG in the glb
    export_yup=True,
    export_texcoords=True,
    export_normals=True,
    export_materials="EXPORT",
    export_cameras=False,
    export_lights=False,
    export_animations=False,
    export_extras=False,
)
size = out.stat().st_size

meta = {
    "name": NAME,
    "file": f"{NAME}.glb",
    "collider": "trimesh",
    "collision_mesh": collision_name,
    "instancing": {
        "count": TREAD_COUNT,
        "step": [TREAD_DEPTH, round(RISER_HEIGHT, 6), 0.0],
        "origin": "front-bottom-centre of tread 0; tread i is offset by i * step (glTF Y-up)",
    },
    "tread": {"depth": TREAD_DEPTH, "riser": round(RISER_HEIGHT, 6), "width": WIDTH},
    "run": {"length": round(TREAD_DEPTH * TREAD_COUNT, 6), "rise": round(RISER_HEIGHT * TREAD_COUNT, 6), "slope_deg": round(slope_deg, 2)},
    "triangles_per_instance": tris,
    "tri_budget_per_instance": TRI_BUDGET_PER_TREAD,
}
(SRC_DIR / f"{NAME}.meta.json").write_text(json.dumps(meta, indent=2) + "\n")

print(f"[{NAME}] OK  name={NAME}  triangles={tris}/tread (budget {TRI_BUDGET_PER_TREAD}), x{TREAD_COUNT} instanced = {tris * TREAD_COUNT}")
print(f"[{NAME}]     riser={RISER_HEIGHT:.4f} (< {MAX_RISER})  slope={slope_deg:.1f}deg (< {MAX_SLOPE_DEG})  collision_mesh={collision_name}")
print(f"[{NAME}]     {out.relative_to(ROOT)}  {size} bytes")
sys.stdout.flush()
