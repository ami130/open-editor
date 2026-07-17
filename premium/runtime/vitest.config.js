import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // jsdom for the notice/gate DOM surface; the setup file grafts Node's
    // native WebCrypto onto the jsdom global (jsdom ships no crypto.subtle)
    // so the REAL ES256 verify path runs in the same environment.
    environment: 'jsdom',
    setupFiles: ['tests/setup.js'],
    include: ['tests/**/*.test.js'],
  },
});
