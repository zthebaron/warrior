// title-fit — does the title screen fit the window it is in? Measured in the page, from the image's real box:
// where the painting's keep zone (the lettering, the seal and the boat: assets/ui/art.json) lands once
// object-fit has placed it, whether the painting is cropped top or bottom, and whether any button or credit line
// is cut off by the edge of the screen. One definition, used by shell-shots (for looking at) and by reachable
// (which holds the title to it in CI, B-59).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';

export interface TitleFit {
  keepLeft: number; keepRight: number; top: number; bottom: number;
  box: { left: number; right: number; top: number; bottom: number };
  /** the buttons and credit lines that are partly or wholly off the screen */
  cut: string[];
  /** the keep zone and the painting's full height are inside the image's box, and the box is on screen */
  whole: boolean;
}

export function keepZone(root: string): { x0: number; x1: number } {
  return (JSON.parse(readFileSync(join(root, 'assets/ui/art.json'), 'utf8')) as { keep: { x0: number; x1: number } }).keep;
}

/** D-025: the chapter list as it stands open: how many chapters it holds, and which of its buttons are partly or wholly off the screen. */
export async function chaptersFit(page: Page): Promise<{ rows: number; cut: string[] }> {
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate(() => {
    const buttons = [...document.querySelectorAll<HTMLElement>('#chapters button')].filter((e) => e.getClientRects().length > 0);
    const cut = buttons
      .map((e) => ({ what: (e.textContent ?? '').trim(), r: e.getBoundingClientRect() }))
      .filter(({ r }) => r.left < 0 || r.top < 0 || r.right > innerWidth + 0.5 || r.bottom > innerHeight + 0.5)
      .map(({ what }) => what);
    return { rows: document.querySelectorAll('#chapters-list button').length, cut };
  });
}

/** Wait for the title's painting to be drawn, then measure. */
export async function titleFit(page: Page, keep: { x0: number; x1: number }): Promise<TitleFit> {
  await page.waitForFunction(() => { const i = document.querySelector<HTMLImageElement>('#title img'); return !!i && i.complete && i.naturalWidth > 0; });
  await page.evaluate(() => document.fonts.ready);
  const m = await page.evaluate((k) => {
    const img = document.querySelector<HTMLImageElement>('#title img')!;
    const box = img.getBoundingClientRect();
    const scale = Math.max(box.width / img.naturalWidth, box.height / img.naturalHeight); // object-fit: cover
    const drawnW = img.naturalWidth * scale, drawnH = img.naturalHeight * scale;
    const [px, py] = getComputedStyle(img).objectPosition.split(' ').map((v) => parseFloat(v) / 100) as [number, number];
    const left = box.left + (box.width - drawnW) * px, top = box.top + (box.height - drawnH) * py;
    const cut = [...document.querySelectorAll<HTMLElement>('#title button, #title .credits span')]
      .filter((e) => e.getClientRects().length > 0)
      .map((e) => ({ what: (e.textContent ?? '').trim(), r: e.getBoundingClientRect() }))
      .filter(({ r }) => r.left < 0 || r.top < 0 || r.right > innerWidth + 0.5 || r.bottom > innerHeight + 0.5)
      .map(({ what }) => what);
    return {
      keepLeft: left + k.x0 * drawnW, keepRight: left + k.x1 * drawnW, top, bottom: top + drawnH,
      box: { left: box.left, right: box.right, top: box.top, bottom: box.bottom }, cut,
      width: innerWidth, height: innerHeight,
    };
  }, keep);
  const e = 0.5;
  const whole = m.keepLeft >= m.box.left - e && m.keepRight <= m.box.right + e && m.top >= m.box.top - e && m.bottom <= m.box.bottom + e
    && m.box.left >= -e && m.box.right <= m.width + e && m.box.top >= -e && m.box.bottom <= m.height + e;
  return { keepLeft: m.keepLeft, keepRight: m.keepRight, top: m.top, bottom: m.bottom, box: m.box, cut: m.cut, whole };
}
