import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Unit-test the ControlValueAccessor LOGIC of the standalone component by
  // driving the class directly against a mock editor — no TestBed, no Angular
  // runtime (matching the wrapper's minimal-footprint posture). esbuild strips
  // the TS decorators; they carry no runtime behaviour we assert on. The full
  // AOT + live-drive proof lives in the Phase 18.5 consumer app.
  esbuild: {
    target: 'es2022',
    tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
  },
});
