#!/usr/bin/env node
// Third-round input payloads: the two inputs whose Trellis test did not read as the object.
//   pine v1:    Trellis made a flat cut-out (0.13 deep for 1.0 wide). A side-on flat painting of a
//               tree carries no depth cue, so this asks for a view from above with pads as discs.
//   boulder v1: Trellis made a lump on a trunk (a tree). The tufts round the outline and the
//               lack of a base read as foliage; this asks for a rock sitting on a flat base.
//
//   node tools/gen/make-payloads3.mjs
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), 'payloads');
const STYLE = 'Flat sumi-e ink wash painting on aged warm paper. Hand-painted, not rendered. A single isolated subject on plain paper, centred, whole subject in frame. Dark tapering brush outline, flat even ink-wash fill, uniform ambient tone with no visible light source, no cast shadow, no sheen. Monochromatic warm grey from pale paper to near-black ink. Brush character at every edge.';
const TAIL = 'Plain empty paper background and nothing else in the picture: no ground line, no cliff wall, no mist, no clouds, no shadow, no text, no seal. Whole subject in frame with a paper margin all round.';

const P = {
  'in-pine3': {
    prompt: `${STYLE}\n\nSubject: one gnarled old cliff pine like the one in the reference image, redrawn alone as a solid three-dimensional tree seen from a three-quarter angle and from slightly above. A very thick, stout, twisted near-black trunk grows out sideways from a chunky lump of grey rock at its base and bends upward in crooked elbows. Four thick crooked branches spread out in different directions around the trunk, some toward the viewer and some away. Each branch carries one thick flat-topped cushion of dark needle foliage, like a round disc seen from above, so that the oval top of every cushion is visible; five cushions in all at different heights, overlapping in depth. Thick, heavy forms throughout, nothing thin or wispy, no loose needles. Keep the brush quality and ink values of the reference.\n\n${TAIL}`,
    image_urls: ['file:assets/build/gen/refs/ref_pine.png'],
    aspect_ratio: '1:1',
  },
  'in-boulder3': {
    prompt: `${STYLE}\n\nSubject: one large angular boulder resting on its own flat base, like the dark rock mass in the reference image, redrawn alone and seen from a three-quarter angle slightly above, so the top and two sides show. A single solid heavy block of stone, clearly wider than it is tall, broad at the bottom, with a few big flat broken facets, sharp edges and a jagged outline. Dark grey ink wash, every facet close to the same tone, tone changing only in the cracks between facets. Clean outline: no grass, no moss, no tufts, no dots or small marks around the edge. It is one rock, not a pile, and it has no stem or stalk under it.\n\n${TAIL}`,
    image_urls: ['file:assets/build/gen/refs/ref_boulder.png'],
    aspect_ratio: '1:1',
  },
};
for (const [name, p] of Object.entries(P)) {
  writeFileSync(join(dir, `${name}.json`), JSON.stringify({ ...p, output_format: 'png', num_images: 1 }, null, 2) + '\n');
  console.log(`payloads/${name}.json`);
}
