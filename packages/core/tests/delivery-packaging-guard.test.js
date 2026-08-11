/**
 * delivery-packaging-guard.test.js — §1.1 build gate, permanent regression guard.
 *
 * THE RISK (R38, and a near-miss caught during §1.1): the delivery build writes
 * dist/delivery/premium.js with premium source COMPILED IN. package.json declares
 * `files: ["dist", ...]`, which pulls in EVERYTHING under dist/ — so the premium
 * bundle would have shipped to npm, handing closed-source premium code to every
 * free installer. That is the exact leak the whole delivery architecture exists
 * to prevent.
 *
 * It was fixed with a `"!dist/delivery"` negation in `files`. Note that an
 * .npmignore does NOT work here: npm ignores .npmignore entirely when `files` is
 * declared (verified with `npm pack --dry-run`).
 *
 * This test locks that fix in place so a future packaging change cannot silently
 * undo it. It reads package.json rather than shelling out to `npm pack`, so it
 * stays fast and needs no built artifacts.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(HERE, '..', 'package.json'), 'utf-8'));

describe('delivery bundles must never ship to npm', () => {
  it('package.json `files` excludes dist/delivery', () => {
    const files = pkg.files || [];
    // Accept any negation form npm honours for this directory.
    const excluded = files.some((f) => /^!dist\/delivery\/?$/.test(f)
      || /^!dist\/delivery\/\*+$/.test(f));
    expect(
      excluded,
      'package.json "files" must contain "!dist/delivery" — without it the '
      + 'premium bundle (premium source compiled in) ships to npm. An .npmignore '
      + 'does NOT work when "files" is declared.',
    ).toBe(true);
  });

  it('`files` still includes dist (the negation must not exclude everything)', () => {
    expect(pkg.files).toContain('dist');
  });

  it('the delivery build is a separate script, not part of `build`', () => {
    // `build` and `prepack`/`prepublishOnly` must NOT produce dist/delivery —
    // publishing should never even create the premium bundle.
    for (const key of ['build', 'prepack', 'prepublishOnly']) {
      expect(
        pkg.scripts[key] || '',
        `"${key}" must not run the delivery build`,
      ).not.toContain('rollup.delivery.config.js');
    }
    expect(pkg.scripts['build:delivery']).toContain('rollup.delivery.config.js');
  });

  it('the delivery build runs bundle verification', () => {
    // A delivery build that skips verify-bundles.mjs could ship a premium
    // bundle with no premium in it, or a free bundle containing premium.
    expect(pkg.scripts['build:delivery']).toContain('verify-bundles.mjs');
  });
});
