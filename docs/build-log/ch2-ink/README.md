# CH2-INK: chapter 2 in the ink look (D-028)

Frames of `levels/02-cliff-seam.json`. Every pair is the same pose twice: **greybox on the left** (origin/main at
12a09c7, before this branch), **ink on the right** (this branch). Each pair is taken at 1920 x 1080 in the
harness's own Chromium and at 5120 x 1440 on this machine's GPU (`--gpu`: at that size SwiftShader draws the ink
pass black, B-81). All are the player's own camera: the follow rig behind the warrior, settled.
The 1920 pairs are PNG; the 5120 pairs are JPEG at quality 92 (as PNG they are 10 MB each, and CI pulls every LFS file).

| Pair | The warrior stands at | What it shows |
|---|---|---|
| `start-1920x1080.png`, `start-5120x1440.jpg` (and so on) | (2, 0, 0) | the first flat: the painted wall, the first face ahead with its lip, the pine under its corner, a tower in the mist |
| `first-face-*` | (8.5, 0, 0) | the +4.5 face he climbs first, head on: a cliff painting's strokes on it, paper lip over a dark band at its top |
| `wall-jump-*` | (37.6, 4.5, -2) | in the corridor: the wall he kicks off on the left, the shelf he lands on to the right, both with their lips |
| `double-jump-*` | (51.5, 7.2, 0) | the +2.8 face of the first double jump |
| `swordsman-*` | (17, 4.5, 0) | `guard-first` on his ground, in front of the first torii |
| `goal-*` | (138.6, 15.5, 0) | the far side of the last gap: `guard-goal`, the goal's torii |
| `beside-chapter-1-1920x1080.png` | spawn of each | chapter 1 as it ships (left) and chapter 2 (right), each from (2, 0, 0) |

Retake (one at a time: each uses the preview port):

    node tools/harness/frame.ts 02-cliff-seam <out> --size=WxH --at=<x,y,z> --yaw=-90 [--gpu]
    node tools/art/beside.mjs <pair.png> <greybox.png> <ink.png>

The greybox halves need the level at `palette: "greybox"`, `lighting.preset: "greybox"` (origin/main before D-028).

Where it falls short, by eye: the wall beside the path is chapter 1's, seen along its length (B-52); the
corridor's walls are not told apart from any other rock (B-111); the strokes on a long face repeat (B-112); the
rock wall's lower ledges are thin pale slivers (B-113); the far tops are paper on paper (B-114).
