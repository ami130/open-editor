import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Node environment: the verifier uses globalThis.crypto.subtle (WebCrypto),
    // which Node ≥18 provides natively and jsdom does not. The same API runs in
    // the browser at the project's support floor — see PHASE-22-DESIGN.md.
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
});
