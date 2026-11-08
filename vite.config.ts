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

export default defineConfig({
  plugins: [levelHotReload()],
  build: { target: 'es2022' },
});
