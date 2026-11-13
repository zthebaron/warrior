#!/usr/bin/env node
// The courtyard's gate (D-026): the reference crop from Tim's courtyard painting and the input-image payload.
// The gate is made the way the lantern and the swordsman were (assets/hero/MANIFEST.md): a clean single-subject
// input image from the painting, a two-cent shape test, then image-to-3D. The style block is the one in
// 00-start-here/PROMPT-ART-GEN.md, verbatim, as tools/gen/make-payloads.mjs has it.
//
//   node tools/gen/make-gate-payloads.mjs       the crop into assets/build/gen/refs/, the payload into tools/gen/payloads/
//
// The painting's gate has red-brown timbers. The accent is the torii's alone (STYLE-BIBLE §2), so the prompt asks
// for grey ink timbers and no red anywhere. Its doors stand open in the painting; here the doorway is asked for
// EMPTY, because the two leaves are the game's own (src/loaders/courtyard.ts turns them on their hinges).
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const refs = join(ROOT, 'assets/build/gen/refs');
mkdirSync(refs, { recursive: true });

// [left, top, width, height] in the 1024x1024 painting (assets/ui/src/courtyard-duel.png): the gate, roof to threshold
const CROP = [366, 268, 296, 244];
const [left, top, width, height] = CROP;
const scale = Math.ceil(1024 / Math.max(width, height));
await sharp(join(ROOT, 'assets/ui/src/courtyard-duel.png')).extract({ left, top, width, height }).resize({ width: width * scale, kernel: 'lanczos3' }).png().toFile(join(refs, 'ref_gate.png'));
console.log(`ref_gate.png  ${width}x${height} x${scale}`);

const STYLE = 'Flat sumi-e ink wash painting on aged warm paper. Hand-painted, not rendered. A single isolated subject on plain paper, centred, whole subject in frame. Dark tapering brush outline, flat even ink-wash fill, uniform ambient tone with no visible light source, no cast shadow, no sheen. Monochromatic warm grey from pale paper to near-black ink. Brush character at every edge.';
const TAIL = 'Plain empty paper background and nothing else in the picture: no ground line, no courtyard, no long walls, no mountains, no trees, no mist, no clouds, no people, no shadow, no text, no seal. The whole gate from the roof ridge to the foot of its posts in frame with a paper margin all round.';
const GATE = 'A traditional Japanese roofed gate standing alone: two heavy square timber posts carrying a thick lintel beam, and over them a tiled hip-and-gable roof with deep eaves that sweep gently upward at the four corners and a ridge beam along the top. Under the roof, either side of the doorway, a short plastered wall panel framed in timber, on a low stone base. The doorway between the two posts is OPEN and completely EMPTY: there are no doors in it and plain paper shows straight through it. The timbers are dark charcoal-grey ink wash, the roof tiles mid grey with dark lines for the rows of tile, the plaster pale grey. Everything is grey ink wash: there is NO red, no brown and no other colour anywhere.';

const P = {
  'in-gate': {
    prompt: `${STYLE}\n\nSubject: the gate from the reference image, redrawn alone as a clean object study. ${GATE} It is seen from the front and a little above, turned slightly to one side (a gentle three-quarter view), so that the depth of the roof and of the posts can be read.\n\nThe reference shows the gate at the far end of a walled courtyard with misty trees through it: keep its proportions, its roof and its line quality, and discard the courtyard, the walls joined to it, the doors and everything seen through the doorway.\n\n${TAIL}`,
    image_urls: ['file:assets/build/gen/refs/ref_gate.png'],
    aspect_ratio: '4:3',
  },
};
for (const [name, p] of Object.entries(P)) {
  writeFileSync(join(HERE, 'payloads', `${name}.json`), JSON.stringify({ ...p, output_format: 'png', num_images: 1 }, null, 2) + '\n');
  console.log(`payloads/${name}.json`);
}
