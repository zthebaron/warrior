#!/usr/bin/env node
// Cuts every generated backdrop painting into its delivered card.
//
//   node tools/gen/build-backdrop.mjs [name ...]
//
// Reads assets/build/gen/bd/<name>.2k.png (the untouched download, git-ignored; re-fetch any of
// them for free with `fal-call.mjs fetch <request id>`, the ids are in assets/backdrop/gen/raw/),
// and writes assets/backdrop/gen/<name>.png at 2048 px on the long side, cut the way CARDS says
// (make-backdrop-payloads.mjs), plus assets/backdrop/gen/cards.json with what the cutter measured.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CARDS } from './make-backdrop-payloads.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = join(ROOT, 'assets/build/gen/bd'), OUT = join(ROOT, 'assets/backdrop/gen');
mkdirSync(join(OUT, 'raw'), { recursive: true });
mkdirSync(join(SRC, 'cut'), { recursive: true });
const only = process.argv.slice(2);
const index = existsSync(join(OUT, 'cards.json')) ? JSON.parse(readFileSync(join(OUT, 'cards.json'), 'utf8')) : {};
let failed = 0;
for (const [name, card] of Object.entries(CARDS)) {
  if (only.length && !only.includes(name)) continue;
  const src = join(SRC, `${name}.2k.png`);
  if (!existsSync(src)) { console.log(`skip ${name}: no download at assets/build/gen/bd/${name}.2k.png`); continue; }
  const stats = join(SRC, 'cut', `${name}.stats.json`);
  const r = spawnSync(process.execPath, [join(ROOT, 'tools/gen/cut-paper.mjs'), src, join(OUT, `${name}.png`), '--cut', card.cut, '--stats', stats, ...(card.floor ? ['--floor', card.floor] : [])], { encoding: 'utf8' });
  process.stdout.write(r.stdout); process.stderr.write(r.stderr);
  if (r.status !== 0) { failed++; continue; }
  const rec = join(SRC, `${name}.2k.result.json`);
  let requestId = null;
  if (existsSync(rec)) { copyFileSync(rec, join(OUT, 'raw', `${name}.result.json`)); requestId = JSON.parse(readFileSync(rec, 'utf8')).request_id; }
  index[name] = { file: `${name}.png`, what: card.what, cut: card.cut, request_id: requestId, ...JSON.parse(readFileSync(stats, 'utf8')) };
}
writeFileSync(join(OUT, 'cards.json'), JSON.stringify(index, null, 1) + '\n');
process.exit(failed ? 1 : 0);
