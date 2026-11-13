# MOBILE-TOUCH (D-027): frames

The phone layout, for Tim to look at before it is deployed. Taken on darwin in headless Chromium with touch on
(SwiftShader, device pixel ratio 1), on the harness bundle's front door with `?touchprobe=1`: the real game, its
own frame loop, played by real touch events. **Emulated, not a phone:** the notch, Safari and a real GPU are not
in these frames (B-106).

| Frame | What it shows |
|---|---|
| `play-844x390.png`, `play-932x430.png` | chapter 1 at its start, the controls idle: the stick bottom left, Jump, Sword and Dash bottom right, the pause button top right, the teach line at the top naming the stick |
| `stick-jump-844x390.png`, `stick-jump-932x430.png` | the stick pushed down the screen with Jump held: the knob at the thumb, Jump drawn pressed, the warrior in the air |
| `pause-844x390.png`, `pause-932x430.png` | the pause card: Resume, How to play, Chapters, Menu. The controls are gone while paused |
| `howto-844x390.png`, `howto-932x430.png` | the how-to-play page opened from the pause card |
| `howto-844x390-controls.png`, `howto-932x430-controls.png` | its controls table as a finger reads it: the stick, Jump, Dash, the stick at its edge, Sword, a drag |
| `results-844x390.png`, `results-932x430.png` | the results card at chapter 1's goal: Next chapter |
| `title-390x844.png` | a phone held upright: the title as it always was |
| `upright-390x844.png` | the same phone after Play: the game waits under the notice until it is turned sideways |

Retake: `node tools/harness/touch-shots.ts docs/build-log/mobile-touch --build` (one playtest or frame tool at a time).
