"""kit_cloud_band — the cloud sea (STYLE-BIBLE section 4): horizontal banded wash.

BACKDROP. collider none. It has no form and no surface: flat strips, paper_cream over mist_pale,
never a volume, never shaded. Placed just above the fall plane, far below every walkable top, so a
gap reads as a drop into cloud and never as floor (section 9 item 12).

120u along x by 80u along z, flat (the paper_cream bands a hair above the mist_pale sheet so they
never z-fight). Origin: centre. Single-sided, facing up: the camera is always above it.
"""

ASSET = {"collider": "none"}

SEED = 41
HALF_X = 60.0
HALF_Z = 40.0
LIFT = 0.04  # the bands sit this far above the sheet
SHEET, BAND = "mist_pale", "paper_cream"


def build(lib):
    r = lib.rng(SEED)
    kit = lib.Kit("kit_cloud_band")
    kit.face([(-HALF_X, 0.0, HALF_Z), (HALF_X, 0.0, HALF_Z), (HALF_X, 0.0, -HALF_Z), (-HALF_X, 0.0, -HALF_Z)], SHEET)
    z = -HALF_Z
    k = 0
    while z < HALF_Z:
        w = r.uniform(3.0, 9.0)
        if k % 2:  # alternate strips: band, gap, band ... irregular widths and ragged ends
            z1 = min(HALF_Z, z + w)
            x0 = -HALF_X + r.uniform(0.0, 12.0)
            x1 = HALF_X - r.uniform(0.0, 12.0)
            kit.face([(x0, LIFT, z1), (x1, LIFT, z1), (x1, LIFT, z), (x0, LIFT, z)], BAND)
        z += w
        k += 1
    return kit.finish()
