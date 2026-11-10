"""kit_rock_mass — the dark wall of the composition rule (STYLE-BIBLE sections 4, 5).

Footprint: 10u along x by 5u along z, 12u tall. Origin: centre of the base.

Grammar: stacked strata, each a near-vertical prism with a flat top, stepping in as they rise
(horizontal strata as value steps between flat masses). Vertical ink fracture lines run the
full height of every stratum face at irregular spacing. No rounded rock anywhere: every face
is planar and every edge is hard.

Seeded: the same SEED always yields the same rock. Change the seed for a new rock; change the
dimensions for a new footprint. The triangle count printed by the build is the cost.
"""

ASSET = {"collider": "trimesh"}

SEED = 11
HALF_W, HALF_D = 5.0, 2.5  # base footprint half extents (x, z)
SIDES = 7  # footprint vertices per stratum: few, so the faces read as planes, not a drum
JITTER = 0.3  # radial jitter of the footprint (fraction of radius)
SHIFT = 0.45  # max x/z offset of each stratum (world units): the mass leans and steps unevenly
# Colours matched to reference/seed/hero (D-018): the wall is a light wash cut by black fracture strokes,
# not dark slabs; its mass comes from the ink. COLOURS ONLY were changed: every position, face and stroke
# is as before (this asset is collision; tools/geometry-fingerprint.mjs proves the soup is identical).
STRATA = [  # (height, side colour, inset fraction from the base footprint)
    (3.2, "wash_mid", 0.00),
    (2.6, "stone_mid", 0.05),
    (2.4, "wash_mid", 0.09),
    (2.0, "wash_light", 0.14),
    (1.8, "stone_mid", 0.20),
]
LEDGE = "mist_pale"  # stratum tops: lighter than the face beside them, like a path
FRACTURE = dict(per_unit=0.7, width=0.09, color="ink_black")


def build(lib):
    r = lib.rng(SEED)
    kit = lib.Kit("kit_rock_mass")
    y = 0.0
    for i, (h, side, inset) in enumerate(STRATA):
        k = 1.0 - inset
        dx, dz = r.uniform(-SHIFT, SHIFT), r.uniform(-SHIFT, SHIFT)
        foot = [(x + dx, z + dz) for x, z in lib.jittered_footprint(r, HALF_W * k, HALF_D * k, SIDES, JITTER)]
        lib.prism(kit, foot, y, y + h, side, LEDGE, bottom="ink_black")  # every stratum closed: jitter can overhang the one below
        lib.fracture_lines(kit, foot, y, y + h, r, **FRACTURE)
        y += h
    return kit.finish()
