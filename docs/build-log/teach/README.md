# TEACH-AND-CHAPTER-SELECT (D-025): frames

The production page in headless Chromium (SwiftShader), driven with real keys. Taken at 3caf66b
(7399844, after it, changes nothing these frames show).

| Frame | What it shows |
|---|---|
| `teach-ch2-first-face-1920x1080.png` | the ledge-grab line at chapter 2's first face, the wall Tim could not get up, the warrior standing against it |
| `teach-ch2-hang-1920x1080.png` | the same wall a moment later: the ledge caught by a held jump while pushing in, and the hang's line in the first one's place |
| `teach-ch1-first-swordsman-1920x1080.png` | the fight's line at chapter 1's first swordsman |
| `teach-ch1-start-1920x1080.png` | the walking line at the start of a first visit |
| `chapters-400x800.png`, `chapters-1920x1080.png` | the chapter list over the title, the first chapter in focus |
| `title-400x800.png`, `title-1920x1080.png`, `title-1000x900.png` | the title with its fourth button, at a phone, a monitor, and the near-square window B-59 was found at |
| `howto-1920x1080-2.png` | the how-to-play page: the same lines, and Chapters beside Back |

To take them again (one playtest or frame tool at a time):

```
node tools/harness/shell-shots.ts <dir> --build --size=1920x1080,400x800,5120x1440,1000x900,810x1010 --teach
```

`--teach` plays the first size given: Play, a step forward, then chapter 2 through the list in the how-to-play
page, forward to the wall, and a held jump.
