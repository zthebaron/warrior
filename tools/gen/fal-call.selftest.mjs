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
const ANIM10 = { model_url: 'https://example.invalid/a.glb', animation_action_ids: [243, 466, 503, 470, 644, 448, 482, 435, 478, 492] };

const SFX = { text: 'a short whoosh', duration_seconds: 1 };
const MUSIC = { prompt: 'solo bamboo flute over rain', seconds_total: 95 };

const cases = [
  ['missing ledger', null, 'fal-ai/trellis', TRELLIS, 3, /does not exist/],
  ['corrupt row', HEAD + '| 1 | garbage |\n', 'fal-ai/trellis', TRELLIS, 3, /cells, expected 9/],
  ['non-table junk after header', HEAD + 'hello\n', 'fal-ai/trellis', TRELLIS, 3, /not a table row/],
  ['no header at all', 'nothing here\n', 'fal-ai/trellis', TRELLIS, 3, /header not found/],
  ['running total disagrees with rows', HEAD + row(1, '5.0000', '5.0000', 'abc', 'done', '1.0000'), 'fal-ai/trellis', TRELLIS, 3, /rows sum to/],
  ['row zero-rated without being rejected', HEAD + row(1, '5.0000', '0.0000', 'abc', 'done', '0.0000'), 'fal-ai/trellis', TRELLIS, 3, /must count/],
  ['rejected row carrying a request id', HEAD + row(1, '5.0000', '0.0000', 'abc', 'rejected', '0.0000'), 'fal-ai/trellis', TRELLIS, 3, /cannot carry a request id/],
  ['unknown status', HEAD + row(1, '5.0000', '5.0000', 'abc', 'refunded', '5.0000'), 'fal-ai/trellis', TRELLIS, 3, /unknown status/],
  // The cap is $20.00 in total and the stop line $19.50 (raised by Tim, 11:29 am PST 2026-11-10).
  ['at $19.99, a 2 cent call', at('19.9900'), 'fal-ai/trellis', TRELLIS, 3, /stop line/],
  ['exactly at the $19.50 stop line', at('19.5000'), 'fal-ai/trellis', TRELLIS, 3, /stop line/],
  ['below stop line but call would cross $20.00', at('19.4800'), 'fal-ai/hunyuan3d-v3/image-to-3d', HUNYUAN_PBR, 3, /exceeds the cap/],
  ['one tick over the cap', at('19.4751'), 'fal-ai/hunyuan3d-v3/image-to-3d', HUNYUAN_PBR, 3, /exceeds the cap/],
  ['the 10-clip animation call would cross $20.00', at('18.0001'), 'fal-ai/meshy/rigging/multi-animation', ANIM10, 3, /exceeds the cap/],
  ['animation call with no clips', at('0.0200'), 'fal-ai/meshy/rigging/multi-animation', { model_url: 'u', animation_action_ids: [] }, 3, /1 to 10 ids/],
  ['animation call with 11 clips', at('0.0200'), 'fal-ai/meshy/rigging/multi-animation', { model_url: 'u', animation_action_ids: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }, 3, /1 to 10 ids/],
  ['animation call with a repeated clip', at('0.0200'), 'fal-ai/meshy/rigging/multi-animation', { model_url: 'u', animation_action_ids: [5, 5] }, 3, /must be distinct/],
  ['animation call with an id outside the library', at('0.0200'), 'fal-ai/meshy/rigging/multi-animation', { model_url: 'u', animation_action_ids: [697] }, 3, /0\.\.696/],
  ['4K image', at('0.0200'), 'fal-ai/nano-banana-2', { prompt: 'x', resolution: '4K' }, 3, /1K or 2K/],
  ['image call with web search', at('0.0200'), 'fal-ai/nano-banana-2', { prompt: 'x', enable_web_search: true }, 3, /not priced/],
  ['unknown endpoint', at('0.0200'), 'fal-ai/flux-pro/v1.1-ultra', { prompt: 'x' }, 3, /not in the price table/],
  ['two images in one call', at('0.0200'), 'fal-ai/nano-banana/edit', { prompt: 'x', image_urls: ['https://example.invalid/a.png'], num_images: 2 }, 3, /num_images must be 1/],
  ['a field the wrapper cannot price', at('0.0200'), 'fal-ai/hunyuan3d-v3/image-to-3d', { ...HUNYUAN_PBR, enable_safety_checker: false }, 3, /not priced/],
  // D-022 audio: a length the model would choose is a charge the model would choose, so it is refused
  ['sound effect with no duration', at('0.0200'), 'fal-ai/elevenlabs/sound-effects/v3', { text: 'x' }, 3, /duration_seconds must be given/],
  ['sound effect longer than 30 s', at('0.0200'), 'fal-ai/elevenlabs/sound-effects/v3', { text: 'x', duration_seconds: 31 }, 3, /duration_seconds must be given/],
  ['sound effect under the other id', at('0.0200'), 'elevenlabs/sound-effects/v3', SFX, 3, /not in the price table/],
  ['music with no length', at('0.0200'), 'fal-ai/stable-audio-25/text-to-audio', { prompt: 'x' }, 3, /seconds_total must be given/],
  ['music with a field the wrapper cannot price', at('0.0200'), 'fal-ai/stable-audio-25/text-to-audio', { ...MUSIC, sync_mode: true }, 3, /not priced/],
  // --max-total: a task's own ceiling, under the cap
  ['over the task ceiling by one tick', at('15.4001'), 'fal-ai/stable-audio-25/text-to-audio', MUSIC, 3, /this task's ceiling \$15\.6000/, undefined, ['--max-total', '15.60']],
  ['a task ceiling cannot raise the cap', at('19.4800'), 'fal-ai/hunyuan3d-v3/image-to-3d', HUNYUAN_PBR, 3, /exceeds the cap/, undefined, ['--max-total', '50']],
  ['a task ceiling that is not a number', at('0.0200'), 'fal-ai/trellis', TRELLIS, 2, /--max-total takes dollars/, undefined, ['--max-total', 'four']],
  ['lands exactly on the task ceiling: allowed, row first', at('15.4000'), 'fal-ai/stable-audio-25/text-to-audio', MUSIC, 97, /NETWORK/, (after) => /\| 2 \| .* \| \$0\.2000 \| \$0\.2000 \| - \| pending \| \$15\.6000 \|/.test(after), ['--max-total', '15.60']],
  ['rodin add-on', at('0.0200'), 'fal-ai/hyper3d/rodin', { input_image_urls: ['https://example.invalid/a.png'], addons: 'HighPack' }, 3, /not priced/],
  // Allowed: lands exactly on $20.00. Must write the pending row, THEN hit the (disabled) network.
  ['lands exactly on the cap: allowed, row first', at('19.4750'), 'fal-ai/hunyuan3d-v3/image-to-3d', HUNYUAN_PBR, 97, /NETWORK/, (after) => /\| 2 \| .* \| \$0\.5250 \| \$0\.5250 \| - \| pending \| \$20\.0000 \|/.test(after)],
  // The raise took effect: past the old $10.00 cap a call is allowed again, row first.
  ['past the old $10.00 cap: allowed, row first', at('10.0000'), 'fal-ai/trellis', TRELLIS, 97, /NETWORK/, (after) => /\| 2 \| .* \| \$0\.0200 \| \$0\.0200 \| - \| pending \| \$10\.0200 \|/.test(after)],
  ['10-clip animation call lands exactly on the cap: allowed, row first', at('18.0000'), 'fal-ai/meshy/rigging/multi-animation', ANIM10, 97, /NETWORK/, (after) => /\| 2 \| .* \| \$2\.0000 \| \$2\.0000 \| - \| pending \| \$20\.0000 \|/.test(after)],
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
  ['fal-ai/meshy/rigging/multi-animation', ANIM10, '$2.0000'],
  ['fal-ai/meshy/rigging/multi-animation', { model_url: 'u', animation_action_ids: [0, 92, 466] }, '$1.1600'],
  ['fal-ai/nano-banana', { prompt: 'x' }, '$0.0398'],
  ['fal-ai/nano-banana-2', { prompt: 'x' }, '$0.0800'],
  ['fal-ai/nano-banana-2', { prompt: 'x', resolution: '2K' }, '$0.1200'],
  ['fal-ai/nano-banana-2/edit', { prompt: 'x', image_urls: ['u'], resolution: '2K' }, '$0.1200'],
  ['fal-ai/elevenlabs/sound-effects/v3', SFX, '$0.0020'],
  ['fal-ai/elevenlabs/sound-effects/v3', { text: 'x', duration_seconds: 0.5 }, '$0.0020'],
  ['fal-ai/elevenlabs/sound-effects/v3', { text: 'x', duration_seconds: 1.2, prompt_influence: 0.6 }, '$0.0040'],
  ['fal-ai/elevenlabs/sound-effects/v3', { text: 'x', duration_seconds: 30, loop: true }, '$0.0600'],
  ['fal-ai/stable-audio-25/text-to-audio', MUSIC, '$0.2000'],
  ['fal-ai/stable-audio-25/text-to-audio', { prompt: 'x', seconds_total: 190, seed: 7 }, '$0.2000'],
];

let failed = 0;
const env = { ...process.env, FAL_CALL_NO_NETWORK: '1', FAL_KEY: 'selftest-not-a-key' };
const run = (a) => spawnSync(process.execPath, [join(HERE, 'fal-call.mjs'), ...a], { env, encoding: 'utf8' });

for (const [name, ledgerText, endpoint, body, wantExit, wantErr, afterCheck, extra = []] of cases) {
  const ledger = join(dir, `ledger${seq++}.md`);
  if (ledgerText !== null) writeFileSync(ledger, ledgerText);
  const r = run(['call', endpoint, '--input', payload(body), '--for', 'selftest', '--out', dir, '--ledger', ledger, ...extra]);
  const after = existsSync(ledger) ? readFileSync(ledger, 'utf8') : null;
  const unchanged = after === ledgerText;
  const ok = r.status === wantExit && wantErr.test(r.stderr) && (wantExit === 97 ? afterCheck(after) : unchanged && !/NETWORK/.test(r.stderr));
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}  (exit ${r.status}${wantExit !== 97 ? ', ledger ' + (unchanged ? 'untouched' : 'CHANGED') : ''})${ok ? '' : '\n      ' + r.stderr.trim()}`);
}
for (const [endpoint, body, want] of prices) {
  const r = run(['price', endpoint, '--input', payload(body)]);
  const ok = r.status === 0 && r.stdout.includes(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  price ${endpoint} ${JSON.stringify(Object.keys(body))} = ${want}${ok ? '' : '  got: ' + r.stdout.trim() + r.stderr.trim()}`);
}
console.log(failed ? `\n${failed} FAILED` : `\nall ${cases.length + prices.length} passed; no network was reached by any refused call`);
process.exit(failed ? 1 : 0);
