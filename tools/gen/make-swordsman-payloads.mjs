#!/usr/bin/env node
// The swordsman (D-023): reference crops from Tim's courtyard painting, and the input-image payloads.
// The figure is made the way the warrior was (assets/hero/MANIFEST.md): a clean single-subject input image
// from the painting, image-to-3D, one rig request with its clips. The style block is the one in
// 00-start-here/PROMPT-ART-GEN.md, verbatim, as tools/gen/make-payloads.mjs has it.
//
//   node tools/gen/make-swordsman-payloads.mjs            crops into assets/build/gen/refs/, payloads into tools/gen/payloads/
//
// The front view took three steps, each a payload kept beside these: in-swordsman-front (arms too close to the
// body), in-swordsman-front-fix (a T-pose, the katana hanging from the fist), then tools/gen/swordsman-input.mjs,
// which paints the katana out locally. -fix2 (blade in line with the arm) and -fix3 (a blank sheet) were not used.
//
// The painting's near swordsman wears a red sash. The accent is the torii's alone (STYLE-BIBLE §2), so the
// prompt asks for a grey sash and no red anywhere.
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const refs = join(ROOT, 'assets/build/gen/refs');
mkdirSync(refs, { recursive: true });

// name: [left, top, width, height] in the 1024x1024 painting (assets/ui/src/courtyard-duel.png)
const CROPS = {
  swordsman_near: [400, 640, 280, 260],   // the near one, from behind: the largest of the three
  swordsman_right: [690, 520, 180, 230],  // the right one, sword raised: the only one whose front shows
};
for (const [name, [left, top, width, height]] of Object.entries(CROPS)) {
  const scale = Math.ceil(1024 / Math.max(width, height));
  await sharp(join(ROOT, 'assets/ui/src/courtyard-duel.png'))
    .extract({ left, top, width, height })
    .resize({ width: width * scale, kernel: 'lanczos3' })
    .png()
    .toFile(join(refs, `ref_${name}.png`));
  console.log(`ref_${name}.png  ${width}x${height} x${scale}`);
}

const STYLE = 'Flat sumi-e ink wash painting on aged warm paper. Hand-painted, not rendered. A single isolated subject on plain paper, centred, whole subject in frame. Dark tapering brush outline, flat even ink-wash fill, uniform ambient tone with no visible light source, no cast shadow, no sheen. Monochromatic warm grey from pale paper to near-black ink. Brush character at every edge.';
const TAIL = 'Plain empty paper background and nothing else in the picture: no ground line, no courtyard, no wall, no mist, no clouds, no shadow under the feet, no text, no seal. Whole figure from the top of the head to the sandals in frame with a paper margin all round.';
const MAN = 'A lean bare-headed man, black hair tied up in a small topknot, stern plain face. A dark charcoal-grey kimono jacket with wide sleeves, crossed at the chest, and wide pleated hakama trousers in a darker ink grey, gathered above the ankles. A plain dark grey cloth sash at the waist. Dark cloth wraps on the shins, straw sandals. Everything he wears is grey ink wash: there is NO red and no other colour anywhere on him.';

const P = {
  'in-swordsman-front': {
    prompt: `${STYLE}\n\nSubject: one of the swordsmen from the reference images, redrawn alone as a full-body FRONT VIEW for a character turnaround sheet. He faces the viewer squarely, standing upright and symmetrical, feet shoulder-width apart, both arms straight and held clearly away from the body at about 40 degrees. ${MAN} His left hand (on the viewer's right) is open and empty. His RIGHT hand (on the viewer's left) grips a drawn katana: a plain, slightly curved steel blade with a small round guard and a wrapped hilt. The blade points down and outward, continuing the straight line of his arm, well clear of his leg, its tip a hand's width above the level of his feet. An empty dark scabbard is thrust through the sash at his left hip (the viewer's right), pointing down and back.\n\nThe references show the swordsmen fighting in a courtyard: keep their clothes, hair, build and line quality, and discard the courtyard and the fighting pose.\n\n${TAIL}`,
    image_urls: ['file:assets/build/gen/refs/ref_swordsman_right.png', 'file:assets/build/gen/refs/ref_swordsman_near.png'],
    aspect_ratio: '3:4',
  },
  'in-swordsman-back': {
    prompt: `${STYLE}\n\nSubject: the BACK VIEW of the swordsman in the first image, seen from directly behind, as the matching view on a character turnaround sheet. Exactly the same man, same size in frame, the same T-pose: standing upright and symmetrical, feet shoulder-width apart, both arms held straight out level to the sides. Both hands are empty: his right hand, now on the viewer's RIGHT, is a closed fist, and his left hand, now on the viewer's LEFT, is open. The back of his head with the small topknot, the back of the dark charcoal-grey kimono jacket with its wide sleeves and of the wide pleated hakama trousers, the knot of the plain grey sash, dark shin wraps and straw sandals seen from behind. The empty dark scabbard is at his left hip, now on the viewer's LEFT, pointing down and back. No red and no other colour anywhere. The second image shows such a swordsman from behind in the original painting: take the look of his back from it, but keep the pose and proportions of the first image.\n\n${TAIL}`,
    image_urls: ['file:assets/build/gen/in/swordsman_front.png', 'file:assets/build/gen/refs/ref_swordsman_near.png'],
    aspect_ratio: '3:4',
  },
};
for (const [name, p] of Object.entries(P)) {
  writeFileSync(join(HERE, 'payloads', `${name}.json`), JSON.stringify({ ...p, output_format: 'png', num_images: 1 }, null, 2) + '\n');
  console.log(`payloads/${name}.json`);
}
