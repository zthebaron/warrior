# CAMERA-WALL-ZOOM: the frames

Chapter 2's first tall wall (the +4.5 climb face at x = 12), a player's arrival: the recorded run to tick 90,
then forward held into the wall. He reaches the face at tick 104 and his velocity is 0 from tick 105.

| tick | before (main `8ca066c`, the same as `?pivothold=off`) | after |
|---|---|---|
| 110, standing against the wall | arm 0.80: the camera is inside the rock. `before-t110-*.png` | arm 7.00. `after-t110-*.png` |
| 140, still standing | arm 0.80: the hat fills the frame. `before-t140-*.png` | arm 7.00: the whole warrior, the wall face, its top edge and the landing beyond. `after-t140-*.png` |

Each at 1920x1080 and 5120x1440, drawn on this machine's GPU (ANGLE Metal, Apple M4 Max), not SwiftShader (B-81).

To take them again:

```
node tools/harness/camera-log.ts 02-cliff-seam --build --script=wall12 --shot=140 --size=5120x1440 --gpu --out=after.png
node tools/harness/camera-log.ts 02-cliff-seam --script=wall12 --shot=140 --size=5120x1440 --gpu --hold=off --out=before.png
```

The arm tick by tick over the same stretch: `node tools/harness/camera-log.ts 02-cliff-seam --script=wall12 --from=95 --to=215`
(add `--hold=off` for the rig as it was). The numbers are in `00-start-here/MEASUREMENTS.md`, "CAMERA-WALL-ZOOM".
