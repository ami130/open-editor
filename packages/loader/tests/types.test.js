/**
 * types.test.js — the TypeScript declarations must COMPILE, in the unit gate.
 *
 * Mirrors the core package's approach: `tests/types/consumer.ts` never runs, it
 * only has to typecheck under `--strict`. Running it here means a declaration
 * that drifts from the implementation fails the ordinary test run rather than
 * being discovered by a customer's build.
 *
 * The claim being defended is T16: engine options reach the loader WITHOUT
 * being re-declared, so adding an engine option never needs a loader release
 * for TypeScript users to see it. consumer.ts sets several editor-only options,
 * and they compile solely because LoaderOptions extends OpenEditorConfig.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const project = join(here, 'types', 'tsconfig.json');
// TypeScript is a devDependency of the core package; pnpm keeps it there rather
// than at the workspace root.
const tsc = join(here, '..', '..', 'core', 'node_modules', '.bin', 'tsc');

describe('TypeScript declarations', () => {
  it('compile under --strict against the real core types', () => {
    if (!existsSync(tsc)) {
      // Never silently pass: an absent compiler must be visible, not mistaken
      // for a green check.
      throw new Error(`tsc not found at ${tsc} — run pnpm install`);
    }
    let output = '';
    try {
      execFileSync(tsc, ['-p', project], { encoding: 'utf-8' });
    } catch (err) {
      output = `${err.stdout || ''}${err.stderr || ''}`;
    }
    expect(output).toBe('');
  }, 120_000);
});
