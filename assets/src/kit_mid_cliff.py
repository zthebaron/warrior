"""kit_mid_cliff — the MID depth band behind the dark wall (STYLE-BIBLE section 3).

BACKDROP. collider none: placed outside the play space (|z| >= 30), never reached, never collides.

Mid band (25-80u): values wash_light to ink_grey ONLY, major forms only, no surface texture, so
no fracture strokes and no ink_black. Stepped strata, near-vertical faces, flat tops (section 4
Cliffs): the grammar of kit_rock_mass at a coarser grain. Section 3's thin grey outline is the
ink-edge post pass (section 6), which does not exist yet; this asset does not fake it.

Footprint 24u along x by 10u along z, 30u tall. Origin: centre of the base.
"""

ASSET = {"collider": "none"}

SEED = 37
HALF_W, HALF_D = 12.0, 5.0
SIDES = 6
JITTER = 0.25
SHIFT = 1.2
STRATA = [  # (height, side colour, inset)  -- D-018: lighter, toward the seed's distant walls
    (10.0, "stone_mid", 0.00),
    (8.0, "wash_light", 0.12),
    (7.0, "stone_mid", 0.26),
    (5.0, "wash_light", 0.42),
]
TOP = "mist_pale"


def build(lib):
    r = lib.rng(SEED)
    kit = lib.Kit("kit_mid_cliff")
    y = 0.0
    for h, side, inset in STRATA:
        k = 1.0 - inset
        dx, dz = r.uniform(-SHIFT, SHIFT), r.uniform(-SHIFT, SHIFT)
        foot = [(x + dx, z + dz) for x, z in lib.jittered_footprint(r, HALF_W * k, HALF_D * k, SIDES, JITTER)]
        lib.prism(kit, foot, y, y + h, side, TOP)
        y += h
    return kit.finish()
