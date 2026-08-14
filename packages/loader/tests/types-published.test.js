/**
 * types-published.test.js — the declarations must compile FROM A PACKED
 * TARBALL, not from the workspace.
 *
 * ─── WHY THIS EXISTS (a real bug that shipped in 2.0.0) ──────────────────────
 * `tests/types.test.js` compiles `tests/types/consumer.ts` inside the monorepo,
 * where `openeditor-text-engine` is a `workspace:*` devDependency. So
 * `index.d.ts`'s bare `import ... from 'openeditor-text-engine'` resolved
 * through node_modules and the suite was green.
 *
 * On a PUBLISHED install that devDependency does not exist. The engine's types
 * ship vendored, as an ambient `declare module` in
 * `openeditor-text-engine.d.ts` — and an ambient declaration is only loaded if
 * some file references it. Nothing did. Installed from npm the import was
 * TS2307, `OpenEditorConfig` became `any`, and `LoaderOptions extends
 * OpenEditorConfig` silently collapsed to `LoaderOnlyOptions` — so every real
 * editor option (`minHeight`, `placeholder`, `theme`, `toolbar`, …) was
 * rejected as an unknown property, and both wrapper entrypoints failed too.
 *
 * The workspace test could not have caught it: it passed for a reason that
 * disappears at publish time. Only compiling what npm actually delivers can.
 *
 * ─── WHAT IT DOES ───────────────────────────────────────────────────────────
 * `npm pack` → install the tarball into a temp dir → `tsc --strict` against it.
 * Slower than the sibling test, hence a generous timeout; it is the only thing
 * standing between a packaging regression and a customer's build.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, '..');
const tsc = join(here, '..', '..', 'core', 'node_modules', '.bin', 'tsc');

/**
 * Exercises the surface a customer actually touches:
 *  • a loader option and an ENGINE option in the same call — the intersection
 *    that broke;
 *  • engine types imported by name from 'openeditor-text', which is the only
 *    name a consumer can write (the engine package is private);
 *  • a @ts-expect-error on a bogus option. This one matters: if the types
 *    degraded to `any` again, the bogus option would be ACCEPTED, the
 *    expect-error would become unused, and tsc would fail. It is what stops
 *    this test passing vacuously.
 */
const CONSUMER = `
import { createEditor, openSession, fetchEngine } from 'openeditor-text';
import type { OpenEditor, OpenEditorConfig, OpenEditorTheme, LoaderOptions } from 'openeditor-text';

const theme: OpenEditorTheme = 'dark';
const cfg: OpenEditorConfig = { placeholder: 'write…', minHeight: 320, theme };

const opts: LoaderOptions = { endpoint: 'https://d.example', ...cfg, plugins: 'all' };
async function mount(): Promise<OpenEditor> { return createEditor('#host', opts); }

// engine option + loader option together — the exact shape that regressed
void createEditor('#host', { endpoint: 'https://d.example', minHeight: 320 });
void mount; void openSession; void fetchEngine;

// @ts-expect-error unknown option must still be rejected
void createEditor('#host', { endpoint: 'https://d.example', definitelyNotAnOption: true });
`;

const TSCONFIG = JSON.stringify({
  compilerOptions: {
    strict: true,
    module: 'esnext',
    moduleResolution: 'bundler',
    target: 'es2022',
    noEmit: true,
    // NOT skipped: the whole point is to typecheck the shipped .d.ts files.
    skipLibCheck: false,
    types: [],
  },
  files: ['consumer.ts'],
});

describe('published package types', () => {
  it('compile under --strict from a packed tarball, with no workspace links', () => {
    if (!existsSync(tsc)) {
      throw new Error(`tsc not found at ${tsc} — run pnpm install`);
    }

    const dir = mkdtempSync(join(tmpdir(), 'oe-loader-types-'));
    try {
      // Pack exactly what publish would send.
      execFileSync('npm', ['pack', '--pack-destination', dir], {
        cwd: pkgRoot, encoding: 'utf-8', stdio: 'pipe',
      });
      const tgz = readdirSync(dir).find((f) => f.endsWith('.tgz'));
      if (!tgz) throw new Error('npm pack produced no tarball');

      writeFileSync(join(dir, 'package.json'), JSON.stringify({
        name: 'oe-types-probe', version: '1.0.0', private: true,
      }));
      writeFileSync(join(dir, 'consumer.ts'), CONSUMER);
      writeFileSync(join(dir, 'tsconfig.json'), TSCONFIG);

      // No workspace resolution: a plain install of the tarball alone, which is
      // what makes this test able to see what the sibling test cannot.
      execFileSync('npm', ['install', '--no-audit', '--no-fund', join(dir, tgz)], {
        cwd: dir, encoding: 'utf-8', stdio: 'pipe',
      });

      let output = '';
      try {
        execFileSync(tsc, ['-p', join(dir, 'tsconfig.json')], { encoding: 'utf-8' });
      } catch (err) {
        output = `${err.stdout || ''}${err.stderr || ''}`;
      }
      expect(output).toBe('');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 300_000);
});
