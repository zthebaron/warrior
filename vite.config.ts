import { defineConfig, type Plugin } from 'vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { basename } from 'node:path';

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

// __HARNESS__ is true ONLY for `vite build --mode harness` (tools/harness/run.mjs builds that
// into dist-harness/). Every other build gets `false`, so the whole test API is dead code and the
// minifier drops it — run.mjs greps the production bundle for the sentinel to prove it.
export default defineConfig(({ mode }) => ({
  plugins: [levelHotReload(), threeDecoders()],
  define: { __HARNESS__: JSON.stringify(mode === 'harness') },
  build: { target: 'es2022' },
}));
