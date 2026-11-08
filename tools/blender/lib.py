"""Procedural primitives for the environment kit. Imported by assets/src/kit_*.py, run by export.py.

Every function takes explicit dimensions in WORLD UNITS (1u = 1m, the same units as the level
JSON and the MOVE table), in GAME axes: +y up, x/z on the ground plane. The Blender Z-up swap
happens here and only here, so an asset's footprint reads directly from its source.

STYLE-BIBLE rules this module enforces, not merely allows:
  - Hard edges only. No bevel, no subdivision, no smooth shading, no modifiers of any kind:
    a bevel is a curved surface, and any light on a curved surface is a gradient (section 1).
    Every face gets its own vertices, so normals are per-face and the export carries no
    smoothing. There is nothing for export_apply to bake.
  - Palette law (section 2). A face's colour is a NAME from PALETTE; there is no way to pass
    an arbitrary colour. Colour reaches the GPU as a UV into one shared 32x32 palette
    texture, so a whole asset is ONE mesh, ONE material, ONE draw call.
  - Vermilion only on torii. The kit module must declare ACCENT = True to use it; lib refuses
    otherwise.
  - Determinism. All jitter comes from rng(seed); no time, no global random, no hash order.
"""

import math
import random

import bmesh
import bpy

# ---- palette (section 2) ----------------------------------------------------------------
# Eight-value ramp from reference/palette.json. Vermilion is NOT in palette.json (it never
# clustered at k=8); its value was measured from the seed frames for H4 — see MEASUREMENTS.md.
PALETTE = {
    "paper_cream": "#cabfac",
    "mist_pale": "#afa79c",
    "wash_light": "#979189",
    "stone_mid": "#827d76",
    "wash_mid": "#69645f",
    "ink_grey": "#534e4b",
    "ink_deep": "#383838",
    "ink_black": "#20201e",
    "vermilion": "#603633",
}
ACCENTS = {"vermilion"}

# 4x4 grid of 8px cells. 8px cells sit on whole 4x4 compression blocks, so block-compressed
# texture formats (ETC1S/UASTC/BCn/ASTC 4x4) never mix two palette entries in one block.
TEX_SIZE = 32
CELL = 8
CELLS_PER_ROW = TEX_SIZE // CELL
PALETTE_ORDER = list(PALETTE)  # cell index = position in this list; unused cells = paper_cream
TEXTURE_NAME = "kit_palette"
MATERIAL_NAME = "kit_palette"


def rng(seed):
    return random.Random(seed)


def _hex(h):
    h = h.lstrip("#")
    return tuple(int(h[i : i + 2], 16) / 255.0 for i in (0, 2, 4))


def palette_uv(color):
    """UV at the centre of `color`'s cell (Blender UV space, origin bottom-left)."""
    i = PALETTE_ORDER.index(color)
    cx, cy = i % CELLS_PER_ROW, i // CELLS_PER_ROW
    return ((cx * CELL + CELL / 2) / TEX_SIZE, (cy * CELL + CELL / 2) / TEX_SIZE)


def palette_material():
    """The one kit material: palette texture, nearest sampling, no specular, fully rough."""
    mat = bpy.data.materials.get(MATERIAL_NAME)
    if mat:
        return mat
    img = bpy.data.images.new(TEXTURE_NAME, TEX_SIZE, TEX_SIZE, alpha=False)
    img.colorspace_settings.name = "sRGB"
    px = [0.0] * (TEX_SIZE * TEX_SIZE * 4)
    for y in range(TEX_SIZE):
        for x in range(TEX_SIZE):
            i = (y // CELL) * CELLS_PER_ROW + (x // CELL)
            name = PALETTE_ORDER[i] if i < len(PALETTE_ORDER) else "paper_cream"
            # A BYTE image stores Image.pixels as-is (value * 255): no linear<->sRGB conversion.
            # Write the sRGB hex directly. (Found by the harness assets probe: converting to
            # linear here shipped every colour ~4x too dark, #383838 -> #0a0a0a.)
            r, g, b = _hex(PALETTE[name])
            o = (y * TEX_SIZE + x) * 4
            px[o : o + 4] = (r, g, b, 1.0)
    img.pixels = px
    img.pack()
    img.filepath_raw = "//" + TEXTURE_NAME + ".png"
    img.file_format = "PNG"

    mat = bpy.data.materials.new(MATERIAL_NAME)
    mat.use_nodes = True
    mat.use_backface_culling = True  # -> doubleSided false: every kit face is outward-wound
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 1.0
    bsdf.inputs["Metallic"].default_value = 0.0
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.0
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.interpolation = "Closest"  # -> glTF sampler NEAREST: flat fill, no bleed between cells
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    return mat


# ---- the builder ---------------------------------------------------------------------------
class Kit:
    """Accumulates hard-edged faces into ONE mesh object with ONE material.

    Positions are game axes (x, y-up, z). Each face is (points, color) with points wound
    counter-clockwise seen from OUTSIDE.
    """

    def __init__(self, name, accent=False):
        if name != name.lower() or not name.replace("_", "").isalnum():
            raise ValueError(f"asset name {name!r} must be lower_snake_case")
        self.name = name
        self.accent = accent
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new("UVMap")
        self.faces = 0

    def face(self, points, color):
        if color not in PALETTE:
            raise ValueError(f"{self.name}: colour {color!r} is not on the palette ramp")
        if color in ACCENTS and not self.accent:
            raise ValueError(f"{self.name}: {color} is torii-only (STYLE-BIBLE section 2); set accent=True")
        # game (x, y, z) -> Blender (x, -z, y); export_yup maps it straight back
        verts = [self.bm.verts.new((p[0], -p[2], p[1])) for p in points]
        f = self.bm.faces.new(verts)
        f.smooth = False
        u = palette_uv(color)
        for loop in f.loops:
            loop[self.uv].uv = u
        self.faces += 1
        return f

    def finish(self):
        """Triangulate (deterministic, beauty off) and link the object into the scene."""
        bmesh.ops.triangulate(self.bm, faces=self.bm.faces[:], quad_method="FIXED", ngon_method="EAR_CLIP")
        mesh = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(mesh)
        self.bm.free()
        mesh.materials.append(palette_material())
        for p in mesh.polygons:
            p.use_smooth = False
        obj = bpy.data.objects.new(self.name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        return obj


# ---- primitives ------------------------------------------------------------------------------
def box(kit, size, center, color, top=None, bottom=None, faces="all"):
    """Axis-aligned box. size=(sx, sy, sz) world units, center=(x, y, z).
    top/bottom override the cap colour. faces='all' | 'no_bottom'."""
    sx, sy, sz = (s / 2 for s in size)
    cx, cy, cz = center
    x0, x1, y0, y1, z0, z1 = cx - sx, cx + sx, cy - sy, cy + sy, cz - sz, cz + sz
    kit.face([(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)], color)  # +z
    kit.face([(x1, y0, z0), (x0, y0, z0), (x0, y1, z0), (x1, y1, z0)], color)  # -z
    kit.face([(x1, y0, z1), (x1, y0, z0), (x1, y1, z0), (x1, y1, z1)], color)  # +x
    kit.face([(x0, y0, z0), (x0, y0, z1), (x0, y1, z1), (x0, y1, z0)], color)  # -x
    kit.face([(x0, y1, z1), (x1, y1, z1), (x1, y1, z0), (x0, y1, z0)], top or color)  # +y
    if faces != "no_bottom":
        kit.face([(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)], bottom or color)  # -y


def tapered_post(kit, base, top, height, center_xz, y0, color):
    """Square post, base x base at y0 narrowing to top x top at y0+height. Hard-edged frustum."""
    cx, cz = center_xz
    b, t = base / 2, top / 2
    y1 = y0 + height
    lo = [(cx - b, y0, cz + b), (cx + b, y0, cz + b), (cx + b, y0, cz - b), (cx - b, y0, cz - b)]
    hi = [(cx - t, y1, cz + t), (cx + t, y1, cz + t), (cx + t, y1, cz - t), (cx - t, y1, cz - t)]
    for i in range(4):
        j = (i + 1) % 4
        kit.face([lo[i], lo[j], hi[j], hi[i]], color)
    kit.face(hi, color)
    kit.face(list(reversed(lo)), color)


def prism(kit, footprint, y0, y1, side, top, bottom=None):
    """Vertical extrusion of a CCW (seen from +y) polygon footprint [(x, z), ...] from y0 to y1.
    Near-vertical faces, flat top: the cliff grammar of STYLE-BIBLE section 4."""
    n = len(footprint)
    for i in range(n):
        (ax, az), (bx, bz) = footprint[i], footprint[(i + 1) % n]
        kit.face([(ax, y0, az), (bx, y0, bz), (bx, y1, bz), (ax, y1, az)], side)
    kit.face([(x, y1, z) for x, z in footprint], top)
    if bottom:
        kit.face([(x, y0, z) for x, z in reversed(footprint)], bottom)


def extrude_x(kit, profile, x0, x1, color):
    """Extrude a (z, y) profile polygon along x from x0 to x1. Any winding: it is normalised so
    the caps face +-x and the sides face outward. Concave profiles are fine (ear-clipped)."""
    # signed area in the plane seen from +x (screen right = -z, up = y)
    area = sum((-profile[i][0]) * profile[(i + 1) % len(profile)][1] - (-profile[(i + 1) % len(profile)][0]) * profile[i][1] for i in range(len(profile)))
    pts = profile if area > 0 else list(reversed(profile))
    n = len(pts)
    for i in range(n):
        (az, ay), (bz, by) = pts[i], pts[(i + 1) % n]
        kit.face([(x0, ay, az), (x0, by, bz), (x1, by, bz), (x1, ay, az)], color)
    kit.face([(x1, y, z) for z, y in pts], color)
    kit.face([(x0, y, z) for z, y in reversed(pts)], color)


def jittered_footprint(r, half_w, half_d, n, jitter):
    """n-gon on an ellipse (half_w along x, half_d along z), each radius scaled by
    1 - jitter*u. CCW seen from +y (game axes: x right, z toward camera)."""
    pts = []
    for i in range(n):
        a = -2 * math.pi * i / n  # negative: CCW when viewed from +y with z toward the viewer
        k = 1.0 - jitter * r.random()
        pts.append((half_w * k * math.cos(a), half_d * k * math.sin(a)))
    return pts


def fracture_lines(kit, footprint, y0, y1, r, per_unit, width, color, inset=0.02, margin=0.12):
    """Vertical ink strokes over each side face of a prism: roughly parallel, irregular
    spacing, full height of the face (STYLE-BIBLE section 4, Cliffs). Each stroke is one quad
    floated `inset` off the face so it never z-fights. Returns the stroke count."""
    n = len(footprint)
    strokes = 0
    for i in range(n):
        (ax, az), (bx, bz) = footprint[i], footprint[(i + 1) % n]
        dx, dz = bx - ax, bz - az
        length = math.hypot(dx, dz)
        if length < width * 4:
            continue
        ux, uz = dx / length, dz / length
        nx, nz = -uz, ux  # outward normal of a CCW edge seen from +y (= the side face's normal)
        count = max(1, int(length * per_unit))
        slots = sorted(r.uniform(margin, 1 - margin) for _ in range(count))
        for t in slots:
            w = width * r.uniform(0.6, 1.4)  # brush weight varies stroke to stroke
            c0 = t * length - w / 2
            c1 = t * length + w / 2
            p0 = (ax + ux * c0 + nx * inset, az + uz * c0 + nz * inset)
            p1 = (ax + ux * c1 + nx * inset, az + uz * c1 + nz * inset)
            top = y1 - r.uniform(0.0, 0.15) * (y1 - y0)  # strokes taper off short of the lip
            kit.face([(p0[0], y0, p0[1]), (p1[0], y0, p1[1]), (p1[0], top, p1[1]), (p0[0], top, p0[1])], color)
            strokes += 1
    return strokes
