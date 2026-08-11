import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // jsdom for the DOM-touching parts (the degraded fallback). The network and
    // hashing logic is environment-agnostic; anything genuinely browser-specific
    // — blob: import, CSP, IndexedDB transaction semantics — is proven by the
    // Playwright run instead, because a jsdom stub would prove nothing there.
    environment: 'jsdom',
    include: ['tests/**/*.test.js', 'tests/**/*.test.jsx'],
  },
});
