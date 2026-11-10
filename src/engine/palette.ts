// STYLE-BIBLE §2 as code: the eight-step ramp, read from reference/palette.json (never retyped), plus the
// two non-ramp colours the Bible names: the accent (assets/src/accent.json, torii only) and the robe.
// Every colour the shipped look draws comes from here by NAME. A hex literal elsewhere in src/ is a §2 bug.

import paletteJson from '../../reference/palette.json';

export type RampName = 'paper-cream' | 'mist-pale' | 'wash-light' | 'stone-mid' | 'wash-mid' | 'ink-grey' | 'ink-deep' | 'ink-black';

/** The ramp, lightest first, as palette.json lists it. Index = value step (0 paper ... 7 ink-black). */
export const RAMP: readonly { name: RampName; hex: string; value: number }[] = paletteJson.colors.map((c) => ({
  name: c.name as RampName,
  hex: c.hex,
  value: parseInt(c.hex.slice(1), 16),
}));

export function ramp(name: RampName): number {
  const c = RAMP.find((x) => x.name === name);
  if (!c) throw new Error(`[palette] palette.json has no "${name}"`);
  return c.value;
}

/** STYLE §2: "The character's robe is desaturated blue-grey ... near #7d8590 ... It is not a second accent."
 *  The only non-ramp, non-accent colour in the Bible. MEASUREMENTS "D-018" records it. */
export const ROBE = 0x7d8590;
