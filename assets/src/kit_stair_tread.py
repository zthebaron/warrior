"""kit_stair_tread — cut stone: stair treads, the shelves, the first step, the crow's perch stones
(STYLE-BIBLE section 4: "Stairs — straight runs, visible treads as horizontal value lines";
"Paths — cut stone where man-made").

DRESSING, NOT GEOMETRY. collider none: placed over a prim_box with the box's pos and scale; the box
keeps the collider (see kit_ledge.py for why this mesh must never collide).

Unit cube, origin at its centre, prim_box's extents. A wash_light tread; an ink_black nosing line
on every side directly under it, so each tread edge reads as one horizontal line; courses of
dressed stone below, separated by thin ink_deep joints. No fracture strokes: it is cut, not broken.
"""

ASSET = {"collider": "none"}

# Matched to reference/seed/hero (D-018): paper treads, a black nosing line, light courses below.
TOP = "paper_cream"
BANDS = [
    (0.010, "ink_black"),  # nosing: the tread line
    (0.050, "stone_mid"),  # the visible riser face of one ~0.33u step on a ~9u column
    (0.056, "ink_grey"),   # joint
    (0.30, "wash_light"),
    (0.306, "ink_grey"),   # joint
    (1.00, "mist_pale"),
]


def build(lib):
    kit = lib.Kit("kit_stair_tread")
    lib.banded_prism(kit, lib.UNIT_SQUARE, -0.5, 0.5, BANDS, top=TOP)
    return kit.finish()
