// assets — every mesh in assets/dist/manifest.json, decoded by the real loader in the harness
// browser, rendered ALONE, checked against its Tier-1 budget (tools/assets/budgets.json).
//
// "Draw calls when placed once" is defined here, and only here: the asset in its own THREE.Scene
// (no level, player, lights, HUD or debug lines), one uninstanced placement, one render pass,
// renderer.info.render.calls read immediately after. Reproducible on any WebGL2 backend.
//
// Tier-1 (asserted, renderer-independent): the glb loads through Draco + KTX2 with zero console
// errors; rendered draw calls and triangles within budget; each texture arrives at the dimensions the
// manifest declares; the material is unlit (KHR_materials_unlit -> MeshBasicMaterial).
// Tier-2 (recorded, NEVER asserted): which GPU format KTX2 transcoded to, whether it stayed
// compressed, and palette fidelity of the rendered pixels. Those depend on what the GPU advertises,
// and CI's SwiftShader is not a GPU (00-start-here/H4-ASSET-PROOF.md).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Stage, guard, openGame, type Ctx, type StageResult } from './lib.ts';

interface MeshEntry {
  name: string;
  kind: 'mesh';
  triangles: number;
  draw_calls: number;
  textures: { name: string; width: number; height: number }[];
}
interface Budget {
  triangles: number;
  draw_calls: number;
}

/** three.js format constants -> names, for the Tier-2 record only. */
const FORMAT: Record<number, string> = {
  1023: 'RGBA (uncompressed)',
  33776: 'RGB_S3TC_DXT1',
  33777: 'RGBA_S3TC_DXT1',
  33779: 'RGBA_S3TC_DXT5',
  36196: 'RGB_ETC1',
  37492: 'RGB_ETC2',
  37496: 'RGBA_ETC2_EAC',
  37808: 'RGBA_ASTC_4x4',
  36492: 'RGBA_BPTC',
  35840: 'RGB_PVRTC_4BPPV1',
};

export async function assets(ctx: Ctx): Promise<StageResult> {
  const st = new Stage('assets');
  return guard(st, async () => {
    const manifest = JSON.parse(readFileSync(join(ctx.root, 'assets/dist/manifest.json'), 'utf8')) as { assets: (MeshEntry | { kind: 'primitive' })[] };
    const budgets = (JSON.parse(readFileSync(join(ctx.root, 'tools/assets/budgets.json'), 'utf8')) as { assets: Record<string, Budget> }).assets;
    const meshes = manifest.assets.filter((a): a is MeshEntry => a.kind === 'mesh');
    if (!st.check('manifest has mesh assets', meshes.length > 0, `${meshes.length}: ${meshes.map((m) => m.name).join(', ')}`)) return;
    const g = await openGame(ctx);
    try {
      const tier2: Record<string, unknown> = {};
      for (const m of meshes) {
        const b = budgets[m.name];
        const p = await g.page.evaluate((n) => window.__HARNESS__!.assetProbe(n), m.name);
        if (!st.check(`${m.name} loads (draco + ktx2)`, p.ok, p.ok ? `${p.materials.join(',')} · ${p.maps.length} map(s)` : (p.error ?? 'failed'))) continue;
        st.check(`${m.name} draw calls <= ${b?.draw_calls ?? '?'}`, !!b && p.calls <= b.draw_calls, `${p.calls} rendered alone (manifest ${m.draw_calls})`);
        st.check(`${m.name} triangles <= ${b?.triangles ?? '?'}`, !!b && p.triangles <= b.triangles, `${p.triangles} rendered (manifest ${m.triangles})`);
        const want = m.textures.map((t) => `${t.width}x${t.height}`).join(',');
        const got = p.maps.map((t) => `${t.width}x${t.height}`).join(',');
        st.check(`${m.name} textures at declared size`, want === got, `${got || 'none'} (manifest ${want || 'none'})`);
        st.check(`${m.name} unlit material`, p.materials.every((t) => t === 'MeshBasicMaterial'), p.materials.join(','));
        tier2[m.name] = {
          maps: p.maps.map((t) => ({ ...t, formatName: FORMAT[t.format] ?? `format ${t.format}` })),
          top: p.top,
          pixels: { ...p.pixels, nearPaletteShare: p.pixels.covered ? +(p.pixels.nearPalette / p.pixels.covered).toFixed(4) : 0 },
        };
        st.data['ktx2Support'] = p.ktx2;
      }
      st.data['tier2'] = tier2;
      const sup = st.data['ktx2Support'] as Record<string, boolean> | undefined;
      const fmt = Object.entries(tier2)
        .map(([n, t]) => `${n}: ${(t as { maps: { formatName: string }[] }).maps.map((x) => x.formatName).join(',')}`)
        .join(' · ');
      ctx.log(`    tier-2 (recorded, not asserted): ktx2 targets ${sup ? Object.entries(sup).filter(([, v]) => v).map(([k]) => k).join(',') || 'NONE' : '?'} · ${fmt}`);
      st.check('zero console errors', g.errors.length === 0, g.errors.slice(0, 5).join(' | ') || 'none');
    } finally {
      await g.close();
    }
  });
}
