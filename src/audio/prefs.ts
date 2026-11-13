// The two things about sound a player sets and expects to find again: muted or not, and how loud (D-022).
//
// They are kept in one cookie, and that is the whole of what this game keeps between visits. Nothing about a
// run is in it: no chapter, no torii, no count of anything. SPEC §7 row 15 (no saves, no unlocks: a reload
// restarts the game; D-025's chapter list stores nothing) is about progress, and stands; D-022 and OQ-072 record that Tim asked for
// these two values to be remembered, and that a cookie holding only them is how. If the browser refuses cookies
// the values simply last for the visit.

// Every number is in MEASUREMENTS.md "D-022 sound".
export const SOUND_PREFS = {
  name: 'karasu_sound',
  days: 365,
  /** how loud a first visit is, 0..1 */
  volume: 0.8,
};

export interface SoundPrefs {
  muted: boolean;
  volume: number;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** What the cookie holds, or the defaults. Never throws: a blocked or malformed cookie is a first visit. */
export function loadSoundPrefs(): SoundPrefs {
  const fresh: SoundPrefs = { muted: false, volume: SOUND_PREFS.volume };
  try {
    const hit = document.cookie.split('; ').find((c) => c.startsWith(`${SOUND_PREFS.name}=`));
    if (!hit) return fresh;
    const [m, v] = hit.slice(SOUND_PREFS.name.length + 1).split('.');
    const volume = Number(v) / 100;
    if ((m !== '0' && m !== '1') || !Number.isFinite(volume)) return fresh;
    return { muted: m === '1', volume: clamp01(volume) };
  } catch {
    return fresh;
  }
}

export function saveSoundPrefs(p: SoundPrefs): void {
  try {
    const value = `${p.muted ? 1 : 0}.${Math.round(clamp01(p.volume) * 100)}`;
    document.cookie = `${SOUND_PREFS.name}=${value}; max-age=${SOUND_PREFS.days * 24 * 60 * 60}; path=/; SameSite=Lax`;
  } catch {
    // the values last for this visit only
  }
}
