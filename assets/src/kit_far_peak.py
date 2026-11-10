"""kit_far_peak — the FAR depth band (STYLE-BIBLE section 3): silhouette only.

BACKDROP. collider none, never reached.

Far band (80u+): paper_cream to mist_pale ONLY, no outline, silhouette only. One flat mist_pale
ridge extruded thin in z, standing against the paper_cream sky. A jagged line of straight
segments: faceted, never rounded (section 9 item 4).

60u along x, 46u tall at the highest peak, 2u deep. Origin: centre of the base.
"""

ASSET = {"collider": "none"}

DEPTH = 2.0
# ridge silhouette in (x, y), left to right over the top; the base closes it at y = 0
RIDGE = [(-30, 0), (-30, 9), (-22, 18), (-17, 15), (-9, 34), (-5, 30), (2, 46), (8, 38), (12, 41), (19, 24), (24, 27), (30, 12), (30, 0)]
COLOR = "mist_pale"


def build(lib):
    kit = lib.Kit("kit_far_peak")
    z0, z1 = -DEPTH / 2, DEPTH / 2
    n = len(RIDGE)
    # RIDGE runs clockwise seen from +z, so (a, b) edges taken this way face outward
    for i in range(n):
        (ax, ay), (bx, by) = RIDGE[i], RIDGE[(i + 1) % n]
        kit.face([(ax, ay, z1), (ax, ay, z0), (bx, by, z0), (bx, by, z1)], COLOR)
    # caps: ear-clipped by the triangulator (concave is fine)
    kit.face([(x, y, z1) for x, y in reversed(RIDGE)], COLOR)  # +z, CCW seen from +z
    kit.face([(x, y, z0) for x, y in RIDGE], COLOR)            # -z
    return kit.finish()
