// What an audio file IS, measured, because nobody building this can hear it (D-022, D-009's "Claude cannot
// hear it"). For each file: length, peak, integrated loudness and loudness range (EBU R128), how much of it is
// silent at each end, and where its energy sits (spectral centroid, and the share of energy under 200 Hz and
// over 4 kHz). Optionally a spectrogram to look at.
//
//   node tools/gen/audio-stats.mjs <file>... [--spectrograms <dir>] [--json]
//
// Needs ffmpeg and ffprobe on the PATH. It judges nothing; tools/gen/build-audio.mjs holds the limits.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';

const argv = process.argv.slice(2);
const specDir = argv.includes('--spectrograms') ? argv[argv.indexOf('--spectrograms') + 1] : null;
const files = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--spectrograms');
const SILENCE_DB = -50; // quieter than this is silence, for the two ends

const ff = (args) => spawnSync('ffmpeg', ['-hide_banner', '-nostats', ...args], { encoding: 'utf8', maxBuffer: 1 << 28 });

/** Mono float samples at `rate` Hz. */
export function decode(file, rate = 44100) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(rate), '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error(`ffmpeg could not decode ${file}: ${r.stderr}`);
  return new Float32Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.byteLength >> 2);
}

/** Energy by band from a plain DFT over Hann windows: enough for a centroid and three shares. */
function spectrum(x, rate) {
  const N = 2048, hop = 2048, bins = N / 2;
  const mag = new Float64Array(bins);
  const win = Float64Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
  const cos = Float64Array.from({ length: N }, (_, i) => Math.cos((2 * Math.PI * i) / N));
  const sin = Float64Array.from({ length: N }, (_, i) => Math.sin((2 * Math.PI * i) / N));
  const frames = Math.min(64, Math.max(1, Math.floor((x.length - N) / hop) + 1));
  const step = Math.max(1, Math.floor(Math.max(1, x.length - N) / frames));
  for (let f = 0; f < frames; f++) {
    const o = Math.min(Math.max(0, x.length - N), f * step);
    for (let k = 1; k < bins; k += 1) {
      let re = 0, im = 0;
      for (let n = 0; n < N; n += 2) { // every second sample: half the work, and the band shares do not need more
        const v = (x[o + n] ?? 0) * win[n], idx = (k * n) % N;
        re += v * cos[idx]; im -= v * sin[idx];
      }
      mag[k] += re * re + im * im;
    }
  }
  let total = 0, weighted = 0, low = 0, high = 0;
  for (let k = 1; k < bins / 2; k++) { // sampled at half rate above, so only the lower half of the bins is real
    const hz = (k * rate) / N;
    total += mag[k]; weighted += mag[k] * hz;
    if (hz < 200) low += mag[k];
    if (hz > 4000) high += mag[k];
  }
  return { centroidHz: total ? weighted / total : 0, under200: total ? low / total : 0, over4k: total ? high / total : 0 };
}

export function stats(file) {
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,size,bit_rate:stream=codec_name,sample_rate,channels', '-of', 'json', file], { encoding: 'utf8' }));
  const x = decode(file);
  let peak = 0, sum = 0;
  for (const v of x) { const a = Math.abs(v); if (a > peak) peak = a; sum += v * v; }
  const thr = 10 ** (SILENCE_DB / 20);
  let lead = 0; while (lead < x.length && Math.abs(x[lead]) < thr) lead++;
  let trail = 0; while (trail < x.length - lead && Math.abs(x[x.length - 1 - trail]) < thr) trail++;
  const loud = ff(['-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-']).stderr;
  const num = (re) => { const m = [...loud.matchAll(re)].pop(); return m ? Number(m[1]) : null; };
  const db = (v) => (v > 0 ? 20 * Math.log10(v) : -Infinity);
  return {
    file: basename(file),
    codec: probe.streams[0].codec_name, channels: probe.streams[0].channels, rate: Number(probe.streams[0].sample_rate),
    seconds: Number(probe.format.duration), bytes: Number(probe.format.size),
    peakDb: +db(peak).toFixed(1), rmsDb: +db(Math.sqrt(sum / Math.max(1, x.length))).toFixed(1),
    lufs: num(/I:\s+(-?[\d.]+) LUFS/g), lra: num(/LRA:\s+(-?[\d.]+) LU/g), truePeakDb: num(/Peak:\s+(-?[\d.]+) dBFS/g),
    leadSilenceMs: Math.round((lead / 44100) * 1000), trailSilenceMs: Math.round((trail / 44100) * 1000),
    ...Object.fromEntries(Object.entries(spectrum(x, 44100)).map(([k, v]) => [k, k === 'centroidHz' ? Math.round(v) : +v.toFixed(3)])),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!files.length) { console.error('usage: node tools/gen/audio-stats.mjs <file>... [--spectrograms <dir>] [--json]'); process.exit(2); }
  if (specDir) mkdirSync(specDir, { recursive: true });
  const rows = files.map((f) => {
    if (specDir) ff(['-y', '-i', f, '-lavfi', 'showspectrumpic=s=1200x400:legend=1:scale=log:fscale=log:start=30:stop=16000', join(specDir, `${basename(f).replace(/\.[a-z0-9]+$/i, '')}.png`)]);
    return stats(f);
  });
  if (argv.includes('--json')) console.log(JSON.stringify(rows, null, 1));
  else {
    console.log('file                   sec     bytes  peak dB   LUFS   LRA  lead ms trail ms  centroid Hz  <200Hz  >4kHz');
    for (const r of rows) {
      console.log(`${r.file.padEnd(20)} ${r.seconds.toFixed(2).padStart(6)} ${String(r.bytes).padStart(9)} ${String(r.peakDb).padStart(7)} ${String(r.lufs ?? '-').padStart(7)} ${String(r.lra ?? '-').padStart(5)} ${String(r.leadSilenceMs).padStart(8)} ${String(r.trailSilenceMs).padStart(8)} ${String(r.centroidHz).padStart(11)} ${String(r.under200).padStart(7)} ${String(r.over4k).padStart(6)}`);
    }
  }
}
