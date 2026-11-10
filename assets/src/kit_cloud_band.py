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
SHEET, BAND = "paper_cream", "mist_pale"  # D-018: the seed's cloud sea is paper with grey wash streaks


def build(lib):
    r = lib.rng(SEED)
    kit = lib.Kit("kit_cloud_band")
    kit.face([(-HALF_X, 0.0, HALF_Z), (HALF_X, 0.0, HALF_Z), (HALF_X, 0.0, -HALF_Z), (-HALF_X, 0.0, -HALF_Z)], SHEET)
    # Strips ACROSS the view: the camera looks down +x, so a strip spanning z at a fixed x reads as a
    # horizontal band on screen, stacked into the distance (section 4: "horizontal banded wash").
    # Strips along x would converge to the vanishing point and read as floorboards: a surface.
    x = -HALF_X
    k = 0
    while x < HALF_X:
        w = r.uniform(3.0, 9.0)
        if k % 2:  # alternate: band, gap, band ... irregular widths, ragged ends
            x1 = min(HALF_X, x + w)
            z0 = -HALF_Z + r.uniform(0.0, 12.0)
            z1 = HALF_Z - r.uniform(0.0, 12.0)
            kit.face([(x, LIFT, z1), (x1, LIFT, z1), (x1, LIFT, z0), (x, LIFT, z0)], BAND)
        x += w
        k += 1
    return kit.finish()
