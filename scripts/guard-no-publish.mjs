#!/usr/bin/env node
/**
 * guard-no-publish.mjs — a `prepublishOnly` hard-stop for packages that must
 * NEVER reach the public npm registry (all premium plugins, the premium runtime,
 * the entitlements verifier, and the reserved toolbar/ui stubs).
 *
 * WHY: those packages are protected today ONLY by a single `"private": true`
 * line in each package.json. npm refuses to publish a private package — but if
 * someone ever flips or removes that one flag (intentionally or by mistake),
 * every plaintext premium source file would publish in one command. This script
 * is the belt-and-suspenders second layer: it runs on `prepublishOnly` and
 * ABORTS the publish, so an accidental flag flip cannot leak the source.
 *
 * `prepublishOnly` runs only during `npm publish` (not on install/pack/ci), and
 * npm skips it entirely while the package is still `private:true` — so this
 * costs nothing in normal use; it only bites the exact "private got removed and
 * someone tried to publish" case it exists to catch.
 *
 * DELIBERATE publish escape hatch (should essentially never be used for these
 * packages): set OE_ALLOW_PRIVATE_PUBLISH=1 in the environment. That makes the
 * block an explicit, auditable choice rather than a silent accident.
 */
const pkgName = process.env.npm_package_name || '(unknown package)';

if (process.env.OE_ALLOW_PRIVATE_PUBLISH === '1') {
  console.warn(
    `[guard-no-publish] OE_ALLOW_PRIVATE_PUBLISH=1 set — allowing publish of "${pkgName}". `
    + 'This bypasses the do-not-publish guard ON PURPOSE. If you did not mean to, abort now.',
  );
  process.exit(0);
}

console.error(
  `\n[guard-no-publish] BLOCKED: "${pkgName}" is a DO-NOT-PUBLISH package `
  + '(premium / entitlements / reserved).\n'
  + 'It must never reach the public npm registry — its source would leak.\n'
  + 'If npm ran this hook, the package is no longer private:true — restore '
  + '"private": true in its package.json.\n'
  + 'To publish deliberately anyway (almost never correct here), re-run with '
  + 'OE_ALLOW_PRIVATE_PUBLISH=1.\n',
);
process.exit(1);
