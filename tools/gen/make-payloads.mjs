#!/usr/bin/env node
// Writes the input-image payloads (style block + subject line) into tools/gen/payloads/.
// The style block is the one in 00-start-here/PROMPT-ART-GEN.md, verbatim, and goes first.
// The warrior front view was made by hand in four steps (in-warrior-front*.json) and is not here.
//
//   node tools/gen/make-payloads.mjs
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), 'payloads');
const STYLE = 'Flat sumi-e ink wash painting on aged warm paper. Hand-painted, not rendered. A single isolated subject on plain paper, centred, whole subject in frame. Dark tapering brush outline, flat even ink-wash fill, uniform ambient tone with no visible light source, no cast shadow, no sheen. Monochromatic warm grey from pale paper to near-black ink. Brush character at every edge.';
const TAIL = 'Plain empty paper background and nothing else in the picture: no ground line, no cliff wall, no mist, no clouds, no shadow, no text, no seal. Whole subject in frame with a paper margin all round.';

const P = {
  'in-warrior-back': {
    prompt: `${STYLE}\n\nSubject: the BACK VIEW of the swordsman in the first image, seen from directly behind, as the matching view on a character turnaround sheet. Exactly the same man, same size in frame, same upright symmetrical stance, feet shoulder-width apart, both arms straight and held away from the body at the same angle, hands open and empty. Back of the wide conical straw hat, back of the blue-grey robe with its frayed hem and ragged sleeve ends, dark cloth wraps on forearms and lower legs, straw sandals seen from behind. ONE sword in a dark scabbard slung diagonally across his back: the wrapped hilt rises above his right shoulder (now on the viewer's right) and the scabbard tip ends near his left hip (the viewer's left). The two tan gourds hang at his left hip (the viewer's left). The second image shows the same man from behind in the original painting: take the look of his back, the sword and the robe from it, but keep the pose and proportions of the first image.\n\n${TAIL}`,
    image_urls: ['file:assets/build/gen/in/warrior_front_v4.png', 'file:assets/build/gen/refs/ref_warrior.png'],
    aspect_ratio: '3:4',
  },
  'in-pine': {
    prompt: `${STYLE}\n\nSubject: one gnarled old cliff pine like the one in the reference image, redrawn alone. A thick twisted near-black trunk that grows out sideways from a small rough lump of grey rock at its base and then bends upward in crooked elbows, with a few crooked branches. Each branch ends in a flat, layered, horizontal pad of dark needle foliage, five to seven pads in all, stacked at different heights. Solid dark masses, readable silhouette. Keep the brush quality and ink values of the reference.\n\n${TAIL}`,
    image_urls: ['file:assets/build/gen/refs/ref_pine.png'],
    aspect_ratio: '1:1',
  },
  'in-cliff': {
    prompt: `${STYLE}\n\nSubject: one tall free-standing chunk of cliff rock, like a single pillar of the cliff wall in the reference image, redrawn alone and seen slightly from one corner so that two of its faces show. About twice as tall as it is wide. One solid mass with a broken, uneven, jagged contour: an irregular notched top, chipped corners, a few deep vertical cracks and dark ink crevices. Mid-grey wash faces of even tone, the tone varying only by brush wash and never by lighting. No horizontal strata bands, no layers, no stripes. No trees, no path, no gate.\n\n${TAIL}`,
    image_urls: ['file:assets/build/gen/refs/ref_cliff.png'],
    aspect_ratio: '3:4',
  },
  'in-boulder': {
    prompt: `${STYLE}\n\nSubject: one large angular boulder, like the dark rock mass in the reference image, redrawn alone. A single solid chunky rock, a little wider than tall, with a few big flat broken facets, sharp edges and a jagged outline. Dark grey ink wash, the tone varying only by brush wash and dry-brush texture, never by lighting. It is one rock, not a pile.\n\n${TAIL}`,
    image_urls: ['file:assets/build/gen/refs/ref_boulder.png'],
    aspect_ratio: '1:1',
  },
  'in-torii': {
    prompt: `${STYLE}\n\nSubject: one torii shrine gate like the ones in the reference image, redrawn alone, seen from slightly to one side (a shallow three-quarter view) so that its thickness shows. Two tall round posts standing straight. A long curved top lintel with gently upturned ends resting on a second, thinner beam directly under it. Lower down, a straight tie beam passing through both posts, with one short strut at the centre between the tie beam and the lintel. Every part of the gate is the same single flat vermilion red (#e34234), the only colour in the picture, with a dark tapering brush outline. No black cap, no plinth, no stone base: the posts simply end.\n\n${TAIL}`,
    image_urls: ['file:assets/build/gen/refs/ref_torii.png'],
    aspect_ratio: '1:1',
  },
};
const only = process.argv.slice(2);
for (const [name, p] of Object.entries(P)) {
  if (only.length && !only.includes(name)) continue;
  writeFileSync(join(dir, `${name}.json`), JSON.stringify({ ...p, output_format: 'png', num_images: 1 }, null, 2) + '\n');
  console.log(`payloads/${name}.json`);
}
