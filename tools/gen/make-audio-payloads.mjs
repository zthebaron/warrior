// The fal payloads for the game's sound (D-022): one music loop and the effects.
//
//   node tools/gen/make-audio-payloads.mjs       write tools/gen/payloads/au-*.json
//
// Music: fal-ai/stable-audio-25/text-to-audio ($0.20 a clip, any length to 190 s). Two seeds of the same
// prompt, so there is a choice. Effects: fal-ai/elevenlabs/sound-effects/v3 ($0.002 a second). Each effect
// asks for an explicit length: left out, the model picks one and the price with it, and fal-call.mjs refuses.
// What ships is cut from these by tools/gen/build-audio.mjs; which take ships is in assets/audio/MANIFEST.md.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'payloads');
mkdirSync(OUT, { recursive: true });

const MUSIC =
  'Sparse meditative Japanese ambient music. A lone shakuhachi bamboo flute plays slow breathy phrases, a koto answers ' +
  'with single plucked notes, a low taiko drum sounds a soft distant pulse. Mountain wind and steady rain underneath. ' +
  'Slow, 60 BPM, minor pentatonic, instrumental, no vocals, spacious, calm and a little ominous, even level throughout.';

/** name: [seconds, text]. Dry and close: the game adds nothing, and a tail of room sound would smear a fast move. */
const EFFECTS = {
  jump: [0.5, 'A person leaps: one quick soft whoosh of cloth and a faint push of air. Short, dry, close. No music, no voice.'],
  double_jump: [0.5, 'A second leap in mid air: one quick light upward whoosh with a flutter of cloth, higher and airier than a jump. Short, dry. No music, no voice.'],
  land_soft: [0.5, 'Straw sandals land lightly on stone: one soft low thud with a small scuff. Short, dry, close. No music, no voice.'],
  land_hard: [0.8, 'A heavy landing on stone after a long fall: one deep body thud, sandals slapping rock, a scatter of grit. Dry, close. No music, no voice.'],
  slash: [0.6, 'A single katana slash through the air: a fast sharp whoosh ending in a faint thin ring of steel. Dry, close. No music, no voice, no impact.'],
  dash: [0.6, 'A person darts forward very fast: one sharp rushing whoosh of air with a snap of cloth. Short, dry. No music, no voice.'],
  wall_grab: [0.6, 'A hand and sandals catch a rough rock wall: one short gritty scrape of stone and cloth. Dry, close. No music, no voice.'],
  checkpoint: [2, 'One soft strike of a small Japanese temple bowl bell (rin): a clear warm tone that rings and fades gently. No other sound.'],
  respawn: [1.2, 'A soft breathy bamboo flute note swells up from silence with a hush of wind, then settles. Calm. No other sound.'],
  // Second takes. The first jump came back as a low thump (91% of its energy under 200 Hz) and the first soft
  // landing nearly silent (peak -38.6 dB): tools/gen/audio-stats.mjs, MEASUREMENTS "D-022 sound".
  'jump-b': [0.5, 'A quick airy whoosh of loose cloth as someone leaps upward. Only moving air and fabric, bright and breathy. No thud, no footstep, no impact, no voice, no music.'],
  'land_soft-b': [0.5, 'A light landing on a stone step in straw sandals: one soft dull thump with a brief scuff of straw on stone. Clearly audible, close microphone. No voice, no music.'],
  // D-023, the fight. No voice in any of them: a cry cannot be judged by someone who cannot hear it.
  notice: [0.6, 'A swordsman readies his blade: one sharp short metallic click as a katana is loosened in its scabbard, with a quick rustle of cloth as he turns. Dry, close. No voice, no music.'],
  hit: [0.6, 'A katana lands: one hard bright ring of steel on steel with a short dull thud of padded cloth under it. A single impact. Dry, close. No voice, no music.'],
  fell: [1, 'A man in heavy cloth drops to a stone floor: one low soft body thud, then a sword clattering once on stone. Dry, close. No voice, no music.'],
  cut: [0.7, 'A blade cuts through cloth: one fast sharp slicing rip, then a low dark dull thump. Final. Dry, close. No voice, no music.'],
  // Second take: the first hit came back as a low thud (54% of its energy under 200 Hz, centroid 367 Hz), no steel in it.
  'hit-b': [0.6, 'Two steel sword blades meet once: a single bright high ringing metallic clang, sharp and clean. Only metal on metal. No thud, no bass, no voice, no music.'],
};
/** Under the music: the model made flute, koto and drum and left out the weather the brief asks for. */
const BED = { text: 'Steady light rain falling on stone with a low mountain wind. Even and continuous. No thunder, no birds, no voices, no music.', duration_seconds: 30, prompt_influence: 0.6, output_format: 'mp3_44100_192', loop: true };

const write = (name, body) => writeFileSync(join(OUT, `au-${name}.json`), JSON.stringify(body, null, 2) + '\n');
for (const seed of [11, 29]) write(`music-s${seed}`, { prompt: MUSIC, seconds_total: 95, seed });
for (const [name, [duration_seconds, text]] of Object.entries(EFFECTS)) {
  write(name, { text, duration_seconds, prompt_influence: 0.6, output_format: 'mp3_44100_192' });
}
write('rain_wind', BED);
console.log(`wrote ${3 + Object.keys(EFFECTS).length} payloads to tools/gen/payloads/au-*.json`);
