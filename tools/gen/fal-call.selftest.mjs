#!/usr/bin/env node
// Proof that fal-call.mjs holds the cap. Runs the real script against temp ledgers with the network
// disabled (FAL_CALL_NO_NETWORK makes any fetch exit 97), so nothing here can cost money.
//
//   node tools/gen/fal-call.selftest.mjs
//
// A refusal must exit 3 AND leave the ledger byte-identical AND never reach the network.
// The one allowed case must append its `pending` row BEFORE reaching the network (exit 97).
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'fal-selftest-'));
const HEAD = '| # | time (UTC) | endpoint | for | listed price | counted | request id | status | running total |\n|---|---|---|---|---|---|---|---|---|\n';
const row = (n, listed, counted, id, status, running) => `| ${n} | 2026-11-10T00:00:00Z | fal-ai/trellis | t | $${listed} | $${counted} | ${id} | ${status} | $${running} |\n`;
const at = (amount) => HEAD + row(1, amount, amount, 'abc', 'done', amount);
let seq = 0;
const payload = (obj) => { const f = join(dir, `p${seq++}.json`); writeFileSync(f, JSON.stringify(obj)); return f; };
const TRELLIS = { image_url: 'https://example.invalid/a.png' };
const HUNYUAN_PBR = { input_image_url: 'https://example.invalid/a.png', generate_type: 'Normal', enable_pbr: true };

const cases = [
  ['missing ledger', null, 'fal-ai/trellis', TRELLIS, 3, /does not exist/],
  ['corrupt row', HEAD + '| 1 | garbage |\n', 'fal-ai/trellis', TRELLIS, 3, /cells, expected 9/],
  ['non-table junk after header', HEAD + 'hello\n', 'fal-ai/trellis', TRELLIS, 3, /not a table row/],
  ['no header at all', 'nothing here\n', 'fal-ai/trellis', TRELLIS, 3, /header not found/],
  ['running total disagrees with rows', HEAD + row(1, '5.0000', '5.0000', 'abc', 'done', '1.0000'), 'fal-ai/trellis', TRELLIS, 3, /rows sum to/],
  ['row zero-rated without being rejected', HEAD + row(1, '5.0000', '0.0000', 'abc', 'done', '0.0000'), 'fal-ai/trellis', TRELLIS, 3, /must count/],
  ['rejected row carrying a request id', HEAD + row(1, '5.0000', '0.0000', 'abc', 'rejected', '0.0000'), 'fal-ai/trellis', TRELLIS, 3, /cannot carry a request id/],
  ['unknown status', HEAD + row(1, '5.0000', '5.0000', 'abc', 'refunded', '5.0000'), 'fal-ai/trellis', TRELLIS, 3, /unknown status/],
  ['at $9.99, a 2 cent call', at('9.9900'), 'fal-ai/trellis', TRELLIS, 3, /stop line/],
  ['exactly at the $9.50 stop line', at('9.5000'), 'fal-ai/trellis', TRELLIS, 3, /stop line/],
  ['below stop line but call would cross $10.00', at('9.4800'), 'fal-ai/hunyuan3d-v3/image-to-3d', HUNYUAN_PBR, 3, /exceeds the cap/],
  ['one tick over the cap', at('9.4751'), 'fal-ai/hunyuan3d-v3/image-to-3d', HUNYUAN_PBR, 3, /exceeds the cap/],
  ['unknown endpoint', at('0.0200'), 'fal-ai/flux-pro/v1.1-ultra', { prompt: 'x' }, 3, /not in the price table/],
  ['two images in one call', at('0.0200'), 'fal-ai/nano-banana/edit', { prompt: 'x', image_urls: ['https://example.invalid/a.png'], num_images: 2 }, 3, /num_images must be 1/],
  ['a field the wrapper cannot price', at('0.0200'), 'fal-ai/hunyuan3d-v3/image-to-3d', { ...HUNYUAN_PBR, enable_safety_checker: false }, 3, /not priced/],
  ['rodin add-on', at('0.0200'), 'fal-ai/hyper3d/rodin', { input_image_urls: ['https://example.invalid/a.png'], addons: 'HighPack' }, 3, /not priced/],
  // Allowed: lands exactly on $10.00. Must write the pending row, THEN hit the (disabled) network.
  ['lands exactly on the cap: allowed, row first', at('9.4750'), 'fal-ai/hunyuan3d-v3/image-to-3d', HUNYUAN_PBR, 97, /NETWORK/, (after) => /\| 2 \| .* \| \$0\.5250 \| \$0\.5250 \| - \| pending \| \$10\.0000 \|/.test(after)],
  ['empty ledger: allowed, row first', HEAD, 'fal-ai/trellis', TRELLIS, 97, /NETWORK/, (after) => /\| 1 \| .* \| \$0\.0200 \| \$0\.0200 \| - \| pending \| \$0\.0200 \|/.test(after)],
];

const prices = [
  ['fal-ai/trellis', TRELLIS, '$0.0200'],
  ['fal-ai/hunyuan3d-v3/image-to-3d', { input_image_url: 'u' }, '$0.3750'],
  ['fal-ai/hunyuan3d-v3/image-to-3d', HUNYUAN_PBR, '$0.5250'],
  ['fal-ai/hunyuan3d-v3/image-to-3d', { ...HUNYUAN_PBR, back_image_url: 'u' }, '$0.6750'],
  ['fal-ai/hunyuan3d-v3/image-to-3d', { ...HUNYUAN_PBR, back_image_url: 'u', face_count: 500000 }, '$0.8250'],
  ['fal-ai/hunyuan3d-v3/image-to-3d', { input_image_url: 'u', generate_type: 'Geometry' }, '$0.2250'],
  ['fal-ai/nano-banana/edit', { prompt: 'x', image_urls: ['u'] }, '$0.0398'],
  ['fal-ai/hyper3d/rodin', { input_image_urls: ['u'] }, '$0.4000'],
  ['fal-ai/meshy/rigging', { model_url: 'u' }, '$0.8000'],
];

let failed = 0;
const env = { ...process.env, FAL_CALL_NO_NETWORK: '1', FAL_KEY: 'selftest-not-a-key' };
const run = (a) => spawnSync(process.execPath, [join(HERE, 'fal-call.mjs'), ...a], { env, encoding: 'utf8' });

for (const [name, ledgerText, endpoint, body, wantExit, wantErr, afterCheck] of cases) {
  const ledger = join(dir, `ledger${seq++}.md`);
  if (ledgerText !== null) writeFileSync(ledger, ledgerText);
  const r = run(['call', endpoint, '--input', payload(body), '--for', 'selftest', '--out', dir, '--ledger', ledger]);
  const after = existsSync(ledger) ? readFileSync(ledger, 'utf8') : null;
  const unchanged = after === ledgerText;
  const ok = r.status === wantExit && wantErr.test(r.stderr) && (wantExit === 3 ? unchanged && !/NETWORK/.test(r.stderr) : afterCheck(after));
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}  (exit ${r.status}${wantExit === 3 ? ', ledger ' + (unchanged ? 'untouched' : 'CHANGED') : ''})${ok ? '' : '\n      ' + r.stderr.trim()}`);
}
for (const [endpoint, body, want] of prices) {
  const r = run(['price', endpoint, '--input', payload(body)]);
  const ok = r.status === 0 && r.stdout.includes(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  price ${endpoint} ${JSON.stringify(Object.keys(body))} = ${want}${ok ? '' : '  got: ' + r.stdout.trim() + r.stderr.trim()}`);
}
console.log(failed ? `\n${failed} FAILED` : `\nall ${cases.length + prices.length} passed; no network was reached by any refused call`);
process.exit(failed ? 1 : 0);
