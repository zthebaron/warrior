import { defineConfig, type Plugin } from 'vite';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { basename, isAbsolute, relative } from 'node:path';

// Level hot-reload: when levels/<id>.json changes on disk, push its raw text to the client
// over the Vite websocket. The client re-validates and rebuilds without a page reload.
function levelHotReload(): Plugin {
  return {
    name: 'warrior-level-hot-reload',
    apply: 'serve',
    handleHotUpdate({ file, server }) {
      const norm = file.replace(/\\/g, '/');
      if (!norm.includes('/levels/') || !norm.endsWith('.json') || norm.endsWith('.schema.json')) return;
      const id = basename(norm, '.json');
      server.ws.send({ type: 'custom', event: 'level:changed', data: { id, text: readFileSync(file, 'utf8') } });
      return []; // handled — suppress the default full-page reload
    },
  };
}

// three's Draco + Basis decoders, served in dev and emitted into builds under /vendor/ straight
// from node_modules — always the pinned three's own decoders, and no binaries committed.
// src/loaders/assets.ts points DRACOLoader / KTX2Loader at these paths.
const THREE_LIBS = fileURLToPath(new URL('./node_modules/three/examples/jsm/libs/', import.meta.url));
const DECODERS: Record<string, string> = {
  'vendor/draco/draco_decoder.js': 'draco/gltf/draco_decoder.js',
  'vendor/draco/draco_decoder.wasm': 'draco/gltf/draco_decoder.wasm',
  'vendor/draco/draco_wasm_wrapper.js': 'draco/gltf/draco_wasm_wrapper.js',
  'vendor/basis/basis_transcoder.js': 'basis/basis_transcoder.js',
  'vendor/basis/basis_transcoder.wasm': 'basis/basis_transcoder.wasm',
};
function threeDecoders(): Plugin {
  return {
    name: 'warrior-three-decoders',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const key = (req.url ?? '').split('?')[0]!.replace(/^\//, '');
        const rel = DECODERS[key];
        if (!rel) return next();
        res.setHeader('Content-Type', key.endsWith('.wasm') ? 'application/wasm' : 'text/javascript');
        res.end(readFileSync(THREE_LIBS + rel));
      });
    },
    generateBundle() {
      for (const [fileName, rel] of Object.entries(DECODERS)) {
        this.emitFile({ type: 'asset', fileName, source: readFileSync(THREE_LIBS + rel) });
      }
    },
  };
}

// B-25: every file this build read from the repo (src/, levels/, assets/dist/, ...), with the sha256 of its
// bytes, emitted as build-inputs.json beside the bundle. tools/harness/preflight.ts re-hashes them on disk,
// so a bundle older than its source (`playtest --skip-build` after an edit) is a BUILD_FAILURE, not a
// silent run of old code. node_modules is pinned by the lockfile and is not listed.
export const BUILD_INPUTS_FILE = 'build-inputs.json';
function buildInputs(): Plugin {
  let root = '';
  return {
    name: 'warrior-build-inputs',
    apply: 'build',
    configResolved(c) { root = c.root; },
    generateBundle(_options, bundle) {
      const files: Record<string, string> = {};
      // D-022: what index.html and its CSS point at (the title paintings) is not a module, so it is listed from
      // the emitted assets' own source paths. Without this a repainted title would pass on an old bundle.
      for (const o of Object.values(bundle)) {
        if (o.type !== 'asset') continue;
        for (const src of o.originalFileNames ?? []) {
          const file = isAbsolute(src) ? src : `${root}/${src}`;
          const rel = relative(root, file).replace(/\\/g, '/');
          if (rel.startsWith('..') || rel.includes('node_modules/') || !existsSync(file) || !statSync(file).isFile()) continue;
          files[rel] = createHash('sha256').update(readFileSync(file)).digest('hex');
        }
      }
      for (const id of this.getModuleIds()) {
        if (id.startsWith('\0')) continue;
        const file = id.split('?')[0]!;
        if (!isAbsolute(file) || file.includes('/node_modules/') || !existsSync(file) || !statSync(file).isFile()) continue;
        const rel = relative(root, file).replace(/\\/g, '/');
        if (rel.startsWith('..')) continue;
        files[rel] = createHash('sha256').update(readFileSync(file)).digest('hex');
      }
      const config = fileURLToPath(import.meta.url);
      files[relative(root, config).replace(/\\/g, '/')] = createHash('sha256').update(readFileSync(config)).digest('hex');
      const sorted = Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)));
      this.emitFile({ type: 'asset', fileName: BUILD_INPUTS_FILE, source: JSON.stringify(sorted, null, 1) });
    },
  };
}

// __HARNESS__ is true ONLY for `vite build --mode harness` (tools/harness/run.mjs builds that
// into dist-harness/). Every other build gets `false`, so the whole test API is dead code and the
// minifier drops it — run.mjs greps the production bundle for the sentinel to prove it.
export default defineConfig(({ mode }) => ({
  plugins: [levelHotReload(), threeDecoders(), buildInputs()],
  define: { __HARNESS__: JSON.stringify(mode === 'harness') },
  build: { target: 'es2022' },
}));
