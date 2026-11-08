#!/usr/bin/env node
// Concept images for chapter 1 (D-009, PROMPT-CHAPTER-1). Subordinate to STYLE-BIBLE.md: where an
// image disagrees with it, the Style Bible wins and the image is regenerated.
//   FAL_KEY=... node docs/build-log/chapter-1/concepts/generate.mjs [segment-key ...]
// Reads prompts.json beside this file; writes <segment>.png and <segment>.json (request + response meta).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../../..');
const cfg = JSON.parse(readFileSync(join(HERE, 'prompts.json'), 'utf8'));
const key = process.env.FAL_KEY;
if (!key) { console.error('FAL_KEY not set'); process.exit(2); }
const refs = cfg.references.map((p) => `data:image/png;base64,${readFileSync(join(ROOT, p)).toString('base64')}`);
const which = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(cfg.segments);

await Promise.all(which.map(async (seg) => {
  const prompt = `${cfg.style}\n\n${cfg.segments[seg]}`;
  const body = { ...cfg.params, prompt, image_urls: refs };
  const t0 = Date.now();
  const r = await fetch(`https://fal.run/${cfg.model}`, { method: 'POST', headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) { console.error(`${seg}: HTTP ${r.status} ${(await r.text()).slice(0, 300)}`); process.exitCode = 1; return; }
  const out = await r.json();
  const img = out.images?.[0];
  const bytes = Buffer.from(await (await fetch(img.url)).arrayBuffer());
  writeFileSync(join(HERE, `${seg}.png`), bytes);
  writeFileSync(join(HERE, `${seg}.json`), JSON.stringify({ segment: seg, model: cfg.model, params: cfg.params, references: cfg.references, prompt, generated: new Date().toISOString(), ms: Date.now() - t0, width: img.width, height: img.height }, null, 2) + '\n');
  console.log(`${seg}: ${bytes.length} bytes in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}));
