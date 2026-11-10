#!/usr/bin/env node
// Round 2, Priority 2: the prompts for the painted backdrop cards (00-start-here/PROMPT-ART-GEN-2.md).
// Round 1 showed that image-to-3D turns a flat ink painting of landscape into a thin card, so the
// landscape is delivered as what it is: painted layers. Each subject is painted alone on plain
// paper so that tools/gen/cut-paper.mjs can cut the paper away.
//
//   node tools/gen/make-backdrop-payloads.mjs [--model nano-banana|nano-banana-2] [name ...]
//
// Writes tools/gen/payloads/bd-<name>.json. The style block is the one in PROMPT-ART-GEN.md,
// verbatim, and goes first. CARDS is also read by the cutter and the sheet: it says how each card
// is cut (wash or matte) and what it is for.
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), 'payloads');
const STYLE = 'Flat sumi-e ink wash painting on aged warm paper. Hand-painted, not rendered. A single isolated subject on plain paper, centred, whole subject in frame. Dark tapering brush outline, flat even ink-wash fill, uniform ambient tone with no visible light source, no cast shadow, no sheen. Monochromatic warm grey from pale paper to near-black ink. Brush character at every edge.';
const TAIL = 'Plain empty aged-paper background and nothing else in the picture: no ground line, no figure, no gate, no path, no sun, no moon, no birds, no text, no seal, no border, no frame. The paper is one flat even pale tone from edge to edge, with no vignette and no dark corners. Whole subject in frame with a clear margin of bare paper all round. Strictly monochrome warm grey: no blue, no green, no brown tint.';
const REF = (what) => `The reference image is a piece of the original painting: take the brush handling, the ink values and the paper from ${what} in it, but paint only the subject described here.`;

const PEAK = (shape) => `${STYLE}\n\nSubject: one far-away mountain ridge seen through haze, as a pale silhouette. ${shape} It is wide and low, about four times wider than it is tall. Painted in exactly two pale values and nothing darker: a flat pale grey wash for the body of the ridge, and one soft, slightly darker brush stroke running along the top of the ridge line. For this distant subject there is no hard outline: the ridge line is that one soft stroke. The lower part of the ridge thins out and fades softly into bare paper, with no bottom edge. It is far away: everything stays pale, the darkest tone is a light-to-middle grey. ${REF('the far ridge on the horizon')}\n\n${TAIL}`;
const MIST = (shape) => `${STYLE}\n\nSubject: one long horizontal band of mist, a piece of a cloud sea, drifting across the middle of the picture. ${shape} Painted with the palest wash only, barely darker than the paper, with a few slightly darker soft streaks inside it. The upper edge is soft and billowing, with no line. The lower part and both ends thin away to nothing in bare paper. There is no outline anywhere and no hard edge anywhere: this subject is all soft wash. Nothing in it is darker than a light grey. ${REF('the cloud sea')}\n\n${TAIL}`;
const CLIFF = (shape) => `${STYLE}\n\nSubject: one tall cliff face, a single towering wall of rock like the cliff on the left of the reference image, painted alone and seen straight on. ${shape} It is much taller than it is wide, between two and three times as tall. Its contour is jagged and broken: a notched, uneven top, chipped corners, overhangs and deep vertical clefts down its sides, so that no edge runs straight. Dark, near-black ink masses: long vertical dry-brush strokes of near-black ink for the clefts, crevices and the undersides of overhangs, laid over mid-grey wash faces, with a few slivers of bare paper where the brush skipped. The tone varies only by brush wash, never by lighting: there is no lit side and no shaded side. No horizontal strata bands and no stripes. The foot of the cliff breaks up and fades out into bare paper, as if it stood in mist; there is no ground. No trees, no bushes, no grass. ${REF('the cliff wall')}\n\n${TAIL}`;
const PINE = (shape) => `${STYLE}\n\nSubject: one gnarled old cliff pine, like the pines growing out of the cliff in the reference image, painted alone. ${shape} The trunk is thick, twisted and near-black, bending in crooked elbows, with a few crooked branches. Each branch ends in a flat, layered, horizontal pad of dark needle foliage: five to seven pads in all, stacked at different heights like shelves, each pad a solid dark mass with a ragged brushed edge. At the root there is only a small rough lump of grey rock, no bigger than one foliage pad, and nothing else of the cliff. Readable silhouette. ${REF('the pines')}\n\n${TAIL}`;
const WIDE = (shape) => `${STYLE}\n\nSubject: a wide, quiet, far-away view: distant mountain peaks rising out of a sea of mist. ${shape} Most of the picture is bare paper: the sky above is empty paper and the mist sea below is empty paper with only a few very pale horizontal wash streaks. The peaks are pale silhouettes in two or three pale grey values, each with one soft, slightly darker stroke along its ridge line and no hard outline, and each fading out at its foot into the mist. Nothing in the picture is darker than a middle grey. It fills the full width of the picture, but leaves the top third and the bottom third almost empty. ${REF('the far ridge and the cloud sea')}\n\nPlain aged-paper everywhere that is not painted, one flat even pale tone with no vignette and no dark corners. No figure, no gate, no path, no cliff, no trees, no sun, no moon, no birds, no text, no seal, no border. Strictly monochrome warm grey: no blue, no green, no brown tint.`;

/**
 * name -> { cut, floor?, aspect, ref, prompt, what }. cut: how cut-paper.mjs turns the paper into alpha.
 * floor: a higher noise floor for the pines, which are all dark ink: their paintings came on darker,
 * unevener paper, and a pale patch of it left under a tree reads as a cast shadow.
 */
export const CARDS = {
  peaks_a: { cut: 'wash', aspect: '21:9', ref: 'bd_peaks', what: 'far peak: one rounded summit with a long shoulder', prompt: PEAK('One main rounded summit left of centre, with a long gentle shoulder sloping away to the right and a short steeper slope to the left.') },
  peaks_b: { cut: 'wash', aspect: '21:9', ref: 'bd_peaks', what: 'far peak: one long low range (painted with a paler peak behind it, which was too faint to cut)', prompt: PEAK('Two overlapping ranges: a nearer low humped range across the whole width, and behind it, right of centre, one taller and even paler pointed peak.') },
  peaks_c: { cut: 'wash', aspect: '21:9', ref: 'bd_peaks', what: 'far peaks: a jagged sawtooth range', prompt: PEAK('A jagged sawtooth range of five or six uneven pointed peaks of different heights, the tallest one right of centre.') },
  mist_a: { cut: 'wash', aspect: '21:9', ref: 'bd_mist', what: 'mist: three soft streaks (painted as a fuller bank; only its darker streaks cut)', prompt: MIST('A long even band, thickest in the middle, about six times wider than it is tall.') },
  mist_b: { cut: 'wash', aspect: '21:9', ref: 'bd_mist', what: 'mist band: two drifting layers', prompt: MIST('Two thin overlapping layers of mist, the upper one shorter and offset to the left, with a gap of bare paper between them at the right.') },
  cliff_a: { cut: 'matte', aspect: '9:16', ref: 'bd_cliff', what: 'cliff face: one leaning tower', prompt: CLIFF('One single tower of rock that leans slightly to the right, widest a third of the way up and narrowing to a split, pointed top.') },
  cliff_b: { cut: 'matte', aspect: '9:16', ref: 'bd_cliff', what: 'cliff face: two buttresses split by a cleft', prompt: CLIFF('A deep, dark vertical cleft runs down the wall and splits it into two buttresses of unequal height, the left one taller, with a flat-topped shoulder halfway up the right one.') },
  cliff_c: { cut: 'matte', aspect: '9:16', ref: 'bd_cliff', what: 'cliff face: stepped, with an overhanging top', prompt: CLIFF('A stepped wall: a heavy overhanging top that juts out to the left, a narrow ledge halfway down, and a broader broken base.') },
  pine_a: { cut: 'open', floor: '5,11', aspect: '4:3', ref: 'pine', what: 'cliff pine: growing out to the right', prompt: PINE('It grows out sideways to the right from the lump of rock at the lower left: the trunk first dips a little, then reaches far out to the right and turns up at the end.') },
  pine_b: { cut: 'open', floor: '5,11', aspect: '4:3', ref: 'pine', what: 'cliff pine: growing out to the left', prompt: PINE('It grows out sideways to the left from the lump of rock at the lower right: the trunk leans out low and long to the left, with one branch rising straight up from its middle.') },
  pine_c: { cut: 'open', floor: '5,11', aspect: '4:3', ref: 'pine', what: 'cliff pine: hanging down below its root', prompt: PINE('It hangs down from the lump of rock at the upper left: the trunk drops below its root in a long windswept curve to the right, so that most of the foliage pads are lower than the rock.') },
  wide_a: { cut: 'wash', aspect: '21:9', ref: 'bd_wide', what: 'wide backdrop: peaks grouped on the right', prompt: WIDE('Three peaks grouped in the right-hand third, the middle one tallest, and one small low island of rock far off on the left.') },
  wide_b: { cut: 'wash', aspect: '21:9', ref: 'bd_wide', what: 'wide backdrop: a long chain, tallest on the left', prompt: WIDE('A long chain of five peaks across the whole width, tallest on the left and stepping down to low humps on the right, with bands of mist drifting in front of their feet.') },
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const mi = a.indexOf('--model');
  const model = mi === -1 ? 'nano-banana' : a.splice(mi, 2)[1];
  if (model !== 'nano-banana' && model !== 'nano-banana-2') { console.error('--model must be nano-banana or nano-banana-2'); process.exit(2); }
  for (const [name, c] of Object.entries(CARDS)) {
    if (a.length && !a.includes(name)) continue;
    const p = { prompt: c.prompt, image_urls: [`file:assets/build/gen/refs/ref_${c.ref}.png`], aspect_ratio: c.aspect, output_format: 'png', num_images: 1 };
    if (model === 'nano-banana-2') p.resolution = '2K';
    const f = `bd-${name}${model === 'nano-banana-2' ? '.2k' : ''}.json`;
    writeFileSync(join(dir, f), JSON.stringify(p, null, 2) + '\n');
    console.log(`payloads/${f}`);
  }
}
