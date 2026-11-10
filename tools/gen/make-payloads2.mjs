#!/usr/bin/env node
// Second-round input payloads: redo of the three inputs rejected on first view.
//   warrior back v1: T-pose, did not match the front view's A-pose
//   cliff v1:        ran off the bottom of the frame; one pale face and one dark face (reads as lit)
//   torii v1:        black lintel cap and black post feet (the brief: a single flat vermilion)
//
//   node tools/gen/make-payloads2.mjs
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), 'payloads');
const STYLE = 'Flat sumi-e ink wash painting on aged warm paper. Hand-painted, not rendered. A single isolated subject on plain paper, centred, whole subject in frame. Dark tapering brush outline, flat even ink-wash fill, uniform ambient tone with no visible light source, no cast shadow, no sheen. Monochromatic warm grey from pale paper to near-black ink. Brush character at every edge.';
const TAIL = 'Plain empty paper background and nothing else in the picture: no ground line, no cliff wall, no mist, no clouds, no shadow, no text, no seal. Whole subject in frame with a paper margin all round.';

const P = {
  'in-warrior-back2': {
    prompt: `Redraw the man in the first image as seen from directly BEHIND, keeping the first image's silhouette: the figure is the same height and fills the frame exactly as in the first image, standing upright with feet shoulder-width apart, and his arms hang DOWN and slightly away from the body at the same shallow angle as in the first image, hands open at hip height. This is NOT a T-pose: the arms are not raised and not horizontal. Draw the back of the wide conical straw hat, the back of the blue-grey robe with frayed hem and ragged sleeve ends, the belt knot gone (it is at the front), dark cloth wraps on forearms and lower legs, heels of the straw sandals. ONE sword in a dark scabbard is slung diagonally across his back: wrapped hilt above his right shoulder (the viewer's right), scabbard tip near his left hip (the viewer's left). Two tan gourds hang at his left hip (the viewer's left). The second image is the original painting of him from behind: match its sword, robe and line quality.\n\n${STYLE}\n\n${TAIL}`,
    image_urls: ['file:assets/build/gen/in/warrior_front_v4.png', 'file:assets/build/gen/refs/ref_warrior.png'],
    aspect_ratio: '3:4',
  },
  'in-cliff2': {
    prompt: `${STYLE}\n\nSubject: one tall free-standing pillar of cliff rock, like a single buttress of the cliff wall in the reference image, redrawn alone as a complete object. The WHOLE rock is inside the picture: its jagged top and its flat cut-off bottom edge are both visible, with empty paper above and below it. Seen level, straight on, no perspective. About twice as tall as it is wide, widest at the bottom. One solid mass with a broken, uneven, jagged contour: an irregular notched top, chipped stepped corners, a few deep vertical cracks and dark ink crevices. The rock faces are one even mid-grey wash all over, left and right sides the same tone; tone changes only inside cracks. No pale face, no dark face, no highlight. No horizontal strata bands, no layers, no stripes. No trees, no path, no gate.\n\n${TAIL}`,
    image_urls: ['file:assets/build/gen/refs/ref_cliff.png'],
    aspect_ratio: '3:4',
  },
  'in-torii2': {
    prompt: `Edit this painting, changing only the colour of three areas: repaint the black top of the lintel and the two black feet at the bottom of the posts in the same flat vermilion red as the rest of the gate. After the edit every part of the gate is one single flat vermilion red (#e34234) with a dark brush outline, and there is no black or grey area anywhere on it. Keep the shape, the outline, the beams, the plain empty aged-paper background and everything else identical. No shadow.`,
    image_urls: ['file:assets/build/gen/in/torii_v1.png'],
    aspect_ratio: '1:1',
  },
};
for (const [name, p] of Object.entries(P)) {
  writeFileSync(join(dir, `${name}.json`), JSON.stringify({ ...p, output_format: 'png', num_images: 1 }, null, 2) + '\n');
  console.log(`payloads/${name}.json`);
}
