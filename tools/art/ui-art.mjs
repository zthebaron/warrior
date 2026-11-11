// The paintings the title screen and the how-to-play page ship (D-022), made from Tim's two paintings.
//
//   node tools/art/ui-art.mjs            write assets/ui/*.webp and *.jpg
//   node tools/art/ui-art.mjs --stats    print the measured paper tone and the keep zone, and write nothing
//
// assets/ui/src/*.png are SOURCES (Tim's, this script only reads them). What ships:
//
//   title.webp, title.jpg          the title painting, whole, at its own size (1376x768). The lettering and the
//                                  seal are painted into it, so nothing is drawn over it but the two buttons.
//   title-wide.webp                what stands beside the painting on a screen wider than it: the painting
//                                  mirrored outward from each edge (so the picture carries on across the join),
//                                  blurred, and washed toward bare paper, fully paper at the far ends. It is a
//                                  soft wash, so it ships small and is stretched.
//   title-tall.webp                the same for a screen taller than the painting's keep zone (a phone held
//                                  upright): the keep zone, then its mirror image below, fading to paper.
//   courtyard.webp, courtyard.jpg  the courtyard painting, whole (1024x1024): the how-to-play page's header.
//
// The keep zone is the part of the title painting that may never be cropped: the lettering, the seal and the
// boat with its oar. On a screen narrower than the painting the sides are cropped down to it and no further.
// The zone is in assets/ui/art.json; the CSS in index.html uses the same numbers, and
// tools/harness/shell-shots.ts measures in a browser that the zone is whole at every size it draws.
//
// sharp is not a dependency of the game: it is here because @gltf-transform/cli (a dev dependency) brings it.
// The files are committed; CI checks their sizes (tools/assets/shell-budget.mjs) and does not rebuild them,
// because an encoder's bytes are not the same on every platform.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sharp = createRequire(import.meta.url)('sharp');
const SRC = path.join(ROOT, 'assets/ui/src');
const OUT = path.join(ROOT, 'assets/ui');

// Every number is in MEASUREMENTS.md "D-022 title screen".
const UI_ART = {
  /** The keep zone, as fractions of the title painting's width: the boat's bow to the oar's blade, with a margin. */
  keep: JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/ui/art.json'), 'utf8')).keep,
  webpQuality: 82,
  jpegQuality: 80,
  /** reach: how far from the painting's edge (as a share of the extension) the wash becomes bare paper */
  wide: { width: 1536, height: 432, blur: 14, reach: 0.8, quality: 60 },
  tall: { width: 448, blur: 9, reach: 0.7, quality: 60 },
  /** the wash's alpha is smoothstep to this power: under 1 it pales early, so the extension never competes with the painting */
  veilGamma: 0.7,
  /** Bright, low-colour pixels are bare paper: brighter than this (0..255) on every channel's mean. */
  paperMinValue: 185,
};
const U = UI_ART;

/** The painting's own paper tone: the median colour of its bright pixels. */
async function paperTone(file) {
  const { data, info } = await sharp(file).resize(344).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = [[], [], []];
  for (let i = 0; i < data.length; i += info.channels) {
    if ((data[i] + data[i + 1] + data[i + 2]) / 3 < U.paperMinValue) continue;
    for (let c = 0; c < 3; c++) ch[c].push(data[i + c]);
  }
  return ch.map((v) => v.sort((a, b) => a - b)[v.length >> 1]);
}
const hex = (rgb) => '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('');

/** A raw RGBA wash of the paper colour whose alpha follows fn(x, y) in 0..1, as a sharp input. */
function wash(width, height, paper, fn) {
  const buf = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      buf[i] = paper[0]; buf[i + 1] = paper[1]; buf[i + 2] = paper[2];
      buf[i + 3] = Math.round(255 * Math.min(1, Math.max(0, fn(x, y))));
    }
  }
  return { input: buf, raw: { width, height, channels: 4 } };
}
const smooth = (t) => { const c = Math.min(1, Math.max(0, t)); return c * c * (3 - 2 * c); };

async function build() {
  const title = path.join(SRC, 'karasu-title.png');
  const court = path.join(SRC, 'courtyard-duel.png');
  const meta = await sharp(title).metadata();
  const paper = await paperTone(title);
  const out = {};

  out['title.webp'] = await sharp(title).webp({ quality: U.webpQuality, effort: 6, smartSubsample: true }).toBuffer();
  out['title.jpg'] = await sharp(title).jpeg({ quality: U.jpegQuality, mozjpeg: true, progressive: true }).toBuffer();
  out['courtyard.webp'] = await sharp(court).webp({ quality: U.webpQuality, effort: 6, smartSubsample: true }).toBuffer();
  out['courtyard.jpg'] = await sharp(court).jpeg({ quality: U.jpegQuality, mozjpeg: true, progressive: true }).toBuffer();

  // wide: [mirror | painting | mirror]; blurred; washed to paper, from none at the painting's edge to all of it
  {
    const { width: W, height: H, blur, reach, quality } = U.wide;
    const pw = Math.round((H * meta.width) / meta.height); // the painting's width at this height
    const side = Math.round((W - pw) / 2);
    const small = await sharp(title).resize(pw, H, { fit: 'fill' }).toBuffer();
    const mirror = await sharp(small).flop().toBuffer();
    const strip = async (buf, left) => {
      const x0 = Math.max(0, -left), x1 = Math.min(pw, W - left); // sharp refuses a composite that hangs off the canvas
      return { input: await sharp(buf).extract({ left: x0, top: 0, width: x1 - x0, height: H }).toBuffer(), left: left + x0, top: 0 };
    };
    const row = await sharp({ create: { width: W, height: H, channels: 3, background: { r: paper[0], g: paper[1], b: paper[2] } } })
      .composite([await strip(mirror, side - pw), await strip(small, side), await strip(mirror, side + pw)]).png().toBuffer();
    const veil = wash(W, H, paper, (x) => {
      const d = x < side ? (side - x) / side : x > side + pw ? (x - side - pw) / side : 0;
      return Math.pow(smooth(d / reach), U.veilGamma);
    });
    const washed = await sharp(row).composite([veil]).png().toBuffer();
    out['title-wide.webp'] = await sharp(washed).blur(blur).webp({ quality, effort: 6 }).toBuffer();
  }

  // tall: the keep zone, then its mirror image below it; washed to paper downward; blurred
  {
    const { width: W, blur, reach, quality } = U.tall;
    const kx = Math.round(U.keep.x0 * meta.width), kw = Math.round((U.keep.x1 - U.keep.x0) * meta.width);
    const H1 = Math.round((W * meta.height) / kw);
    const zone = await sharp(title).extract({ left: kx, top: 0, width: kw, height: meta.height }).resize(W, H1, { fit: 'fill' }).toBuffer();
    const below = await sharp(zone).flip().toBuffer();
    const col = await sharp({ create: { width: W, height: H1 * 2, channels: 3, background: { r: paper[0], g: paper[1], b: paper[2] } } })
      .composite([{ input: zone, left: 0, top: 0 }, { input: below, left: 0, top: H1 }]).png().toBuffer();
    const veil = wash(W, H1 * 2, paper, (_x, y) => (y < H1 ? 0 : Math.pow(smooth((y - H1) / H1 / reach), U.veilGamma)));
    const washed = await sharp(col).composite([veil]).png().toBuffer();
    out['title-tall.webp'] = await sharp(washed).blur(blur).webp({ quality, effort: 6 }).toBuffer();
  }
  return { out, paper, meta };
}

const { out, paper, meta } = await build();
const keepAspect = ((U.keep.x1 - U.keep.x0) * meta.width) / meta.height;
console.log(`title painting ${meta.width}x${meta.height} (aspect ${(meta.width / meta.height).toFixed(4)}); paper tone ${hex(paper)}`);
console.log(`keep zone x ${U.keep.x0} to ${U.keep.x1}: aspect ${keepAspect.toFixed(4)}, centred at ${(((U.keep.x0 + U.keep.x1) / 2) * 100).toFixed(1)}%`);
for (const [name, buf] of Object.entries(out)) {
  const m = await sharp(buf).metadata();
  console.log(`${name.padEnd(16)} ${String(buf.length).padStart(7)} B  ${m.width}x${m.height}`);
  if (!process.argv.includes('--stats')) fs.writeFileSync(path.join(OUT, name), buf);
}
