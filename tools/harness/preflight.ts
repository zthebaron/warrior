// Preflight — runs FIRST, every time. Proves the machine can run the game before any level is judged.
//   1. build the harness bundle (--mode harness) and the production bundle
//   2. production bundle must not contain the harness API (sentinel grep)
//   3. vite preview serves dist-harness over HTTP (never file:// — ES modules are CORS-blocked there)
//   4. Chromium launches with the pinned SwiftShader args
//   5. a WebGL2 context exists on about:blank (BEFORE the game loads, so a boot crash can never
//      masquerade as an environment problem) — unmasked renderer string goes in every report
//   6. the game page exposes window.__HARNESS__
//   2b. B-25: every file each bundle was built from (its build-inputs.json) still hashes the same on disk
//   7. B-24: the level files the bundle carries are byte-identical to levels/*.json on disk
// Any of 3-6 failing is HARNESS_ENVIRONMENT_FAILURE: a distinct class, never a level failure.
// 7 failing is BUILD_FAILURE: the bundle is stale (typically --skip-build after a level edit), so
// every result after it would judge the on-disk waypoints against the old geometry.

import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { chromium, type Browser } from '@playwright/test';
import { CHROMIUM_ARGS, FAILURE, Stage, VIEWPORT, type StageResult } from './lib.ts';

/**
 * B-24: every way the bundled level files differ from levels/ on disk, as one line each; empty when
 * they are identical. Compared as exact text, not mtime: a touched-but-unchanged file is not stale,
 * and an edit inside the same second is.
 */
export function levelBundleDiff(disk: Record<string, string>, bundled: Record<string, string>): string[] {
  const out: string[] = [];
  for (const id of Object.keys(disk).sort()) {
    const b = bundled[id];
    if (b === undefined) { out.push(`levels/${id}.json is on disk but not in the bundle`); continue; }
    const d = disk[id]!;
    if (b === d) continue;
    let i = 0;
    while (i < d.length && i < b.length && d[i] === b[i]) i++;
    const line = d.slice(0, i).split('\n').length;
    out.push(`levels/${id}.json differs from the bundled copy (first difference at line ${line}; disk ${d.length} bytes, bundle ${b.length})`);
  }
  for (const id of Object.keys(bundled).sort()) if (!(id in disk)) out.push(`levels/${id}.json is in the bundle but not on disk`);
  return out;
}

/**
 * B-25: every way `dir`'s bundle is older than the repo, one line each; empty when every file the build
 * read (vite.config.ts's build-inputs.json: src/, levels/, assets/dist/, the config) is byte-identical on
 * disk. A file the build never read cannot change what it plays, so a new, unimported file is not stale;
 * the import that would pull it in is an edit to a file that IS listed.
 */
export function buildInputsDiff(root: string, dir: string): string[] {
  const manifest = join(root, dir, 'build-inputs.json');
  if (!existsSync(manifest)) return [`${dir}/ has no build-inputs.json (built before B-25)`];
  const inputs = JSON.parse(readFileSync(manifest, 'utf8')) as Record<string, string>;
  const out: string[] = [];
  for (const [rel, sha] of Object.entries(inputs)) {
    const file = join(root, rel);
    if (!existsSync(file)) { out.push(`${rel} is gone from disk`); continue; }
    if (createHash('sha256').update(readFileSync(file)).digest('hex') !== sha) out.push(`${rel} changed`);
  }
  return out;
}

/** levels/*.json on disk (the schema excluded), keyed by file name, as src/loaders/level.ts globs them. */
export function diskLevelSources(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of readdirSync(join(root, 'levels'))) {
    if (f.endsWith('.json') && !f.endsWith('.schema.json')) out[f.slice(0, -'.json'.length)] = readFileSync(join(root, 'levels', f), 'utf8');
  }
  return out;
}

/** Strings that exist only inside the `__HARNESS__` block of src/main.ts. */
const HARNESS_SENTINELS = ['HARNESS_API_V1', 'releaseCamera', 'rendererInfo', 'TOUCH_PROBE_V1', 'breakControl'];

/** Chromium with the pinned SwiftShader args. One per browser stage (see run.mjs). */
export function launchBrowser(): Promise<Browser> {
  return chromium.launch({ headless: true, args: CHROMIUM_ARGS });
}

/** WebGL2 on about:blank, time-boxed: a wedged GPU process must report, not hang the run. */
export async function probeWebgl(browser: Browser, timeoutMs = 15000): Promise<{ webgl2: boolean; renderer: string | null; error: string }> {
  const run = async (): Promise<{ webgl2: boolean; renderer: string | null; error: string }> => {
    const blank = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    try {
      const gl = await blank.evaluate(() => {
        const c = document.createElement('canvas');
        const ctx = c.getContext('webgl2');
        if (!ctx) return { webgl2: false, renderer: null as string | null };
        const dbg = ctx.getExtension('WEBGL_debug_renderer_info');
        return { webgl2: true, renderer: String(dbg ? ctx.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : ctx.getParameter(ctx.RENDERER)) };
      });
      return { ...gl, error: gl.webgl2 ? '' : 'getContext("webgl2") returned null' };
    } finally {
      await blank.close().catch(() => {});
    }
  };
  const timeout = new Promise<{ webgl2: boolean; renderer: string | null; error: string }>((r) =>
    setTimeout(() => r({ webgl2: false, renderer: null, error: `webgl2 probe timed out after ${timeoutMs}ms (GPU process wedged?)` }), timeoutMs),
  );
  return Promise.race([run(), timeout]);
}

export interface PreflightOut {
  result: StageResult;
  browser: Browser | null;
  server: ChildProcess | null;
  baseUrl: string;
  webglRenderer: string | null;
}

function vite(root: string, args: string[]): { ok: boolean; out: string } {
  const r = spawnSync(join(root, 'node_modules/.bin/vite'), args, { cwd: root, encoding: 'utf8' });
  // r.error is set when the binary could not be spawned at all (e.g. a worktree with no node_modules):
  // say so, instead of printing `undefinedundefined` under BUILD_FAILURE.
  if (r.error) return { ok: false, out: `could not run ${join(root, 'node_modules/.bin/vite')}: ${r.error.message} (run npm ci in this checkout)` };
  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() };
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
  // 2b. B-25: both bundles must be built from the source on disk, or every check after this judges old code.
  for (const dir of ['dist-harness', 'dist']) {
    const diff = buildInputsDiff(root, dir);
    if (!st.check(`${dir}/ built from the source on disk`, diff.length === 0, diff.length === 0
      ? `every file the build read is byte-identical on disk`
      : `STALE BUNDLE — ${dir}/ was built from different source${opts.skipBuild ? ' (--skip-build reused it)' : ''}: ${diff.join('; ')}. Rebuild: run without --skip-build`)) {
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
    out.browser = await launchBrowser();
    st.check('chromium launched with pinned args', true, `${out.browser.version()}  ${CHROMIUM_ARGS.join(' ')}`);
  } catch (err) {
    st.check('chromium launched with pinned args', false, String(err).slice(0, 500));
    return finish();
  }

  const gl = await probeWebgl(out.browser);
  out.webglRenderer = gl.renderer;
  if (!st.check('webgl2 context on about:blank', gl.webgl2, gl.webgl2 ? `renderer: ${gl.renderer}` : `${gl.error} — no level was tested`)) return finish();

  const page = await out.browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  try {
    await page.goto(`${out.baseUrl}/?harness=1`);
    await page.waitForFunction(() => window.__HARNESS__?.version === 'HARNESS_API_V1', null, { timeout: 20000 });
    st.check('harness API exposed with ?harness=1', true, 'HARNESS_API_V1');
  } catch (err) {
    st.check('harness API exposed with ?harness=1', false, String(err).slice(0, 500));
    await page.close();
    return finish();
  }
  // 7. B-24: what the browser will actually play must be what is on disk. Its own try, so a throw here is
  //    reported under this check as BUILD, never re-labelled as the harness API missing (ENVIRONMENT).
  try {
    // A bundle built before B-24 has no levelSources: that is itself a stale bundle, not an environment fault.
    const bundled = await page.evaluate(() => (typeof window.__HARNESS__!.levelSources === 'function' ? window.__HARNESS__!.levelSources() : null));
    const diff = bundled ? levelBundleDiff(diskLevelSources(root), bundled) : ['the bundle has no levelSources() (built before B-24)'];
    if (!st.check('bundled levels match levels/ on disk', diff.length === 0, diff.length === 0
      ? `every levels/*.json byte-identical to dist-harness/`
      : `STALE BUNDLE — dist-harness/ was built from different level files${opts.skipBuild ? ' (--skip-build reused it)' : ''}: ${diff.join('; ')}. Rebuild: run without --skip-build`)) {
      st.failureClass = FAILURE.BUILD;
    }
  } catch (err) {
    st.check('bundled levels match levels/ on disk', false, `could not read the bundled levels: ${String(err).slice(0, 500)}`);
    st.failureClass = FAILURE.BUILD;
  } finally {
    await page.close();
  }
  return finish();
}
