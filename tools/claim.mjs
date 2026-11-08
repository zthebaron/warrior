#!/usr/bin/env node
// Claim ledger. Append-only JSONL at state/CLAIMS.jsonl.
//
// Why this exists: three times on this build two sessions did the same work in parallel — the
// three-way H4 race, a duplicated prompt-pack close-out, and duplicated B-12/B-13. Nothing marked
// an item as taken until the first commit appeared, which is *after* the work was done.
//
//   node tools/claim.mjs take B-8 --agent kit [--ttl 90]
//   node tools/claim.mjs release B-8
//   node tools/claim.mjs list
//
// `take` exits 1 and names the holder if an unexpired claim exists. Expired claims are ignored, so
// a dead session cannot block an item forever.
import { readFileSync, appendFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LEDGER = join(ROOT, 'state/CLAIMS.jsonl');
const DEFAULT_TTL_MIN = 90;

const read = () => {
  if (!existsSync(LEDGER)) return [];
  return readFileSync(LEDGER, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l, i) => {
      try { return JSON.parse(l); } catch { throw new Error(`state/CLAIMS.jsonl line ${i + 1} is not JSON`); }
    });
};

/** Last entry per id wins; a `released` entry clears it. */
const active = (rows, now = Date.now()) => {
  const latest = new Map();
  for (const r of rows) if (r.id && r.id !== '_init') latest.set(r.id, r);
  const out = [];
  for (const r of latest.values()) {
    if (r.released) continue;
    const ageMin = (now - Date.parse(r.ts)) / 60000;
    if (ageMin < (r.ttl_min ?? DEFAULT_TTL_MIN)) out.push({ ...r, expires_in_min: Math.round((r.ttl_min ?? DEFAULT_TTL_MIN) - ageMin) });
  }
  return out;
};

const arg = (name) => { const i = process.argv.indexOf(name); return i === -1 ? null : process.argv[i + 1]; };
const [cmd, id] = process.argv.slice(2);
const rows = read();

if (cmd === 'list') {
  const a = active(rows);
  if (!a.length) { console.log('no active claims'); process.exit(0); }
  for (const r of a) console.log(`  ${r.id.padEnd(8)} ${String(r.agent).padEnd(14)} expires in ${r.expires_in_min}m`);
  process.exit(0);
}

if (!id) { console.error('usage: claim.mjs take|release <id> --agent <name>'); process.exit(2); }

if (cmd === 'take') {
  const held = active(rows).find((r) => r.id === id);
  if (held) {
    console.error(`REFUSED  ${id} is held by "${held.agent}" for another ${held.expires_in_min}m.`);
    console.error('Pick a different item, or if that session is dead wait for the claim to expire.');
    process.exit(1);
  }
  const agent = arg('--agent');
  if (!agent) { console.error('--agent <name> is required: a claim nobody owns is not a claim'); process.exit(2); }
  const ttl = Number(arg('--ttl') ?? DEFAULT_TTL_MIN);
  appendFileSync(LEDGER, JSON.stringify({ id, agent, ts: new Date().toISOString(), ttl_min: ttl }) + '\n');
  console.log(`CLAIMED  ${id} by ${agent} for ${ttl}m. Commit the claim before you start work.`);
  process.exit(0);
}

if (cmd === 'release') {
  appendFileSync(LEDGER, JSON.stringify({ id, agent: arg('--agent') ?? 'unknown', ts: new Date().toISOString(), released: true }) + '\n');
  console.log(`RELEASED ${id}`);
  process.exit(0);
}

console.error(`unknown command "${cmd}" — expected take, release or list`);
process.exit(2);
