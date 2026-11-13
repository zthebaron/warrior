# COURTYARD: chapter 5 (D-026)

Frames of `levels/05-courtyard.json` on the build at 61aff4d. Each is taken twice: 1920 x 1080 in the harness's
own Chromium, and 5120 x 1440 on this machine's GPU (`--gpu`: at that size SwiftShader draws the ink pass black, B-81).

| Frame | What it shows |
|---|---|
| `entrance-*.png` | the walk in: the terrace of flags, the post-and-beam gateway, the torii and the yard through it, the painting's mountains either side. The player's own camera at (1, 0, 0) |
| `three-swordsmen-*.png` | the yard from just past the torii: the three on their posts, the walls and their tiled caps, the gate shut, the mountains over the far wall |
| `gate-shut-*.png` | the far gate from behind the three: the generated model, its two leaves shut |
| `gate-open-*.png` | tick 320 of the recorded run, the player's own camera: every swordsman down, the leaves swung out, the warrior walking at the goal |
| `beside-painting-2160x1080.png` | Tim's painting (left) and the yard from a camera as high as the painting's (right) |

Retake (one at a time: each uses the preview port):

    node tools/harness/frame.ts 05-courtyard <out> --size=WxH --at=1,0,0 --yaw=-90 [--gpu]
    node tools/harness/frame.ts 05-courtyard <out> --size=WxH --at=15.4,0,0 --yaw=-90 --cam=12.8,3.9,1.2 --target=26,1.2,-0.4 [--gpu]
    node tools/harness/frame.ts 05-courtyard <out> --size=WxH --at=15.4,0,0 --yaw=-90 --cam=17.2,3.4,0.6 --target=33,2.6,0 [--gpu]
    node tools/harness/camera-log.ts 05-courtyard --yaw=fixed --shot=320 --out=<out> --size=WxH [--gpu]
    node tools/harness/frame.ts 05-courtyard <out> --size=1080x1080 --at=15.4,0,0 --yaw=-90 --cam=11.2,6.4,0 --target=27,1.6,0

Where it falls short of the painting: the ground has thin even joints and none of the painting's heavy shadow
washes (B-102); the three stand nearer the middle (B-97); the sky is a faint rose, not red (B-103); the gate is
grey ink, not red-brown timber, and shut until the yard is clear.
