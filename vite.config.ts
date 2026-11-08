import { defineConfig, type Plugin } from 'vite';
import { readFileSync } from 'node:fs';
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

// __HARNESS__ is true ONLY for `vite build --mode harness` (tools/harness/run.mjs builds that
// into dist-harness/). Every other build gets `false`, so the whole test API is dead code and the
// minifier drops it — run.mjs greps the production bundle for the sentinel to prove it.
export default defineConfig(({ mode }) => ({
  plugins: [levelHotReload()],
  define: { __HARNESS__: JSON.stringify(mode === 'harness') },
  build: { target: 'es2022' },
}));
