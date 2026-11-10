#!/usr/bin/env node
// The ONE door to fal.ai. Every paid call goes through here, and this script — not the caller's
// intention — is what holds the $10.00 cap (00-start-here/PROMPT-ART-GEN.md, "Rules for the money").
//
//   node tools/gen/fal-call.mjs init                      create state/FAL-LEDGER.md (once)
//   node tools/gen/fal-call.mjs total                     print committed total and headroom
//   node tools/gen/fal-call.mjs price <endpoint> --input <payload.json>
//   node tools/gen/fal-call.mjs call  <endpoint> --input <payload.json> --for "<purpose>" --out <dir> [--name <stem>]
//   node tools/gen/fal-call.mjs fetch <request_id> --out <dir> [--name <stem>]    re-download, never re-pay
//
// How the cap holds:
//   * The price is computed HERE from the payload, against a table of prices read off fal's model
//     pages. The caller cannot supply a price. An endpoint that is not in the table is refused.
//   * Before any network I/O the ledger is parsed and re-summed. If the ledger is missing, has a
//     row that does not parse, or its running-total column disagrees with the re-sum, the call is
//     refused: an unreadable ledger is treated as a full one.
//   * committed + price > CAP          -> refused.
//   * committed >= STOP (the $9.50 line) -> refused, whatever the price.
//   * The ledger row is appended as `pending` BEFORE the submit request leaves, under a lock, so a
//     crash at any later point still shows the charge. The request id is filled in after submit.
//   * A row is only ever zero-rated if fal answered the submit with a non-2xx status (it never
//     accepted the job, so there is nothing to bill). Everything else counts in full: accepted,
//     failed mid-run, timed out, or unknown because the connection dropped.
//   * One submit per invocation, no retry. A poll timeout is recovered with `fetch <request_id>`,
//     which reads the ledger for the request's URLs and cannot create a charge.
//   * Money is integer ticks of $0.0001. $0.525 and $0.0398 are not representable in cents.
//
// FAL_KEY comes from the environment or from .env. It is sent in the Authorization header only,
// only to hosts on the allowlist below, and is scrubbed from anything this script prints.
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, openSync, closeSync, unlinkSync, statSync } from 'node:fs';
import { join, dirname, basename, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TICKS = 10000;                 // ticks per dollar
const CAP = 10 * TICKS;              // $10.00, absolute (Tim, PROMPT-ART-GEN.md)
const STOP = 9.5 * TICKS;            // $9.50: no new call starts at or past this line
const EXIT_REFUSED = 3;
const EXIT_REMOTE = 4;

// ---- price table -------------------------------------------------------------------------------
// Figures read from each model page on 2026-11-10 (and cross-checked against
// api.fal.ai/v1/models/pricing). Each entry validates the payload and returns ticks, or throws.
const only = (p, allowed) => {
  const extra = Object.keys(p).filter((k) => !allowed.includes(k));
  if (extra.length) throw new Error(`payload field(s) not priced by this wrapper: ${extra.join(', ')}`);
};
const PRICES = {
  // "$0.02 / generation"
  'fal-ai/trellis': (p) => {
    only(p, ['image_url', 'seed', 'texture_size', 'mesh_simplify', 'ss_guidance_strength', 'ss_sampling_steps', 'slat_guidance_strength', 'slat_sampling_steps']);
    return 200;
  },
  // Page and pricing API both say 0.02 but neither names the unit. Charged per input image,
  // which is the larger reading.
  'fal-ai/trellis/multi': (p) => {
    only(p, ['image_urls', 'seed', 'texture_size', 'mesh_simplify', 'multiimage_algo', 'ss_guidance_strength', 'ss_sampling_steps', 'slat_guidance_strength', 'slat_sampling_steps']);
    if (!Array.isArray(p.image_urls) || p.image_urls.length < 1 || p.image_urls.length > 4) throw new Error('image_urls must be an array of 1 to 4 images');
    return 200 * p.image_urls.length;
  },
  // "$0.225 Geometry, $0.375 Normal, $0.45 LowPoly. PBR materials, multi-view images, and a custom
  // face count each add $0.15."
  'fal-ai/hunyuan3d-v3/image-to-3d': (p) => {
    only(p, ['input_image_url', 'back_image_url', 'left_image_url', 'right_image_url', 'generate_type', 'enable_pbr', 'face_count', 'polygon_type']);
    const type = p.generate_type ?? 'Normal';
    const base = { Geometry: 2250, Normal: 3750, LowPoly: 4500 }[type];
    if (base === undefined) throw new Error(`unknown generate_type "${type}"`);
    let t = base;
    if (p.enable_pbr === true) t += 1500;                       // charged even if Geometry ignores it
    else if (p.enable_pbr !== undefined && p.enable_pbr !== false) throw new Error('enable_pbr must be a boolean');
    if (p.back_image_url || p.left_image_url || p.right_image_url) t += 1500;
    if ('face_count' in p) t += 1500;                           // any explicit face_count is priced as custom
    return t;
  },
  // "$0.40 per generation; HighPack add-on 3x". Add-ons are refused rather than priced.
  'fal-ai/hyper3d/rodin': (p) => {
    only(p, ['input_image_urls', 'prompt', 'geometry_file_format', 'material', 'quality', 'tier', 'seed', 'condition_mode', 'use_hyper', 'TAPose', 'bbox_condition']);
    return 4000;
  },
  // "Each image costs $0.0398." One image per call, always.
  'fal-ai/nano-banana/edit': (p) => {
    only(p, ['prompt', 'image_urls', 'num_images', 'output_format', 'aspect_ratio', 'seed']);
    if ((p.num_images ?? 1) !== 1) throw new Error('num_images must be 1');
    return 398;
  },
  'fal-ai/nano-banana': (p) => {
    only(p, ['prompt', 'num_images', 'output_format', 'aspect_ratio', 'seed']);
    if ((p.num_images ?? 1) !== 1) throw new Error('num_images must be 1');
    return 398;
  },
  // The page says "$0.20 per request, +$0.12 when enable_animation=true"; the pricing API says
  // 0.80 per generation. The two disagree, so the cap is charged the larger figure.
  'fal-ai/meshy/rigging': (p) => {
    only(p, ['model_url', 'height_meters', 'enable_animation', 'animation_action_id']);
    return 8000 + (p.enable_animation === true ? 1200 : 0);
  },
};

// ---- small helpers -----------------------------------------------------------------------------
const usd = (t) => '$' + (t / TICKS).toFixed(4);
const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i === -1 ? null : args[i + 1]; };
const LEDGER = resolve(flag('--ledger') ?? join(ROOT, 'state/FAL-LEDGER.md'));
const LOCK = LEDGER + '.lock';

let KEY = null;
const scrub = (s) => (KEY ? String(s).split(KEY).join('[FAL_KEY]') : String(s));
const refuse = (msg) => { console.error('REFUSED  ' + scrub(msg)); process.exit(EXIT_REFUSED); };
const die = (msg, code = EXIT_REMOTE) => { console.error('ERROR    ' + scrub(msg)); process.exit(code); };

const loadKey = () => {
  if (process.env.FAL_KEY) return process.env.FAL_KEY.trim();
  for (const f of [join(ROOT, '.env'), join(homedir(), 'Code/warrior/.env')]) {
    if (!existsSync(f)) continue;
    const line = readFileSync(f, 'utf8').split('\n').find((l) => l.startsWith('FAL_KEY='));
    if (line) return line.slice('FAL_KEY='.length).trim().replace(/^["']|["']$/g, '');
  }
  return null;
};

const KEY_HOSTS = new Set(['queue.fal.run', 'rest.alpha.fal.ai']);
const net = async (url, init = {}, withKey = false) => {
  if (process.env.FAL_CALL_NO_NETWORK) { console.error('NETWORK  attempted with FAL_CALL_NO_NETWORK set: ' + new URL(url).host); process.exit(97); }
  const headers = { ...(init.headers ?? {}) };
  if (withKey) {
    if (!KEY_HOSTS.has(new URL(url).host) || !url.startsWith('https://')) die(`will not send the key to ${new URL(url).host}`);
    headers.Authorization = `Key ${KEY}`;
  }
  return fetch(url, { ...init, headers });
};

// ---- ledger ------------------------------------------------------------------------------------
const HEADER = `# fal.ai ledger

Cap **$10.00**, absolute. No new call starts at or past **$9.50**. Written by \`tools/gen/fal-call.mjs\`
only: the row is appended as \`pending\` before the request is sent, so a crash cannot hide a charge.

Every row counts toward the total at its listed price, with one exception: \`rejected\` means fal
answered the submit with a non-2xx status and never accepted the job, so it is listed at its price
but counted as $0.0000. \`failed\`, \`pending\` and \`unknown\` rows count in full.

| # | time (UTC) | endpoint | for | listed price | counted | request id | status | running total |
|---|---|---|---|---|---|---|---|---|
`;
const STATUSES = new Set(['pending', 'submitted', 'done', 'failed', 'unknown', 'rejected']);
const money = (s) => { const m = /^\$(\d+)\.(\d{4})$/.exec(s); if (!m) throw new Error(`bad money "${s}"`); return Number(m[1]) * TICKS + Number(m[2]); };

/** Parse and re-sum. Throws on anything it does not fully understand. */
const readLedger = () => {
  if (!existsSync(LEDGER)) throw new Error(`ledger ${LEDGER} does not exist (run \`init\` once)`);
  const text = readFileSync(LEDGER, 'utf8');
  const lines = text.split('\n');
  const head = lines.findIndex((l) => l.startsWith('| # | time (UTC) | endpoint |'));
  if (head === -1 || !/^\|(-+\|)+$/.test(lines[head + 1] ?? '')) throw new Error('ledger table header not found');
  const rows = [];
  let total = 0;
  for (let i = head + 2; i < lines.length; i++) {
    const l = lines[i];
    if (l.trim() === '') continue;
    if (!l.startsWith('|')) throw new Error(`ledger line ${i + 1} is not a table row`);
    const c = l.split('|').slice(1, -1).map((x) => x.trim());
    if (c.length !== 9) throw new Error(`ledger line ${i + 1} has ${c.length} cells, expected 9`);
    const [n, time, endpoint, purpose, listed, counted, requestId, status, running] = c;
    if (Number(n) !== rows.length + 1) throw new Error(`ledger line ${i + 1}: row number ${n}, expected ${rows.length + 1}`);
    if (!STATUSES.has(status)) throw new Error(`ledger line ${i + 1}: unknown status "${status}"`);
    const listedT = money(listed), countedT = money(counted), runningT = money(running);
    const expectCounted = status === 'rejected' ? 0 : listedT;
    if (countedT !== expectCounted) throw new Error(`ledger line ${i + 1}: counted ${counted} but status "${status}" at ${listed} must count ${usd(expectCounted)}`);
    if (status === 'rejected' && requestId !== '-') throw new Error(`ledger line ${i + 1}: a rejected row cannot carry a request id`);
    total += countedT;
    if (runningT !== total) throw new Error(`ledger line ${i + 1}: running total ${running} but rows sum to ${usd(total)}`);
    rows.push({ line: i, n: Number(n), time, endpoint, purpose, listedT, countedT, requestId, status });
  }
  return { lines, rows, total };
};

const fmtRow = (r, running) => `| ${r.n} | ${r.time} | ${r.endpoint} | ${r.purpose} | ${usd(r.listedT)} | ${usd(r.countedT)} | ${r.requestId} | ${r.status} | ${usd(running)} |`;

/** Rewrite one row in place (request id / status). Re-derives every running total.
 *  Takes the same lock as the append: a rewrite racing an append would drop the appended row. */
const updateRow = (n, patch) => {
  let fd = null;
  for (let i = 0; i < 100 && fd === null; i++) {
    try { fd = openSync(LOCK, 'wx'); } catch { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100); }
  }
  if (fd === null) throw new Error(`could not take ${LOCK} to update row ${n}; the row is still in the ledger and still counted`);
  try { updateRowLocked(n, patch); } finally { closeSync(fd); unlinkSync(LOCK); }
};
const updateRowLocked = (n, patch) => {
  const { lines, rows } = readLedger();
  const row = rows.find((r) => r.n === n);
  if (!row) throw new Error(`ledger row ${n} not found`);
  Object.assign(row, patch);
  row.countedT = row.status === 'rejected' ? 0 : row.listedT;
  let run = 0;
  for (const r of rows) { run += r.countedT; lines[r.line] = fmtRow(r, run); }
  writeFileSync(LEDGER, lines.join('\n'));
};

const withLock = (fn) => {
  let fd;
  try { fd = openSync(LOCK, 'wx'); } catch {
    const age = existsSync(LOCK) ? (Date.now() - statSync(LOCK).mtimeMs) / 1000 : 0;
    refuse(`ledger is locked by another fal-call (${LOCK}, ${age.toFixed(0)}s old). One paid call at a time.`);
  }
  try { return fn(); } finally { closeSync(fd); unlinkSync(LOCK); }
};

// ---- payload -----------------------------------------------------------------------------------
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.glb': 'model/gltf-binary' };
/** Free. Uploads a local file to fal storage and returns its URL. */
const upload = async (path) => {
  const abs = resolve(ROOT, path);
  if (!existsSync(abs)) die(`upload: ${path} does not exist`, 2);
  const type = MIME[extname(abs).toLowerCase()];
  if (!type) die(`upload: no content type for ${path}`, 2);
  const init = await net('https://rest.alpha.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content_type: type, file_name: basename(abs) }),
  }, true);
  if (!init.ok) die(`upload initiate ${init.status}: ${(await init.text()).slice(0, 300)}`);
  const { upload_url: put, file_url: url } = await init.json();
  const res = await net(put, { method: 'PUT', headers: { 'Content-Type': type }, body: readFileSync(abs) });
  if (!res.ok) die(`upload PUT ${res.status}`);
  return url;
};
/** Replace every "file:<repo-relative path>" string in the payload with an uploaded URL. */
const resolveFiles = async (v) => {
  if (typeof v === 'string' && v.startsWith('file:')) return upload(v.slice(5));
  if (Array.isArray(v)) { const out = []; for (const x of v) out.push(await resolveFiles(x)); return out; }
  if (v && typeof v === 'object') { const out = {}; for (const [k, x] of Object.entries(v)) out[k] = await resolveFiles(x); return out; }
  return v;
};

const priceOf = (endpoint, payload) => {
  const fn = PRICES[endpoint];
  if (!fn) refuse(`endpoint "${endpoint}" is not in the price table. Read its model page, add it to PRICES, then call.`);
  try { return fn(payload); } catch (e) { refuse(`${endpoint}: ${e.message}`); }
};

const readPayload = () => {
  const f = flag('--input');
  if (!f) die('--input <payload.json> is required', 2);
  let p;
  try { p = JSON.parse(readFileSync(resolve(f), 'utf8')); } catch (e) { die(`cannot read payload ${f}: ${e.message}`, 2); }
  if (!p || typeof p !== 'object' || Array.isArray(p)) die('payload must be a JSON object', 2);
  return p;
};

// ---- results -----------------------------------------------------------------------------------
const collectFiles = (v, path = [], out = []) => {
  if (Array.isArray(v)) v.forEach((x, i) => collectFiles(x, [...path, String(i)], out));
  else if (v && typeof v === 'object') {
    if (typeof v.url === 'string' && /^https:\/\//.test(v.url)) out.push({ key: path.join('.'), url: v.url, name: v.file_name });
    else for (const [k, x] of Object.entries(v)) collectFiles(x, [...path, k], out);
  } else if (typeof v === 'string' && /^https:\/\/.+\.(glb|fbx|obj|png|jpe?g|webp|zip|usdz)(\?|$)/i.test(v)) out.push({ key: path.join('.'), url: v });
  return out;
};
const saveResult = async (result, requestId, outDir, stem) => {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `${stem}.result.json`), JSON.stringify({ request_id: requestId, result }, null, 2));
  const files = collectFiles(result);
  const saved = [];
  for (const f of files) {
    const ext = (extname(new URL(f.url).pathname) || '.bin').toLowerCase();
    const dest = join(outDir, `${stem}${files.length > 1 ? '.' + f.key.replace(/[^a-z0-9]+/gi, '_') : ''}${ext}`);
    const r = await net(f.url);
    if (!r.ok) { console.error(`  download ${f.key} failed: ${r.status}`); continue; }
    writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
    saved.push(dest);
    console.log(`  saved ${dest}`);
  }
  return saved;
};

const poll = async (statusUrl, responseUrl, timeoutS) => {
  const t0 = Date.now();
  for (;;) {
    const r = await net(statusUrl, {}, true);
    const s = r.ok ? await r.json() : { status: `HTTP_${r.status}` };
    if (s.status === 'COMPLETED') break;
    if (s.status !== 'IN_QUEUE' && s.status !== 'IN_PROGRESS') return { ok: false, why: `status ${s.status}: ${JSON.stringify(s).slice(0, 300)}` };
    if ((Date.now() - t0) / 1000 > timeoutS) return { ok: false, timeout: true, why: `still ${s.status} after ${timeoutS}s` };
    await new Promise((res) => setTimeout(res, 4000));
  }
  const r = await net(responseUrl, {}, true);
  const body = await r.text();
  if (!r.ok) return { ok: false, why: `result ${r.status}: ${body.slice(0, 500)}` };
  return { ok: true, result: JSON.parse(body) };
};

// ---- commands ----------------------------------------------------------------------------------
const cmd = args[0];

if (cmd === 'init') {
  if (existsSync(LEDGER)) refuse(`${LEDGER} already exists; init never overwrites a ledger`);
  mkdirSync(dirname(LEDGER), { recursive: true });
  writeFileSync(LEDGER, HEADER);
  console.log(`created ${LEDGER}`);
  process.exit(0);
}

if (cmd === 'total') {
  let l; try { l = readLedger(); } catch (e) { refuse(e.message); }
  console.log(`committed ${usd(l.total)} of ${usd(CAP)} in ${l.rows.length} row(s); headroom ${usd(CAP - l.total)}; stop line ${usd(STOP)} ${l.total >= STOP ? 'REACHED' : 'not reached'}`);
  process.exit(0);
}

if (cmd === 'price') {
  const endpoint = args[1];
  console.log(`${endpoint}: ${usd(priceOf(endpoint, readPayload()))}`);
  process.exit(0);
}

if (cmd === 'call') {
  const endpoint = args[1];
  const purpose = (flag('--for') ?? '').replace(/[|\n\r]/g, ' ').trim();
  const outDir = flag('--out');
  if (!endpoint || !purpose || !outDir) die('usage: call <endpoint> --input <payload.json> --for "<purpose>" --out <dir> [--name <stem>]', 2);
  const payload = readPayload();

  // 1. Price and cap. No network has happened yet.
  const price = priceOf(endpoint, payload);
  let before; try { before = readLedger(); } catch (e) { refuse(e.message); }
  const check = (total) => {
    if (total >= STOP) refuse(`committed ${usd(total)} is at or past the stop line ${usd(STOP)}. No further calls.`);
    if (total + price > CAP) refuse(`${endpoint} costs ${usd(price)}; committed ${usd(total)} + that = ${usd(total + price)} exceeds the cap ${usd(CAP)}.`);
  };
  check(before.total);

  KEY = loadKey();
  if (!KEY) refuse('FAL_KEY not found in the environment or .env');

  // 2. Free: turn local files into URLs.
  const body = await resolveFiles(payload);

  // 3. Under the lock: re-read, re-check, append the pending row. Only then may the submit leave.
  const n = withLock(() => {
    let l; try { l = readLedger(); } catch (e) { refuse(e.message); }
    check(l.total);
    const row = { n: l.rows.length + 1, time: new Date().toISOString().replace(/\.\d+Z$/, 'Z'), endpoint, purpose, listedT: price, countedT: price, requestId: '-', status: 'pending' };
    appendFileSync(LEDGER, fmtRow(row, l.total + price) + '\n');
    return row.n;
  });
  console.log(`ledger row ${n}: ${endpoint} ${usd(price)} (committed ${usd(before.total + price)} of ${usd(CAP)})`);

  // 4. Submit once. No retry.
  let sub;
  try {
    sub = await net(`https://queue.fal.run/${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, true);
  } catch (e) {
    updateRow(n, { status: 'unknown' });
    die(`submit did not complete (${e.message}). Row ${n} stays counted: the request may have been accepted.`);
  }
  if (!sub.ok) {
    const text = (await sub.text()).slice(0, 600);
    updateRow(n, { status: 'rejected' });
    die(`submit rejected with HTTP ${sub.status}, nothing was queued; row ${n} zero-rated. ${text}`);
  }
  const { request_id: requestId, status_url: statusUrl, response_url: responseUrl } = await sub.json();
  updateRow(n, { requestId, status: 'submitted' });
  console.log(`submitted ${requestId}`);

  // 5. Wait, save.
  const res = await poll(statusUrl, responseUrl, Number(flag('--timeout') ?? 900));
  if (!res.ok) {
    if (!res.timeout) updateRow(n, { status: 'failed' });
    die(`${res.why}. Row ${n} stays counted.${res.timeout ? ` Recover with: fetch ${requestId}` : ''}`);
  }
  updateRow(n, { status: 'done' });
  await saveResult(res.result, requestId, resolve(outDir), flag('--name') ?? requestId);
  process.exit(0);
}

if (cmd === 'fetch') {
  const requestId = args[1];
  const outDir = flag('--out');
  if (!requestId || !outDir) die('usage: fetch <request_id> --out <dir> [--name <stem>]', 2);
  let l; try { l = readLedger(); } catch (e) { refuse(e.message); }
  const row = l.rows.find((r) => r.requestId === requestId);
  if (!row) refuse(`request ${requestId} is not in the ledger; fetch only re-reads calls this ledger already paid for`);
  if (!/^[0-9a-f-]{20,}$/i.test(requestId)) die('that does not look like a request id', 2);
  // fal's queue addresses a request under the app id, which is the first two path segments.
  const app = row.endpoint.split('/').slice(0, 2).join('/');
  const rec = { statusUrl: `https://queue.fal.run/${app}/requests/${requestId}/status`, responseUrl: `https://queue.fal.run/${app}/requests/${requestId}` };
  KEY = loadKey();
  if (!KEY) refuse('FAL_KEY not found in the environment or .env');
  const res = await poll(rec.statusUrl, rec.responseUrl, Number(flag('--timeout') ?? 900));
  if (!res.ok) { if (!res.timeout) updateRow(row.n, { status: 'failed' }); die(res.why); }
  updateRow(row.n, { status: 'done' });
  await saveResult(res.result, requestId, resolve(outDir), flag('--name') ?? requestId);
  process.exit(0);
}

console.error('usage: fal-call.mjs init | total | price <endpoint> --input f | call <endpoint> --input f --for "..." --out dir | fetch <request_id> --out dir');
process.exit(2);
