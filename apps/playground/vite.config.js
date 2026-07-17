import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'url';

export default defineConfig({
  server: {
    port: 5173,
    open: true,
  },
  resolve: {
    alias: {
      'openeditor-text': fileURLToPath(new URL('../../packages/core/src/index.js', import.meta.url)),
    },
  },
});
