#!/usr/bin/env node
/**
 * build-premium.mjs — produce a MINIFIED dist/ for every premium package so the
 * paid code is not shipped as plaintext source (Phase 0b).
 *
 * WHY a shared root script (not per-package rollup configs): the premium
 * packages currently ship raw `src/` (`files:["src"]`) and are consumed INSIDE
 * the monorepo by deep relative `../src/...` imports AND by workspace name
 * (`@openeditor-premium/runtime`). We must NOT disturb that in-repo resolution
 * (it would break the playground + every premium test). So:
 *   • `src/` stays the in-repo entry (dev/tests/playground unchanged).
 *   • this script emits a minified `dist/` per package.
 *   • each package's `publishConfig` repoints main/module/exports to `dist`
 *     ONLY at publish time (npm applies publishConfig only on publish), so the
 *     published tarball is minified while local resolution stays on `src`.
 *
 * IMPORTANT (§0 honesty): minified ≠ obfuscated ≠ protected. This only deters
 * casual copy-paste; the logic is fully recoverable by a beautifier. The real
 * protections are the fail-closed gate (0c) and server-side AI — not this.
 *
 * Externals: @openeditor-premium/* and @openeditors/* are separate packages and
 * are NEVER inlined into a premium bundle (keeps the boundary + avoids dup).
 */
import { rollup } from 'rollup';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
// terser plugin lives as core's devDep; resolve it from there.
const coreRequire = createRequire(resolve(ROOT, 'packages/core/package.json'));
const terser = coreRequire('@rollup/plugin-terser').default || coreRequire('@rollup/plugin-terser');

// package dir → the entry files to build (mirrors each package's exports).
const TARGETS = [
  { dir: 'premium/ai', entries: { index: 'src/index.js' } },
  { dir: 'premium/export-docx', entries: { index: 'src/index.js' } },
  { dir: 'premium/export-pdf', entries: { index: 'src/index.js' } },
  { dir: 'premium/seo', entries: { index: 'src/index.js', analyze: 'src/analyze.js' } },
  { dir: 'premium/runtime', entries: { index: 'src/index.js' } },
  { dir: 'premium/hello', entries: { index: 'src/index.js' } },
];

// Do not inline sibling premium/entitlements packages into a bundle.
const isExternal = (id) =>
  id.startsWith('@openeditor-premium/') || id.startsWith('@openeditors/');

async function buildEntry(pkgDir, name, entryRel) {
  const pkgPath = resolve(ROOT, pkgDir);
  const version = JSON.parse(readFileSync(resolve(pkgPath, 'package.json'), 'utf8')).version;
  const banner = `/*! ${pkgDir.split('/').pop()} v${version} — minified (source-available-minimum). MIT-adjacent premium. */`;
  const bundle = await rollup({
    input: resolve(pkgPath, entryRel),
    external: isExternal,
    plugins: [terser()],
  });
  await bundle.write({
    file: resolve(pkgPath, `dist/${name}.min.js`),
    format: 'es',
    banner,
    sourcemap: false,
  });
  await bundle.close();
  return `${pkgDir}/dist/${name}.min.js`;
}

let count = 0;
for (const t of TARGETS) {
  for (const [name, entry] of Object.entries(t.entries)) {
    const out = await buildEntry(t.dir, name, entry);
    console.log(`built ${out}`);
    count++;
  }
}
console.log(`\nMinified ${count} premium bundle(s) across ${TARGETS.length} packages.`);
