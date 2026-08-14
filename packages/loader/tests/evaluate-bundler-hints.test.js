/**
 * evaluate-bundler-hints.test.js — the dynamic import must keep BOTH bundler
 * opt-out comments.
 *
 * ─── THE BUG THIS LOCKS DOWN ────────────────────────────────────────────────
 * `evaluate.js` imports a blob: URL built from bytes fetched at runtime. That
 * is a dynamic import expression, so bundlers try to resolve it at BUILD time,
 * and each one needs its own opt-out comment:
 *
 *   @vite-ignore          Vite / Rollup
 *   webpackIgnore: true   webpack — and Turbopack, which honours it
 *
 * Only `@vite-ignore` was present. Under Turbopack (the Next.js 16 default) the
 * call was rewritten and the editor died with "Cannot find module as expression
 * is too dynamic" — after the session resolved, the bundle downloaded and the
 * SHA-256 verified, so every other signal looked healthy and only a browser
 * could see it.
 *
 * ─── WHY THIS TEST IS A SOURCE-TEXT ASSERTION ───────────────────────────────
 * Normally a poor choice. Here it is the only honest one: the failure exists
 * exclusively inside a third-party bundler's build step, so no amount of
 * running this code in vitest can reproduce it. The realistic regression is
 * someone tidying "redundant" comments, and that is exactly what this catches.
 * The real proof stays a browser run against a production Next.js build.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '..', 'src', 'evaluate.js'), 'utf-8');

/** The default importer — the line whose comments must survive. */
const importerLine = source
  .split('\n')
  .find((l) => l.includes('import(') && !l.trim().startsWith('*'));

describe('evaluate.js bundler hints', () => {
  it('has a default dynamic importer', () => {
    expect(importerLine, 'no dynamic import() found in evaluate.js').toBeTruthy();
  });

  it('keeps @vite-ignore (Vite/Rollup consumers)', () => {
    expect(importerLine).toContain('@vite-ignore');
  });

  it('keeps webpackIgnore (webpack AND Turbopack consumers)', () => {
    // Dropping this is what broke every Next.js 16 consumer.
    expect(importerLine).toContain('webpackIgnore: true');
  });

  it('does not reach for new Function / eval to dodge the bundler', () => {
    // That also works, but it requires 'unsafe-eval' — which evaluate.js's own
    // CSP table is explicit about never needing. The magic comments are enough.
    expect(source).not.toMatch(/new Function\s*\(\s*['"]u['"]/);
    expect(source).not.toMatch(/\beval\s*\(/);
  });

  it('still lets a caller override the importer', () => {
    // The override is how a host works around a bundler we have not met yet.
    expect(source).toMatch(/importImpl\s*=/);
  });
});
