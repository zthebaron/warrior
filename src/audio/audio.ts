// Sound (D-022). The one audio module: game events go in, sound comes out.
//
// The simulation never reads anything here. Nothing in this file returns a value the game acts on, nothing is
// awaited by the game, and every call is safe when sound is impossible (no AudioContext, a blocked autoplay, a
// file that fails to load or decode): it then does nothing, quietly. A sound that cannot play is never an
// error, because an error here must never reach a player who only wanted to jump.
//
// It exists only at the game's front door. A page with a harness, playtest, replay, instrument or level
// parameter builds no GameAudio at all (src/main.ts), so no test or tool run fetches a sound or opens a context.
//
// A browser lets a page make sound only after a gesture. wake() is that moment: the Play press calls it. Until
// then nothing is fetched. The files are in assets/audio/ (assets/audio/MANIFEST.md says where each came from);
// audio.json, written by tools/gen/build-audio.mjs, names them and carries the music's loop window.
//
// Every number is in MEASUREMENTS.md "D-022 sound".

import meta from '../../assets/audio/audio.json';
import { loadSoundPrefs, saveSoundPrefs, type SoundPrefs } from './prefs';

const URLS = import.meta.glob<string>('../../assets/audio/*.mp3', { query: '?url', import: 'default', eager: true });

export type EffectName = keyof typeof meta.effects;
/** Where the player is, as far as the music is concerned: under the title it plays quieter, in the game at full. */
export type Scene = 'title' | 'game';

export const AUDIO = {
  keys: { mute: 'KeyN', quieter: 'Minus', louder: 'Equal' },
  /** one press of a volume key */
  volumeStep: 0.1,
  music: {
    /** the music's level in each scene, before the player's own volume */
    level: { title: 0.3, game: 0.6 } satisfies Record<Scene, number>,
    /** a change of scene, of mute or of volume is eased over this long, so nothing clicks */
    fadeSec: 0.8,
  },
  /** each effect's level against the others, before the player's own volume (the files all peak at -3 dB) */
  gain: {
    jump: 0.45, land_soft: 0.5, land_hard: 0.9, slash: 0.7, dash: 0.55, wall_grab: 0.6, checkpoint: 0.5, respawn: 0.45,
    notice: 0.5, hit: 0.8, fell: 0.8, cut: 0.9, // D-023, the fight
    gate: 0.7, // POLISH-1: the courtyard's far gate swinging open (it starts with the last fall's hit and fell)
  } satisfies Record<EffectName, number>,
  /** the same effect is not started twice inside this long (a wall slide can begin again within a few ticks) */
  minGapSec: 0.08,
};

function urlOf(file: string): string | null {
  return Object.entries(URLS).find(([path]) => path.endsWith(`/${file}`))?.[1] ?? null;
}

export class GameAudio {
  private prefs: SoundPrefs = loadSoundPrefs();
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private readonly buffers = new Map<EffectName, AudioBuffer>();
  private readonly lastPlayed = new Map<EffectName, number>();
  private scene: Scene = 'title';
  /** wake() has been called: from then on a later gesture may be needed to finish the job (see nudge) */
  private woken = false;
  private musicStarted = false;

  constructor() {
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      // a hidden tab is silent; coming back resumes where it stopped
      void (document.hidden ? this.ctx.suspend() : this.ctx.resume()).catch(() => {});
    });
  }

  // ---------- what the player set ----------
  get muted(): boolean {
    return this.prefs.muted;
  }
  get volume(): number {
    return this.prefs.volume;
  }
  setMuted(muted: boolean): void {
    this.prefs = { ...this.prefs, muted };
    this.applied();
  }
  setVolume(volume: number): void {
    const v = Math.min(1, Math.max(0, Math.round(volume * 100) / 100));
    // turning the volume up from silence is asking for sound
    this.prefs = { muted: v === 0 ? this.prefs.muted : false, volume: v };
    this.applied();
  }
  private applied(): void {
    saveSoundPrefs(this.prefs);
    this.ease(this.master, this.prefs.muted ? 0 : this.prefs.volume);
  }

  // ---------- the gesture ----------
  /**
   * Call from a user gesture (the Play press). Opens the audio context and starts fetching the sounds. Safe to
   * call again; safe when the browser has no audio at all.
   */
  wake(): void {
    this.woken = true;
    try {
      if (!this.ctx) {
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctx) return;
        this.ctx = new Ctx();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.prefs.muted ? 0 : this.prefs.volume;
        this.master.connect(this.ctx.destination);
        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = 0;
        this.musicGain.connect(this.master);
        void this.load();
      }
      if (this.ctx.state !== 'running' && !document.hidden) void this.ctx.resume().catch(() => {});
    } catch {
      this.ctx = null; // no sound this visit
    }
  }

  /** A later key or click: if the context was opened by something a browser does not count as a gesture (a
   *  gamepad button), this is what lets it run. Does nothing until wake() has been called. */
  nudge(): void {
    if (this.woken && this.ctx && this.ctx.state !== 'running' && !document.hidden) void this.ctx.resume().catch(() => {});
  }

  private async fetchBuffer(file: string): Promise<AudioBuffer | null> {
    const url = urlOf(file);
    if (!url || !this.ctx) return null;
    try {
      const data = await (await fetch(url)).arrayBuffer();
      return await this.ctx.decodeAudioData(data);
    } catch {
      return null;
    }
  }

  private async load(): Promise<void> {
    // the effects first: they are a few kilobytes each and a player can jump within a second of Play
    await Promise.all((Object.keys(meta.effects) as EffectName[]).map(async (name) => {
      const b = await this.fetchBuffer(meta.effects[name].file);
      if (b) this.buffers.set(name, b);
    }));
    const music = await this.fetchBuffer(meta.music.file);
    if (!music || !this.ctx || !this.musicGain || this.musicStarted) return;
    try {
      const src = this.ctx.createBufferSource();
      src.buffer = music;
      src.loop = true;
      // the file is the loop continued on both sides, so this window is seamless wherever a decoder's own
      // delay puts it (tools/gen/build-audio.mjs; measured by tools/harness/audio-check.ts)
      src.loopStart = meta.music.loopStart;
      src.loopEnd = meta.music.loopStart + meta.music.loopSeconds;
      src.connect(this.musicGain);
      src.start(0, meta.music.loopStart);
      this.musicStarted = true;
      this.ease(this.musicGain, AUDIO.music.level[this.scene]);
    } catch {
      // no music this visit
    }
  }

  private ease(node: GainNode | null, to: number): void {
    if (!node || !this.ctx) return;
    try {
      const t = this.ctx.currentTime;
      node.gain.cancelScheduledValues(t);
      node.gain.setValueAtTime(node.gain.value, t);
      node.gain.linearRampToValueAtTime(to, t + AUDIO.music.fadeSec);
    } catch {
      node.gain.value = to;
    }
  }

  // ---------- events in ----------
  /** The music's level follows where the player is. */
  setScene(scene: Scene): void {
    if (scene === this.scene) return;
    this.scene = scene;
    if (this.musicStarted) this.ease(this.musicGain, AUDIO.music.level[scene]);
  }

  /**
   * Play one effect. `level` (0..1) scales it against its own place in the mix; `rate` plays it faster and
   * higher (the second jump is the first jump's sound, quicker). Silent if sound is not ready.
   */
  play(name: EffectName, level = 1, rate = 1): void {
    const ctx = this.ctx, buffer = this.buffers.get(name);
    if (!ctx || !this.master || !buffer || ctx.state !== 'running') return;
    try {
      const now = ctx.currentTime;
      if (now - (this.lastPlayed.get(name) ?? -1) < AUDIO.minGapSec) return;
      this.lastPlayed.set(name, now);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = rate;
      const g = ctx.createGain();
      g.gain.value = AUDIO.gain[name] * Math.min(1, Math.max(0, level));
      src.connect(g);
      g.connect(this.master);
      src.start();
    } catch {
      // one sound lost
    }
  }
}
