# CH3-INK: chapter 3 in the ink look (D-029)

Frames of `levels/03-drifting-stones.json`. Every pair is the same pose twice: **greybox on the left** (origin/main at
584a9d4, before this branch), **ink on the right** (this branch). Each pair is taken at 1920 x 1080 in the
harness's own Chromium and at 5120 x 1440 on this machine's GPU (`--gpu`: at that size SwiftShader draws the ink
pass black, B-81). All are the player's own camera: the follow rig behind the warrior, settled, facing +x.
The 1920 pairs are PNG; the 5120 pairs are JPEG at quality 92 (as PNG they are 10 MB each, and CI pulls every LFS file).

| Pair | The warrior stands at | What it shows |
|---|---|---|
| `start-1920x1080.png`, `start-5120x1440.jpg` (and so on) | (2, 0, 0) | the first top: paper ground ending in the dark brink, the first gap a dark slot, the painted wall, rocks adrift |
| `stone-before-*` | (44.5, 1, 0) | the first moving stone docked at the far edge, seen through the torii before he jumps for it |
| `stone-riding-*` | (49.8, 1, 0), 75 ticks on | standing on `stone_a` mid-crossing: its mist-pale top, its dark rim, the mist streak of its channel under it |
| `dash-gap-*` | (62.5, 1, 0) | the first dash: the lintel hanging dark over the 1.5 u gap, the far top paper behind it |
| `swordsman-*` | (10.5, 0, 0) | `guard-first` on his ground across the first gap |
| `goal-*` | (123.5, 2.5, 0) | off `stone_b`: `guard-goal`, the second lintel, the goal's torii |
| `beside-chapter-2-1920x1080.png` | spawn of each | chapter 2 as it ships (left) and chapter 3 (right), each from (2, 0, 0) |

Retake (one at a time: each uses the preview port):

    node tools/harness/frame.ts 03-drifting-stones <out> --size=WxH --at=<x,y,z> --yaw=-90 [--settle=N] [--gpu]
    node tools/art/beside.mjs <pair> <greybox.png> <ink.png>

The greybox halves need origin/main's source before D-029 (a scratch checkout at 584a9d4, with `--build`).

Where it falls short, by eye: before the first jump the docked stone is behind the torii's posts and its
mist-pale top reads only as a greyer piece of ground; nothing in that frame says it moves (its keel is under it,
seen only once it is out over the void). The wall beside the path is chapter 1's, in proportion now and still
seen along its length, its strokes magnified near the camera (B-52, B-117). A reachable ledge of the wall is a
thin pale scratch (as B-113 in chapter 2). The mist streak is faint and could read as a lower path (B-118).
