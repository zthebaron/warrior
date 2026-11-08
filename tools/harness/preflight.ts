// Preflight — runs FIRST, every time. Proves the machine can run the game before any level is judged.
//   1. build the harness bundle (--mode harness) and the production bundle
//   2. production bundle must not contain the harness API (sentinel grep)
//   3. vite preview serves dist-harness over HTTP (never file:// — ES modules are CORS-blocked there)
//   4. Chromium launches with the pinned SwiftShader args
//   5. a WebGL2 context exists on about:blank (BEFORE the game loads, so a boot crash can never
//      masquerade as an environment problem) — unmasked renderer string goes in every report
//   6. the game page exposes window.__HARNESS__
// Any of 3-6 failing is HARNESS_ENVIRONMENT_FAILURE: a distinct class, never a level failure.

import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser } from '@playwright/test';
import { CHROMIUM_ARGS, FAILURE, Stage, VIEWPORT, type StageResult } from './lib.ts';

/** Strings that exist only inside the `__HARNESS__` block of src/main.ts. */
const HARNESS_SENTINELS = ['HARNESS_API_V1', 'releaseCamera', 'rendererInfo'];

export interface PreflightOut {
  result: StageResult;
  browser: Browser | null;
  server: ChildProcess | null;
  baseUrl: string;
  webglRenderer: string | null;
}

function vite(root: string, args: string[]): { ok: boolean; out: string } {
  const r = spawnSync(join(root, 'node_modules/.bin/vite'), args, { cwd: root, encoding: 'utf8' });
  return { ok: r.status === 0, out: `${r.stdout}${r.stderr}`.trim() };
}

function startPreview(root: string): Promise<{ server: ChildProcess; url: string }> {
  return new Promise((resolve, reject) => {
    // No pinned port: parallel jobs share this machine. Vite picks the next free one; we parse it.
    const server = spawn(join(root, 'node_modules/.bin/vite'), ['preview', '--outDir', 'dist-harness', '--host', '127.0.0.1', '--port', '4317'], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let buf = '';
    const timer = setTimeout(() => {
      server.kill();
      reject(new Error(`vite preview not ready after 20s. Output:\n${buf}`));
    }, 20000);
    const onData = (d: Buffer): void => {
      buf += d.toString();
      // eslint-disable-next-line no-control-regex
      const m = buf.replace(/\x1b\[[0-9;]*m/g, '').match(/http:\/\/127\.0\.0\.1:(\d+)/);
      if (m) {
        clearTimeout(timer);
        resolve({ server, url: `http://127.0.0.1:${m[1]}` });
      }
    };
    server.stdout?.on('data', onData);
    server.stderr?.on('data', onData);
    server.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`vite preview exited (${code}) before ready. Output:\n${buf}`));
    });
  });
}

export async function preflight(root: string, opts: { skipBuild: boolean }): Promise<PreflightOut> {
  const st = new Stage('preflight');
  const out: PreflightOut = { result: st.result(), browser: null, server: null, baseUrl: '', webglRenderer: null };
  const finish = (): PreflightOut => ({ ...out, result: st.result() });

  // 1-2. builds + strip check (BUILD_FAILURE class: the code is broken, not the machine)
  if (!opts.skipBuild) {
    const h = vite(root, ['build', '--mode', 'harness', '--outDir', 'dist-harness', '--emptyOutDir', '--logLevel', 'error']);
    if (!st.check('build harness bundle', h.ok, h.ok ? 'dist-harness/' : h.out.slice(-2000))) {
      st.failureClass = FAILURE.BUILD;
      return finish();
    }
    const p = vite(root, ['build', '--emptyOutDir', '--logLevel', 'error']);
    if (!st.check('build production bundle', p.ok, p.ok ? 'dist/' : p.out.slice(-2000))) {
      st.failureClass = FAILURE.BUILD;
      return finish();
    }
  }
  const bundle = (dir: string): string =>
    readdirSync(join(root, dir, 'assets'))
      .filter((f) => f.endsWith('.js'))
      .map((f) => readFileSync(join(root, dir, 'assets', f), 'utf8'))
      .join('\n');
  const prod = bundle('dist');
  const harness = bundle('dist-harness');
  const leaked = HARNESS_SENTINELS.filter((s) => prod.includes(s));
  const missing = HARNESS_SENTINELS.filter((s) => !harness.includes(s));
  if (!st.check('harness API stripped from production bundle', leaked.length === 0 && missing.length === 0,
    leaked.length ? `LEAKED into dist/: ${leaked.join(', ')}` : missing.length ? `sentinel missing from dist-harness/ (grep would be vacuous): ${missing.join(', ')}` : `0/${HARNESS_SENTINELS.length} sentinels in dist/, ${HARNESS_SENTINELS.length}/${HARNESS_SENTINELS.length} in dist-harness/`)) {
    st.failureClass = FAILURE.BUILD;
    return finish();
  }

  // 3-6. environment (HARNESS_ENVIRONMENT_FAILURE from here on)
  st.failureClass = FAILURE.ENVIRONMENT;
  try {
    const { server, url } = await startPreview(root);
    out.server = server;
    out.baseUrl = url;
    st.check('vite preview serving over HTTP', true, url);
  } catch (err) {
    st.check('vite preview serving over HTTP', false, String(err));
    return finish();
  }

  try {
    out.browser = await chromium.launch({ headless: true, args: CHROMIUM_ARGS });
    st.check('chromium launched with pinned args', true, `${out.browser.version()}  ${CHROMIUM_ARGS.join(' ')}`);
  } catch (err) {
    st.check('chromium launched with pinned args', false, String(err).slice(0, 500));
    return finish();
  }

  const blank = await out.browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const gl = await blank.evaluate(() => {
    const c = document.createElement('canvas');
    const ctx = c.getContext('webgl2');
    if (!ctx) return { webgl2: false, renderer: null as string | null };
    const dbg = ctx.getExtension('WEBGL_debug_renderer_info');
    return { webgl2: true, renderer: String(dbg ? ctx.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : ctx.getParameter(ctx.RENDERER)) };
  });
  await blank.close();
  out.webglRenderer = gl.renderer;
  if (!st.check('webgl2 context on about:blank', gl.webgl2, gl.webgl2 ? `renderer: ${gl.renderer}` : 'getContext("webgl2") returned null — no level was tested')) return finish();

  const page = await out.browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  try {
    await page.goto(`${out.baseUrl}/?harness=1`);
    await page.waitForFunction(() => window.__HARNESS__?.version === 'HARNESS_API_V1', null, { timeout: 20000 });
    st.check('harness API exposed with ?harness=1', true, 'HARNESS_API_V1');
  } catch (err) {
    st.check('harness API exposed with ?harness=1', false, String(err).slice(0, 500));
  } finally {
    await page.close();
  }
  return finish();
}
