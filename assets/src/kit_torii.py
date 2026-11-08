"""kit_torii — vermilion post-and-lintel gate, a path marker (STYLE-BIBLE sections 2, 4).

Footprint: 7.2u across the lintel (z), 0.6u deep (x), 5.35u tall. The gate spans the path,
so the walk direction is +-x and the clear opening between the posts is 3.95u wide by 3.5u
high (to the underside of the tie beam). Origin: ground centre, between the posts.

Colour: posts, tie beam, strut and lower lintel are vermilion — the only accent on the ramp.
The top lintel and the post plinths are ink_black, as on a real torii, which keeps the accent
area down: the 1% budget is per frame and two or three gates recede together.
"""

ASSET = {"collider": "trimesh"}

POST_GAP = 4.4  # post centre to post centre (z)
POST_BASE, POST_TOP, POST_H = 0.45, 0.38, 4.25
PLINTH = (0.62, 0.4, 0.62)  # kamaki
NUKI_Y, NUKI = 3.7, (0.24, 0.34, 5.7)  # tie beam: y centre, size (x, y, z)
STRUT_Y, STRUT = 4.2, (0.22, 0.66, 0.3)  # gakuzuka
SHIMAKI_Y, SHIMAKI = 4.68, (0.36, 0.3, 6.0)
KASAGI_DEPTH = 0.5  # x thickness of the top lintel
# top lintel profile in (z, y): flat centre, ends sweeping up — the one curve, built from
# straight segments so every face stays hard-edged
KASAGI = [(-3.6, 5.05), (-2.0, 4.83), (2.0, 4.83), (3.6, 5.05), (3.6, 5.35), (2.0, 5.15), (-2.0, 5.15), (-3.6, 5.35)]


def build(lib):
    kit = lib.Kit("kit_torii", accent=True)
    for z in (-POST_GAP / 2, POST_GAP / 2):
        lib.box(kit, PLINTH, (0, PLINTH[1] / 2, z), "ink_black", faces="no_bottom")
        lib.tapered_post(kit, POST_BASE, POST_TOP, POST_H, (0, z), PLINTH[1], "vermilion")
    lib.box(kit, NUKI, (0, NUKI_Y, 0), "vermilion")
    lib.box(kit, STRUT, (0, STRUT_Y, 0), "vermilion")
    lib.box(kit, SHIMAKI, (0, SHIMAKI_Y, 0), "vermilion")
    lib.extrude_x(kit, KASAGI, -KASAGI_DEPTH / 2, KASAGI_DEPTH / 2, "ink_black")
    return kit.finish()
