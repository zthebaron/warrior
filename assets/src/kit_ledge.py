"""kit_ledge — bare-rock path ledge, the seam of the composition rule (STYLE-BIBLE sections 4, 5).

DRESSING, NOT GEOMETRY. collider none: it is placed over a prim_box with the box's own pos and
scale (tools/levelgen/dress-01.mjs) and the box keeps the collider. FACE_RISE, READABLE_RISE,
ASSIST_CASE and every golden are computed against the box, so this mesh must never collide.

Unit cube, origin at its centre: x, y, z in [-0.5, 0.5], exactly prim_box's extents, so a placement
copies the box's pos and scale and the walkable top coincides with the collider top.

Grammar: a path is lighter than the cliff beside it, with a defined dark edge where it meets the
void (section 4, Paths). So: a wash_light top; an ink_black lip right under it on every side; then
strata stepping darker with depth; vertical ink fracture strokes over every face (section 4,
Cliffs). Detail is in FRACTIONS of the box, so dress-01.mjs tiles long boxes to keep strokes thin.
No bottom: never seen, the cloud sea is above it.
"""

ASSET = {"collider": "none"}

SEED = 23
# Matched to reference/seed/hero (D-018): the path top is PAPER, separated from the sky only by ink; the face
# under it is a light wash with a darker band in the lip's shadow, fading lighter down into the cloud sea.
TOP = "paper_cream"
BANDS = [  # (depth from the top as a fraction of the box height, colour)
    (0.012, "ink_black"),  # the lip: a path's dark edge against the void
    (0.10, "stone_mid"),   # the shadowed band under the lip
    (0.45, "wash_light"),
    (1.00, "mist_pale"),   # fades into the cloud
]
FRACTURE = dict(per_unit=4.5, width=0.014, color="ink_black", inset=0.003, margin=0.08)


def build(lib):
    r = lib.rng(SEED)
    kit = lib.Kit("kit_ledge")
    lib.banded_prism(kit, lib.UNIT_SQUARE, -0.5, 0.5, BANDS, top=TOP)
    # strokes stop well under the lip: the dark edge stays one clean line
    lib.fracture_lines(kit, lib.UNIT_SQUARE, -0.5, 0.5 - BANDS[0][0] * 4, r, **FRACTURE)
    return kit.finish()
