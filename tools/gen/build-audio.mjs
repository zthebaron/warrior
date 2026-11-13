// What the game's sound ships as (D-022), cut from the fal takes in assets/build/gen/audio/.
//
//   node tools/gen/build-audio.mjs            write assets/audio/*.mp3 and assets/audio/audio.json
//   node tools/gen/build-audio.mjs --check    measure the shipped files against LIMITS and write nothing
//   node tools/gen/build-audio.mjs --only=gate   cut only the named effects, and write their lines into the shipped
//                                               audio.json beside the others: every other shipped file is left as
//                                               it is, so only the named takes need to be downloaded (POLISH-1)
//
// Nobody building this can hear it, so every choice here is one that can be measured and is checked:
//
//   effect   one take, cut from its onset (the first sample within ONSET_DB of its own peak, less a short
//            lead-in) so the sound starts when the move does; cut to length; faded at both ends so it neither
//            clicks in nor is chopped off; its peak set to EFFECT_PEAK_DB, so no effect is far louder than
//            another before the game's own mix (src/audio/audio.ts AUDIO.gain) is applied. Mono MP3.
//   music    one take, one stretch of it [from, to); the rain-and-wind bed laid under it BED_DB below the
//            music's own level; then the end is cross-faded INTO the beginning over `cross` seconds (equal
//            power), which makes a loop whose last sample runs on into its first. The file that ships is that
//            loop with `pad` seconds of itself repeated before and after it: an MP3 decoder may add or drop a
//            few hundred samples at the start, and with the loop continued on both sides a window one loop long
//            is seamless wherever it lands. audio.json gives the game the window (loopStart, loopSeconds).
//            tools/harness/audio-check.ts decodes the shipped file in a real browser and measures the seam.
//
// Every number is in MEASUREMENTS.md "D-022 sound". Needs ffmpeg (libmp3lame) on the PATH.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stats } from './audio-stats.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = join(ROOT, 'assets/build/gen/audio');
const OUT = join(ROOT, 'assets/audio');
const RATE = 44100;

export const AUDIO_BUILD = {
  onsetDb: -18,          // an effect starts at the first sample this close to its own peak
  leadInMs: 4,           // kept before the onset, so the attack is not cut into
  fadeInMs: 2,
  effectPeakDb: -3,
  effectKbps: 96,
  // name: the take it is cut from (its ledger row is in MANIFEST.md), its length and its fade-out, in seconds
  effects: {
    jump: { take: 'double_jump.mp3', seconds: 0.4, fadeOut: 0.12 },   // both first "jump" takes were a low thump; this take is the whoosh
    land_soft: { take: 'land_soft-b.mp3', seconds: 0.4, fadeOut: 0.1 }, // the first take peaked at -38.6 dB
    land_hard: { take: 'land_hard.mp3', seconds: 0.6, fadeOut: 0.15 },
    slash: { take: 'slash.mp3', seconds: 0.58, fadeOut: 0.12 },
    dash: { take: 'dash.mp3', seconds: 0.4, fadeOut: 0.1 },            // 170 ms of silence before the whoosh, cut
    wall_grab: { take: 'wall_grab.mp3', seconds: 0.18, fadeOut: 0.06 }, // the catch itself is the last fifth of the take
    checkpoint: { take: 'checkpoint.mp3', seconds: 1.9, fadeOut: 0.5 },
    respawn: { take: 'respawn.mp3', seconds: 1.2, fadeOut: 0.2, fromStart: true }, // a swell: it has no onset to cut to
    // D-023, the fight (MEASUREMENTS "D-023 sound")
    notice: { take: 'notice.mp3', seconds: 0.4, fadeOut: 0.1 },   // the take is silent after 0.35 s
    hit: { take: 'hit-b.mp3', seconds: 0.32, fadeOut: 0.1 },      // the first take was a low thud with no steel in it; this one rings, and is silent after 0.29 s
    fell: { take: 'fell.mp3', seconds: 0.8, fadeOut: 0.2 },       // 188 ms of silence before the body lands, cut
    cut: { take: 'cut.mp3', seconds: 0.6, fadeOut: 0.15 },
    // POLISH-1 (B-98): the courtyard's far gate swinging open (MEASUREMENTS "POLISH-1 the gate's sound")
    gate: { take: 'gate-b.mp3', seconds: 2.2, fadeOut: 0.3 },  // the first take is quiet broadband rumble (-32.8 LUFS); this one creaks for 1.6 s and knocks once at 1.82 s
  },
  music: {
    take: 'music-s11.wav',   // seed 29 clips (peak +1.7 dB) and swings 14 LU; this one swings 7.7
    from: 0.1, to: 88,       // before the take's own fade-out, which begins near 89 s
    cross: 4,
    pad: 0.5,
    bed: 'rain_wind.mp3',
    bedDb: -10,              // the bed's level under the music's
    peakDb: -2,
    kbps: 128,
  },
};
// What ships must be inside these (the brief's sizes, and what makes a sound usable). --check holds them.
export const LIMITS = {
  effectBytes: 50_000,
  musicBytes: 1_500_000,
  effectPeakDb: [-6, 0],       // after encoding: an MP3's peak moves a little from the -3 it was set to
  effectLeadSilenceMs: 40,     // the encoder's own delay is in this; more would be heard as lag
  musicLufs: [-24, -14],
  musicPeakDb: 0,
};
const B = AUDIO_BUILD;

/** Interleaved float samples, `channels` wide, at RATE. */
function decode(file, channels) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', String(channels), '-ar', String(RATE), '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error(`ffmpeg could not decode ${file}: ${r.stderr}`);
  return new Float32Array(r.stdout.buffer.slice(r.stdout.byteOffset, r.stdout.byteOffset + r.stdout.byteLength));
}
function encode(samples, channels, kbps, out, dir) {
  const raw = join(dir, 'x.f32');
  writeFileSync(raw, Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength));
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'f32le', '-ar', String(RATE), '-ac', String(channels), '-i', raw,
    '-c:a', 'libmp3lame', '-b:a', `${kbps}k`, '-ar', String(RATE), '-ac', String(channels), '-map_metadata', '-1', '-id3v2_version', '0', '-write_xing', '1', '-bitexact', out]);
}
const peakOf = (x) => { let p = 0; for (const v of x) { const a = Math.abs(v); if (a > p) p = a; } return p; };
const rmsOf = (x) => { let s = 0; for (const v of x) s += v * v; return Math.sqrt(s / Math.max(1, x.length)); };
const gainTo = (x, db) => { const k = 10 ** (db / 20) / (peakOf(x) || 1); for (let i = 0; i < x.length; i++) x[i] *= k; return x; };

function buildEffect(name, e, dir) {
  const x = decode(join(SRC, e.take), 1);
  const thr = peakOf(x) * 10 ** (B.onsetDb / 20);
  let onset = 0;
  if (!e.fromStart) { while (onset < x.length && Math.abs(x[onset]) < thr) onset++; }
  const start = Math.max(0, onset - Math.round((B.leadInMs / 1000) * RATE));
  const n = Math.min(x.length - start, Math.round(e.seconds * RATE));
  const y = x.slice(start, start + n);
  const fin = Math.round((B.fadeInMs / 1000) * RATE), fout = Math.min(n, Math.round(e.fadeOut * RATE));
  for (let i = 0; i < fin && i < n; i++) y[i] *= i / fin;
  for (let i = 0; i < fout; i++) y[n - 1 - i] *= i / fout;
  encode(gainTo(y, B.effectPeakDb), 1, B.effectKbps, join(OUT, `${name}.mp3`), dir);
  return { file: `${name}.mp3`, seconds: +(n / RATE).toFixed(3), cutFromMs: Math.round((start / RATE) * 1000) };
}

function buildMusic(dir) {
  const m = B.music;
  const all = decode(join(SRC, m.take), 2);
  const a0 = Math.round(m.from * RATE), len = Math.round((m.to - m.from) * RATE);
  const A = all.slice(a0 * 2, (a0 + len) * 2);
  // the bed, tiled to the same length, set bedDb under the music
  const bed = decode(join(SRC, m.bed), 2);
  const k = (rmsOf(A) * 10 ** (m.bedDb / 20)) / (rmsOf(bed) || 1);
  for (let i = 0; i < A.length; i++) A[i] += bed[i % bed.length] * k;
  // the loop: A from `cross` on, its last `cross` seconds faded out as A's first `cross` seconds fade in
  const X = Math.round(m.cross * RATE), N = len - X;
  const L = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) {
    for (let c = 0; c < 2; c++) {
      let v = A[(X + i) * 2 + c];
      if (i >= N - X) {
        const f = (i - (N - X)) / X;
        v = v * Math.cos((f * Math.PI) / 2) + A[(i - (N - X)) * 2 + c] * Math.sin((f * Math.PI) / 2);
      }
      L[i * 2 + c] = v;
    }
  }
  gainTo(L, m.peakDb);
  // the loop, continued for `pad` on both sides
  const P = Math.round(m.pad * RATE);
  const F = new Float32Array((N + 2 * P) * 2);
  for (let i = 0; i < N + 2 * P; i++) {
    const j = (((i - P) % N) + N) % N;
    F[i * 2] = L[j * 2]; F[i * 2 + 1] = L[j * 2 + 1];
  }
  encode(F, 2, m.kbps, join(OUT, 'music.mp3'), dir);
  return { file: 'music.mp3', loopStart: m.pad, loopSeconds: +(N / RATE).toFixed(4) };
}

function check() {
  const meta = JSON.parse(readFileSync(join(OUT, 'audio.json'), 'utf8'));
  const errors = [];
  const rows = [];
  for (const [name, e] of Object.entries(meta.effects)) {
    const s = stats(join(OUT, e.file));
    rows.push(s);
    if (s.bytes > LIMITS.effectBytes) errors.push(`${e.file}: ${s.bytes} B is over ${LIMITS.effectBytes}`);
    if (s.peakDb < LIMITS.effectPeakDb[0] || s.peakDb > LIMITS.effectPeakDb[1]) errors.push(`${e.file}: peak ${s.peakDb} dB is outside ${LIMITS.effectPeakDb.join(' to ')}`);
    if (!B.effects[name]?.fromStart && s.leadSilenceMs > LIMITS.effectLeadSilenceMs) errors.push(`${e.file}: ${s.leadSilenceMs} ms of silence before it starts (limit ${LIMITS.effectLeadSilenceMs})`);
  }
  const s = stats(join(OUT, meta.music.file));
  rows.push(s);
  if (s.bytes > LIMITS.musicBytes) errors.push(`${meta.music.file}: ${s.bytes} B is over ${LIMITS.musicBytes}`);
  if (s.lufs === null || s.lufs < LIMITS.musicLufs[0] || s.lufs > LIMITS.musicLufs[1]) errors.push(`${meta.music.file}: ${s.lufs} LUFS is outside ${LIMITS.musicLufs.join(' to ')}`);
  if (s.peakDb > LIMITS.musicPeakDb) errors.push(`${meta.music.file}: peak ${s.peakDb} dB clips`);
  if (Math.abs(s.seconds - (meta.music.loopSeconds + 2 * meta.music.loopStart)) > 0.1) errors.push(`${meta.music.file}: ${s.seconds} s is not the loop (${meta.music.loopSeconds}) plus its two pads`);
  console.log('file                   sec     bytes  peak dB   LUFS   LRA  lead ms trail ms  centroid Hz  <200Hz  >4kHz');
  for (const r of rows) console.log(`${r.file.padEnd(20)} ${r.seconds.toFixed(2).padStart(6)} ${String(r.bytes).padStart(9)} ${String(r.peakDb).padStart(7)} ${String(r.lufs ?? '-').padStart(7)} ${String(r.lra ?? '-').padStart(5)} ${String(r.leadSilenceMs).padStart(8)} ${String(r.trailSilenceMs).padStart(8)} ${String(r.centroidHz).padStart(11)} ${String(r.under200).padStart(7)} ${String(r.over4k).padStart(6)}`);
  for (const e of errors) console.log(`  ✗ ${e}`);
  console.log(errors.length ? 'AUDIO CHECK FAIL' : `AUDIO CHECK PASS  ${rows.length} files`);
  return errors.length === 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!process.argv.includes('--check')) {
    if (!existsSync(SRC)) { console.error(`${SRC} does not exist: the takes are git-ignored downloads (sh tools/gen/run-audio.sh, or fal-call.mjs fetch <request id>)`); process.exit(2); }
    mkdirSync(OUT, { recursive: true });
    const dir = mkdtempSync(join(tmpdir(), 'build-audio-'));
    const onlyArg = process.argv.find((a) => a.startsWith('--only='));
    const only = onlyArg ? onlyArg.slice('--only='.length).split(',') : null;
    const unknown = (only ?? []).filter((n) => !B.effects[n]);
    if (unknown.length) { console.error(`no effect named ${unknown.join(', ')} in AUDIO_BUILD.effects`); process.exit(2); }
    const effects = Object.fromEntries(Object.entries(B.effects).filter(([name]) => !only || only.includes(name)).map(([name, e]) => [name, buildEffect(name, e, dir)]));
    // --only: the music and every effect not named stay as shipped, their lines read back from audio.json
    const shipped = only ? JSON.parse(readFileSync(join(OUT, 'audio.json'), 'utf8')) : null;
    const music = shipped ? shipped.music : buildMusic(dir);
    const lines = { ...(shipped?.effects ?? {}), ...Object.fromEntries(Object.entries(effects).map(([n, e]) => [n, { file: e.file, seconds: e.seconds }])) };
    writeFileSync(join(OUT, 'audio.json'), JSON.stringify({
      _doc: 'D-022, D-023. Written by tools/gen/build-audio.mjs: what src/audio/audio.ts loads. music.loopStart and loopSeconds are the window the music loops over (the file carries the loop continued on both sides). Not typed by hand.',
      music, effects: Object.fromEntries(Object.keys(B.effects).filter((n) => lines[n]).map((n) => [n, lines[n]])),
    }, null, 2) + '\n');
    for (const [n, e] of Object.entries(effects)) console.log(`${n.padEnd(11)} from ${B.effects[n].take}, cut from ${e.cutFromMs} ms, ${e.seconds} s, ${statSync(join(OUT, e.file)).size} B`);
    if (!only) console.log(`music       from ${B.music.take} [${B.music.from}, ${B.music.to}) s + ${B.music.bed} at ${B.music.bedDb} dB, loop ${music.loopSeconds} s, ${statSync(join(OUT, music.file)).size} B`);
  }
  process.exit(check() ? 0 : 1);
}
