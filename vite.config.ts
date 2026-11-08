import { defineConfig, type Plugin } from 'vite';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';

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

// Draco + Basis (KTX2) decoders for GLB assets. DRACOLoader / KTX2Loader take a DIRECTORY and
// append fixed filenames, so `?url` imports cannot express them. Serve three's own copies (version
// locked to the pinned three) at /decoders/ in dev, and emit them into every build's outDir.
const DECODERS: Record<string, string[]> = {
  draco: ['draco_decoder.js', 'draco_decoder.wasm', 'draco_wasm_wrapper.js'],
  basis: ['basis_transcoder.js', 'basis_transcoder.wasm'],
};
const decoderSrc = (dir: string, file: string): string =>
  fileURLToPath(new URL(`./node_modules/three/examples/jsm/libs/${dir === 'draco' ? 'draco/gltf' : dir}/${file}`, import.meta.url));

function assetDecoders(): Plugin {
  return {
    name: 'warrior-asset-decoders',
    configureServer(server) {
      server.middlewares.use('/decoders', (req, res, next) => {
        const [dir, file] = (req.url ?? '').split('?')[0]!.replace(/^\//, '').split('/');
        if (!dir || !file || !DECODERS[dir]?.includes(file)) return next();
        res.setHeader('Content-Type', file.endsWith('.wasm') ? 'application/wasm' : 'text/javascript');
        res.end(readFileSync(decoderSrc(dir, file)));
      });
    },
    generateBundle() {
      for (const [dir, files] of Object.entries(DECODERS))
        for (const file of files) this.emitFile({ type: 'asset', fileName: `decoders/${dir}/${file}`, source: readFileSync(decoderSrc(dir, file)) });
    },
  };
}

// __HARNESS__ is true ONLY for `vite build --mode harness` (tools/harness/run.mjs builds that
// into dist-harness/). Every other build gets `false`, so the whole test API is dead code and the
// minifier drops it — run.mjs greps the production bundle for the sentinel to prove it.
export default defineConfig(({ mode }) => ({
  plugins: [levelHotReload(), assetDecoders()],
  define: { __HARNESS__: JSON.stringify(mode === 'harness') },
  build: { target: 'es2022' },
}));
