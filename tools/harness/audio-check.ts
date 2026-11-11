// audio-check — the shipped sound as a browser decodes it, measured (D-022). Nobody building this can hear it,
// and an MP3 does not decode to the samples it was encoded from: a decoder may add or drop a few hundred at the
// start. So the two things that can go wrong without anyone hearing them are measured where they happen, in
// Chromium's own decodeAudioData:
//
//   the loop    The music file is the loop continued on both sides (tools/gen/build-audio.mjs), so a window one
//               loop long should be seamless wherever the decoder's delay puts it. Measured: (1) the audio one
//               loop apart is the same audio (the difference, in dB under the signal: what is left is the
//               codec's own noise); (2) the step from the window's last sample to its first, against the steps
//               between neighbouring samples around it (1 is an ordinary step; a click is many times that).
//               As a control, the same two numbers for a window that is WRONG by `offBy` seconds.
//   the lag     How long each effect is silent before it starts, once decoded.
//
//   node tools/harness/audio-check.ts        exit 1 if the loop is not seamless or an effect starts late
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { CHROMIUM_ARGS } from './lib.ts';

const ROOT = new URL('../..', import.meta.url).pathname;
// Every number is in MEASUREMENTS.md "D-022 sound".
const CHECK = {
  sameAudioDb: -15,   // audio one loop apart must differ by less than this, relative to the signal. Measured: the shipped
                      // loop -23.2 (the codec's own noise on rain), a window 0.37 s wrong -0.3. The line stands between.
  seamStep: 4,        // the step across the seam, in ordinary neighbouring steps
  offBy: 0.37,        // the control: a window this many seconds too short
  effectLagMs: 40,
  silenceDb: -50,
};
const meta = JSON.parse(readFileSync(join(ROOT, 'assets/audio/audio.json'), 'utf8')) as {
  music: { file: string; loopStart: number; loopSeconds: number };
  effects: Record<string, { file: string; seconds: number }>;
};
const b64 = (file: string): string => readFileSync(join(ROOT, 'assets/audio', file)).toString('base64');

const browser = await chromium.launch({ args: CHROMIUM_ARGS });
const page = await browser.newPage();
await page.goto('about:blank');
const decode = `async (b64) => {
  const bin = atob(b64); const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const ctx = new OfflineAudioContext(2, 44100, 44100);
  return ctx.decodeAudioData(bytes.buffer);
}`;

const music = await page.evaluate(async ([data, dec, m, offBy]) => {
  const buf: AudioBuffer = await (0, eval)(`(${dec})`)(data);
  const x = buf.getChannelData(0), rate = buf.sampleRate;
  const measure = (loopSeconds: number) => {
    const s = Math.round(m.loopStart * rate), n = Math.round(loopSeconds * rate), w = Math.round(0.4 * rate);
    // (1) is the audio one loop later the same audio?
    let diff = 0, sig = 0;
    for (let i = 0; i < w; i++) { const a = x[s + i]!, b = x[s + n + i]!; diff += (a - b) * (a - b); sig += a * a; }
    // (2) the step across the seam against the ordinary steps on either side of it
    let steps = 0;
    const k = Math.round(0.02 * rate);
    for (let i = 1; i <= k; i++) steps += Math.abs(x[s + i]! - x[s + i - 1]!) + Math.abs(x[s + n - i]! - x[s + n - i - 1]!);
    return { sameDb: 10 * Math.log10(diff / sig), seam: Math.abs(x[s]! - x[s + n - 1]!) / (steps / (2 * k)) };
  };
  return { seconds: buf.duration, rate, right: measure(m.loopSeconds), wrong: measure(m.loopSeconds - offBy) };
}, [b64(meta.music.file), decode, meta.music, CHECK.offBy] as const);

let bad = 0;
const expected = meta.music.loopSeconds + 2 * meta.music.loopStart;
console.log(`${meta.music.file}: decoded ${music.seconds.toFixed(4)} s at ${music.rate} Hz (built as ${expected.toFixed(4)} s: the decoder ${music.seconds >= expected ? 'added' : 'dropped'} ${Math.abs(Math.round((music.seconds - expected) * music.rate))} samples)`);
const loopOk = music.right.sameDb < CHECK.sameAudioDb && music.right.seam < CHECK.seamStep;
console.log(`  ${loopOk ? '✓' : '✗'} loop window ${meta.music.loopSeconds} s: audio one loop apart differs by ${music.right.sameDb.toFixed(1)} dB (need < ${CHECK.sameAudioDb}); the seam is ${music.right.seam.toFixed(2)} ordinary steps (need < ${CHECK.seamStep})`);
const controlBites = music.wrong.sameDb > CHECK.sameAudioDb;
console.log(`  ${controlBites ? '✓' : '✗'} control, a window ${CHECK.offBy} s short: ${music.wrong.sameDb.toFixed(1)} dB apart, seam ${music.wrong.seam.toFixed(2)} steps (the measure must call this one wrong)`);
if (!loopOk || !controlBites) bad++;

for (const [name, e] of Object.entries(meta.effects)) {
  const r = await page.evaluate(async ([data, dec, silenceDb]) => {
    const buf: AudioBuffer = await (0, eval)(`(${dec})`)(data);
    const x = buf.getChannelData(0);
    let peak = 0;
    for (const v of x) peak = Math.max(peak, Math.abs(v));
    const thr = 10 ** (silenceDb / 20);
    let lead = 0;
    while (lead < x.length && Math.abs(x[lead]!) < thr) lead++;
    return { seconds: buf.duration, peakDb: 20 * Math.log10(peak), leadMs: (lead / buf.sampleRate) * 1000 };
  }, [b64(e.file), decode, CHECK.silenceDb] as const);
  const swell = name === 'respawn'; // a swell from silence: it has no onset to be late with
  const ok = swell || r.leadMs <= CHECK.effectLagMs;
  if (!ok) bad++;
  console.log(`  ${ok ? '✓' : '✗'} ${e.file.padEnd(15)} decoded ${r.seconds.toFixed(3)} s, peak ${r.peakDb.toFixed(1)} dB, silent for ${r.leadMs.toFixed(1)} ms before it starts${swell ? ' (a swell)' : ` (need <= ${CHECK.effectLagMs})`}`);
}
await browser.close();
console.log(bad ? `AUDIO-CHECK FAIL (${bad})` : 'AUDIO-CHECK PASS');
process.exit(bad ? 1 : 0);
