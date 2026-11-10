"""kit_crow — the timing cue (PHASE-0 Q2/Q5): a perched crow that lifts off on its patroller's clock.

RENDER ONLY. collider none, never pickable, never lethal (the loader keeps all three true).
Ink_black and only ink_black: a crow is never coloured, it signals by motion alone (Q2). Unlit
and one value, so it reads as a silhouette at any distance, which is what a cue needs.

Unit box, origin at its centre, long axis +z (the hazard's crow.size is [0.35, 0.35, 0.6]: z is
length). Faceted: a block body, a head block with a beak, a fanned tail, folded wings standing
proud of the body so the silhouette is a bird, not a box.
"""

ASSET = {"collider": "none"}

C = "ink_black"


def plate(kit, a, b, c, d):
    """A thin plate seen from both sides (wings, tail): two faces, opposite windings."""
    kit.face([a, b, c, d], C)
    kit.face([d, c, b, a], C)


def build(lib):
    kit = lib.Kit("kit_crow")
    lib.box(kit, (0.56, 0.5, 0.42), (0.0, -0.08, 0.01), C)  # body
    lib.box(kit, (0.34, 0.3, 0.2), (0.0, 0.2, 0.3), C)      # head
    # beak: a tetrahedron off the face of the head
    tip, l, rr, up = (0.0, 0.16, 0.5), (-0.08, 0.24, 0.4), (0.08, 0.24, 0.4), (0.0, 0.3, 0.4)
    kit.face([l, rr, tip], C)
    kit.face([rr, l, up], C)
    kit.face([up, rr, tip], C)
    kit.face([up, tip, l], C)
    # fanned tail
    plate(kit, (-0.12, -0.1, -0.2), (0.12, -0.1, -0.2), (0.22, -0.22, -0.5), (-0.22, -0.22, -0.5))
    # folded wings, proud of the body
    plate(kit, (0.28, 0.17, 0.18), (0.28, -0.25, 0.18), (0.36, -0.2, -0.38), (0.33, 0.12, -0.3))
    plate(kit, (-0.33, 0.12, -0.3), (-0.36, -0.2, -0.38), (-0.28, -0.25, 0.18), (-0.28, 0.17, 0.18))
    # legs to the perch
    lib.box(kit, (0.05, 0.17, 0.05), (0.09, -0.415, 0.05), C, faces="no_bottom")
    lib.box(kit, (0.05, 0.17, 0.05), (-0.09, -0.415, 0.05), C, faces="no_bottom")
    return kit.finish()
