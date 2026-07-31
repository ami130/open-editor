/**
 * publish-guard.test.js — Phase 0a regression guard.
 *
 * `scripts/guard-no-publish.mjs` is the last line of defense against leaking
 * paid/premium source: it runs on `prepublishOnly` and ABORTS a publish unless
 * an explicit override env var is set. That guard protects nothing if its own
 * behavior is never pinned — a refactor could silently invert the exit code or
 * drop a package from coverage. These tests lock BOTH:
 *   (1) the script blocks by default (exit 1) and allows only under the
 *       explicit OE_ALLOW_PRIVATE_PUBLISH=1 override (exit 0), and
 *   (2) EVERY private:true package in the workspace actually wires the guard
 *       into its `prepublishOnly` hook (no package silently uncovered).
 *
 * NOTE (documented limitation, not tested because it's inherent): npm skips
 * `prepublishOnly` for a still-private package and under `--ignore-scripts`.
 * The guard is defense-in-depth; the primary wall is `private:true`. See the
 * script header.
 */
import { describe, it, expect } from 'vitest';
import * as childProc from 'node:child_process';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../../..');            // open-editor/
const GUARD = resolve(REPO, 'scripts/guard-no-publish.mjs');

/** Run the guard as a child process, capturing BOTH stdout and stderr (the
 *  guard writes its block message to stderr and its allow-warning to stderr,
 *  so we must capture both regardless of exit code). execFileSync returns only
 *  stdout on success, so we buffer stderr via a temp file... simpler: use the
 *  spawnSync-equivalent by letting execFileSync throw only on non-zero and
 *  reading e.stdout/e.stderr; on zero exit, capture stderr by running with a
 *  merged stream through `sh -c '... 2>&1'` is unportable on Windows, so we
 *  read both pipes directly via spawnSync. */
function runGuard(env = {}) {
  // Use spawnSync so we always get both stdout AND stderr, on any exit code.
  const { spawnSync } = childProc;
  const r = spawnSync('node', [GUARD], {
    env: { ...process.env, npm_package_name: '@test/pkg', ...env },
    encoding: 'utf8',
  });
  return { code: r.status ?? 1, out: `${r.stdout || ''}${r.stderr || ''}` };
}

describe('publish guard — behavior', () => {
  it('the guard script exists', () => {
    expect(existsSync(GUARD)).toBe(true);
  });

  it('BLOCKS by default (exit 1) with a clear message', () => {
    const r = runGuard();
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/BLOCKED/i);
  });

  it('ALLOWS only under the explicit OE_ALLOW_PRIVATE_PUBLISH=1 override (exit 0, loud warning)', () => {
    const r = runGuard({ OE_ALLOW_PRIVATE_PUBLISH: '1' });
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/OE_ALLOW_PRIVATE_PUBLISH/);
  });

  it('does NOT treat an arbitrary/empty override value as permission', () => {
    expect(runGuard({ OE_ALLOW_PRIVATE_PUBLISH: '' }).code).toBe(1);
    expect(runGuard({ OE_ALLOW_PRIVATE_PUBLISH: 'true' }).code).toBe(1); // only exactly '1' allows
    expect(runGuard({ OE_ALLOW_PRIVATE_PUBLISH: '0' }).code).toBe(1);
  });
});

describe('publish guard — coverage (every private package is wired)', () => {
  // Enumerate every workspace package under packages/* and premium/*.
  function allPackageJsons() {
    const roots = ['packages', 'premium'];
    const found = [];
    for (const root of roots) {
      const base = resolve(REPO, root);
      if (!existsSync(base)) continue;
      for (const name of readdirSync(base)) {
        const pj = resolve(base, name, 'package.json');
        if (existsSync(pj)) found.push({ dir: `${root}/${name}`, pj });
      }
    }
    return found;
  }

  it('every private:true package invokes guard-no-publish in prepublishOnly', () => {
    const uncovered = [];
    for (const { dir, pj } of allPackageJsons()) {
      const p = JSON.parse(readFileSync(pj, 'utf8'));
      if (p.private !== true) continue;                     // public packages are fine
      const hook = p.scripts && p.scripts.prepublishOnly;
      if (!hook || !/guard-no-publish/.test(hook)) uncovered.push(`${dir} (${p.name})`);
    }
    expect(uncovered, `private packages NOT wired to the publish guard: ${uncovered.join(', ')}`).toEqual([]);
  });

  it('finds the expected set of guarded private packages (sanity: not zero)', () => {
    const guarded = allPackageJsons()
      .map(({ pj }) => JSON.parse(readFileSync(pj, 'utf8')))
      .filter((p) => p.private === true && p.scripts && /guard-no-publish/.test(p.scripts.prepublishOnly || ''));
    // 6 premium + entitlements + toolbar + ui = 9 today; assert the floor so a
    // dropped package is caught without making the test brittle to additions.
    expect(guarded.length).toBeGreaterThanOrEqual(9);
  });
});
