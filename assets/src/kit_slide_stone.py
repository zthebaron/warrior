"""kit_slide_stone — the patroller: a dressed granite block that slides across the lane on its
fixed route (PHASE-0 Q1/Q6: a moving fall plane, never an enemy).

RENDER ONLY. collider none: the patroller has no collider at all; its kill volume is the hazard's
own AABB (`size`), posed from the world clock. The loader swaps this mesh in for the greybox cube
and scales it to `size`, so the unit-cube extents here ARE the volume.

Unit cube, origin at its centre. Planar chamfers on the top edges (hard, flat faces, not a bevel:
STYLE-BIBLE section 1) keep it reading as a cut block, not a crate. Dark: an ink mass, the value
family the greybox hazard used, with an ink_black band at the base and a stone_mid cap.
The chamfers cut inward, so the visual never exceeds the volume: contact is never shown short of death.
"""

ASSET = {"collider": "none"}

CHAMFER = 0.08  # fraction of the block
BODY = [(0.10, "ink_grey"), (0.78, "ink_deep"), (1.00, "ink_black")]


def build(lib):
    kit = lib.Kit("kit_slide_stone")
    c = CHAMFER
    y_top = 0.5 - c
    lib.banded_prism(kit, lib.UNIT_SQUARE, -0.5, y_top, BODY)
    # chamfered cap: the top face inset by c, four planar sloped faces down to the body
    inner = [(x * (1 - 2 * c), z * (1 - 2 * c)) for x, z in lib.UNIT_SQUARE]
    n = len(lib.UNIT_SQUARE)
    for i in range(n):
        (ax, az), (bx, bz) = lib.UNIT_SQUARE[i], lib.UNIT_SQUARE[(i + 1) % n]
        (ix, iz), (jx, jz) = inner[i], inner[(i + 1) % n]
        kit.face([(ax, y_top, az), (bx, y_top, bz), (jx, 0.5, jz), (ix, 0.5, iz)], "ink_grey")
    kit.face([(x, 0.5, z) for x, z in inner], "stone_mid")
    kit.face([(x, -0.5, z) for x, z in reversed(lib.UNIT_SQUARE)], "ink_black")
    return kit.finish()
