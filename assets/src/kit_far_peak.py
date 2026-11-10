"""kit_far_peak — the FAR depth band (STYLE-BIBLE section 3): silhouette only.

BACKDROP. collider none, never reached.

Far band (80u+): paper_cream to mist_pale ONLY, no outline, silhouette only. One flat mist_pale
ridge extruded thin in z, standing against the paper_cream sky. A jagged line of straight
segments: faceted, never rounded (section 9 item 4).

60u along x, 13u tall at the highest point, 2u deep. Origin: centre of the base. D-018: the seed's far
forms are LOW ridges on the horizon over the cloud sea (hero_3s, hero_7s, hero_11s), not tall peaks.
"""

ASSET = {"collider": "none"}

DEPTH = 2.0
# ridge silhouette in (x, y), left to right over the top; the base closes it at y = 0
RIDGE = [(-30, 0), (-30, 1), (-20, 4), (-12, 7), (-6, 11), (0, 13), (5, 12), (11, 9), (18, 6), (24, 3), (30, 1), (30, 0)]
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
