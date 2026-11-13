# assets/audio: the game's sound (D-022, D-023, POLISH-1)

Every file here was generated on fal through `tools/gen/fal-call.mjs`, so each has a row in
`state/FAL-LEDGER.md`, and cut to what ships by `tools/gen/build-audio.mjs`. **Nothing here was judged by ear:**
the session that made it cannot hear. Every choice below rests on a measurement (`tools/gen/audio-stats.mjs`,
`tools/harness/audio-check.ts`); MEASUREMENTS.md "D-022 sound" and "D-023 sound" have the numbers. Tim should listen.

## Shipped

| file | bytes | length | cut from (take) | ledger row | cost | what it is for |
|---|---|---|---|---|---|---|
| `music.mp3` | 1,359,620 | 84.9 s (an 83.9 s loop, continued 0.5 s on each side) | `music-s11.wav` 0.1 to 88 s, with `rain_wind.mp3` laid 10 dB under it | 76 and 80 | $0.2000 + $0.0600 | The music: one seamless loop. Stereo, 128 kbps. |
| `jump.mp3` | 5,642 | 0.40 s | `double_jump.mp3` from 0 ms | 68 | $0.0020 | Jump and wall jump. The double jump is this file played 1.3 times as fast. |
| `land_soft.mp3` | 5,642 | 0.40 s | `land_soft-b.mp3` from 44 ms | 79 | $0.0020 | A landing slower than 18 m/s. |
| `land_hard.mp3` | 7,836 | 0.60 s | `land_hard.mp3` from 0 ms | 70 | $0.0020 | A landing at 18 m/s or faster. |
| `slash.mp3` | 7,836 | 0.58 s | `slash.mp3` from 0 ms | 71 | $0.0020 | The sword slash. |
| `dash.mp3` | 5,329 | 0.37 s | `dash.mp3` from 229 ms | 72 | $0.0020 | Dash. |
| `wall_grab.mp3` | 2,821 | 0.18 s | `wall_grab.mp3` from 410 ms | 73 | $0.0020 | A wall slide or a ledge grab beginning. |
| `checkpoint.mp3` | 23,510 | 1.90 s | `checkpoint.mp3` from 0 ms | 74 | $0.0040 | A torii reached. The chapter's goal is this file played at 0.75. |
| `respawn.mp3` | 15,046 | 1.20 s | `respawn.mp3`, whole | 75 | $0.0040 | Standing at the torii again after a fall. |
| `notice.mp3` | 5,642 | 0.40 s | `notice.mp3`, from its onset | 89 | $0.0020 | D-023: a swordsman notices the warrior. |
| `hit.mp3` | 4,702 | 0.32 s | `hit-b.mp3`, from its onset | 93 | $0.0020 | D-023: the warrior's blade lands. |
| `fell.mp3` | 10,031 | 0.76 s | `fell.mp3` from 188 ms | 91 | $0.0020 | D-023: a swordsman falls. Played with `hit.mp3`. |
| `cut.mp3` | 7,836 | 0.60 s | `cut.mp3`, from its onset | 92 | $0.0020 | D-023: a swordsman's blade lands on the warrior. |
| `gate.mp3` | 27,271 | 2.20 s | `gate-b.mp3` from 7 ms | 98 | $0.0060 | POLISH-1 (B-98): the courtyard's far gate begins to swing open, on the tick after the last swordsman falls. A wooden creak and groan for 1.6 s, then one dull knock. |

Effects are mono, 96 kbps, each with its peak set to -3 dB. The brief's limits are about 1.5 MB for the music and
about 50 KB an effect; `tools/assets/shell-budget.mjs` (in `npm run assets:budget`) holds them.

`audio.json` is written by the build and read by `src/audio/audio.ts`: the file names, the effects' lengths and
the window the music loops over.

## Takes bought and not shipped

| take | ledger row | cost | why not |
|---|---|---|---|
| `jump.mp3` | 67 | $0.0020 | A low thump, not a leap: 91.5% of its energy is under 200 Hz. |
| `jump-b.mp3` | 78 | $0.0020 | The same again (90.9% under 200 Hz), with a prompt that asked for air and cloth only. |
| `land_soft.mp3` | 69 | $0.0020 | Nearly silent: its peak is -38.6 dB. |
| `music-s29.wav` | 77 | $0.2000 | It clips (peak +1.7 dB) and its level swings 14.2 LU; seed 11 swings 7.7. |
| `hit.mp3` (first take) | 90 | $0.0020 | D-023: a low thud with no steel in it: 54% of its energy is under 200 Hz, centroid 367 Hz. `hit-b.mp3` ships in its place. |
| `gate.mp3` (first take) | 97 | $0.0060 | POLISH-1: quiet (-32.8 LUFS, peak -17.9 dB) broadband rumble, with two clicks near its end and no creak to see in its spectrogram. `gate-b.mp3` ships in its place. |

## Endpoints and prices (read from each model page on 2026-11-10)

- Music: `fal-ai/stable-audio-25/text-to-audio`, "$0.2 per audios". Prompt and seeds: `tools/gen/payloads/au-music-s*.json`.
- Effects and the rain bed: `fal-ai/elevenlabs/sound-effects/v3`, "$0.002 per seconds". A payload with no explicit
  duration is refused by `fal-call.mjs`, because the model would then choose the length and the price.

The task's sound cost **$0.4860** in 14 rows (67 to 80), of the $4.00 it was allowed. Every call carried
`--max-total 15.60` (the ledger stood at $11.60 when the task began).

D-023's four fight sounds cost **$0.0100** in 5 rows (89 to 93). Every call carried `--max-total 18.08`. None has
a voice in it: a cry cannot be judged by a session that cannot hear.

POLISH-1's gate cost **$0.0120** in 2 rows (97, 98), of the $0.25 it was allowed. Both calls carried
`--max-total 15.4348` (the ledger stood at $15.1848). Wood and weight were asked for, and no music, bell or metal
ring; `gate-b`'s energy is 43% under 200 Hz and 1% over 4 kHz. It was cut alone (`build-audio.mjs --only=gate`), so
no other shipped file was encoded again.

## What was measured, and what was not

- Each take: length, peak, loudness, silence at each end, where its energy sits, and a spectrogram that was looked at.
- The music had flute, plucked strings and a few low drum hits, and no weather. The rain-and-wind bed was bought
  and laid under it for that reason.
- The loop, decoded by Chromium: audio one loop apart differs by -23.2 dB (a window 0.37 s wrong: -0.3 dB), and
  the step across the seam is 1.81 ordinary sample steps (the wrong window: 15.5).
- Each effect, decoded by Chromium, starts within 1 ms.
- **Not measured, because it cannot be here:** whether the music is pleasant, whether the instruments sound like a
  shakuhachi, a koto and a taiko, whether any effect suits its move, and whether the mix (`AUDIO.gain`) is balanced.

## Rebuild

The takes are git-ignored downloads in `assets/build/gen/audio/`. Their request ids are in the ledger, so
`node tools/gen/fal-call.mjs fetch <request id> --out assets/build/gen/audio --name <take>` brings one back free.

```
node tools/gen/build-audio.mjs          # cut, encode, write audio.json, then check
node tools/gen/build-audio.mjs --check  # measure what is shipped
node tools/harness/audio-check.ts       # the loop and the lag, as a browser decodes them
```
