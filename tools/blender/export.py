"""Headless glTF-binary export. No GUI, no user prefs, no addons beyond what ships with Blender.

    blender --background --factory-startup --python-exit-code 1 \
            --python tools/blender/export.py -- --input <asset.py | asset.blend> --out <file.glb>

  .py     a kit module (assets/src/kit_*.py). Executed into an EMPTY scene. It must define
          ASSET = {"collider": "trimesh" | "none", ...} and build(lib) -> the one mesh object.
  .blend  a hero asset (LFS). Opened as-is; its metadata comes from a sibling <stem>.meta.json
          ({"collider": ...}); every mesh object in the file is exported.

Writes <out> and <out minus .glb>.meta.json: {name, source, collider, triangles, objects}.
Prints one line per asset. Exits non-zero on any violation (Blender's own exit is 0 even when a
script raises — that is what --python-exit-code 1 is for).

Determinism: the exporter is given every option explicitly (nothing inherited from prefs, which
--factory-startup resets anyway), the scene holds only what the module built, and nothing time-
or host-dependent is written. Same input -> byte-identical .glb; verified by build.mjs runs.
"""

import json
import os
import re
import runpy
import sys

import bpy

sys.dont_write_bytecode = True  # no __pycache__ in tools/blender/ (the tree stays clean)
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import lib  # noqa: E402  (tools/blender/lib.py — must import after the path insert)

NAME_RE = re.compile(r"^[a-z][a-z0-9_]*$")  # glTF rewrites spaces and strips dots


def fail(msg):
    print(f"EXPORT FAILED: {msg}", file=sys.stderr)
    sys.exit(1)


def args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    out = {}
    while argv:
        k = argv.pop(0)
        if k not in ("--input", "--out") or not argv:
            fail(f"usage: -- --input <asset.py|asset.blend> --out <file.glb>  (bad arg {k!r})")
        out[k[2:]] = argv.pop(0)
    if set(out) != {"input", "out"}:
        fail("both --input and --out are required")
    return out["input"], out["out"]


def triangles(obj):
    me = obj.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh()
    me.calc_loop_triangles()
    n = len(me.loop_triangles)
    obj.to_mesh_clear()
    return n


def main():
    src, out = args()
    name = os.path.splitext(os.path.basename(src))[0]
    if not NAME_RE.match(name):
        fail(f"{src}: asset name {name!r} must be lower_snake_case")

    if src.endswith(".py"):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        mod = runpy.run_path(src, run_name="__kit__")
        meta = mod.get("ASSET")
        if not isinstance(meta, dict) or "build" not in mod:
            fail(f"{src}: a kit module must define ASSET = {{...}} and build(lib)")
        obj = mod["build"](lib)
        if obj is None or obj.type != "MESH":
            fail(f"{src}: build(lib) must return the mesh object it created")
        if obj.name != name:
            fail(f"{src}: object is named {obj.name!r}; it must match the file stem {name!r}")
    elif src.endswith(".blend"):
        bpy.ops.wm.open_mainfile(filepath=os.path.abspath(src))
        side = os.path.splitext(src)[0] + ".meta.json"
        if not os.path.exists(side):
            fail(f"{src}: a .blend asset needs {side} with at least {{\"collider\": ...}}")
        with open(side) as f:
            meta = json.load(f)
    else:
        fail(f"{src}: input must be .py or .blend")

    collider = meta.get("collider")
    if collider not in ("trimesh", "none"):
        fail(f"{name}: collider {collider!r} — trimesh | none only (box sinks; see check:physics)")

    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    others = [o.name for o in bpy.context.scene.objects if o.type != "MESH"]
    if not meshes:
        fail(f"{name}: no mesh objects to export")
    for o in meshes:
        if not NAME_RE.match(o.name):
            fail(f"{name}: object {o.name!r} must be lower_snake_case")
        # Rule (DAY-0 H4): never bake modifiers. An Array applied at export turns 1MB into tens.
        if o.modifiers:
            fail(f"{name}: object {o.name!r} has modifiers {[m.type for m in o.modifiers]} — kit geometry is built, not modified")
        if len(o.data.materials) > 1:
            fail(f"{name}: object {o.name!r} has {len(o.data.materials)} materials — one per mesh (the loader is single-material)")

    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=os.path.abspath(out),
        export_format="GLB",
        use_selection=False,
        export_apply=False,  # rule: never bake modifiers (and none exist — checked above)
        export_draco_mesh_compression_enable=False,  # rule: no Blender Draco; gltf-transform owns compression
        export_image_format="AUTO",  # the palette is a PNG -> PNG in the glb; KTX2 is a later stage
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
        export_tangents=False,
        export_materials="EXPORT",
        export_vertex_color="NONE",
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_skins=False,
        export_morph=False,
        export_extras=False,
    )

    tris = sum(triangles(o) for o in meshes)
    rec = {
        "name": name,
        "source": os.path.relpath(os.path.abspath(src), os.getcwd()),
        "collider": collider,
        "triangles": tris,
        "objects": sorted(o.name for o in meshes),
        "ignored": sorted(others),
    }
    with open(os.path.splitext(out)[0] + ".meta.json", "w") as f:
        json.dump(rec, f, indent=2, sort_keys=True)
        f.write("\n")
    print(f"[export] {name}: {tris} tris, {os.path.getsize(out)} bytes, objects={rec['objects']} -> {out}")


main()
