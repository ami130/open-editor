/**
 * build-manifest.mjs — emit the per-version, per-plan FEATURE MANIFEST that the
 * delivery service needs (execution plan §1.1 → consumed by §1.2).
 *
 * WHAT PROBLEM THIS SOLVES (T14 / R25 — the silent one):
 * A licence stores its granted features as a SNAPSHOT taken at purchase time,
 * while the feature catalog is regenerated whenever the engine changes. Left
 * alone that breaks in both directions:
 *
 *   • v1.4.0 adds "table.merge"; a Pro licence snapshotted in January never
 *     receives it — a paying customer silently missing what they bought.
 *   • A customer pinned to v1.2.0 holds a licence granting "table.merge", but
 *     their build has no such feature — the token promises what cannot be given.
 *
 * The fix is an intersection, computed at session time:
 *
 *     granted = package.features  ∩  servedVersion.supportedFeatures
 *
 * The right-hand side is what this script produces. Without it that
 * intersection is not computable and T14 cannot be implemented at all.
 *
 * RELATIONSHIP TO THE BACKEND'S CATALOG (deliberately separate):
 *   open-editor-backend/scripts/sync-feature-catalog.mjs answers
 *     "what can an admin SELL?"           — one list, no version dimension
 *   this script answers
 *     "what does THIS BUILD support?"     — per version, per plan
 * Both derive from the same two engine catalogs, so the ids can never disagree
 * about meaning; they simply answer different questions.
 *
 * Run: node scripts/build-manifest.mjs
 * Emits: dist/delivery/manifest.json
 */
import { readFileSync, writeFileSync, existsSync, statSync } from 'fs';
import { createHash } from 'crypto';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const SRC = join(ROOT, 'src');
const OUT_DIR = join(ROOT, 'dist', 'delivery');

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));

// ── Source of truth: the engine's own catalogs ──────────────────────────────
const catalog = await import(
  pathToFileURL(join(SRC, 'entitlements', 'feature-catalog.js')).href
);
const premium = await import(
  pathToFileURL(join(SRC, 'entitlements', 'premium-plugins.js')).href
);

/** Every feature id the FREE build can gate — core editor + bundled plugins. */
function freeFeatureIds() {
  const ids = new Set();
  for (const f of catalog.EDITOR_FEATURES) ids.add(f.id);
  for (const f of catalog.PLUGIN_FEATURES) ids.add(f.id);
  return [...ids].sort();
}

/**
 * Premium feature ids actually present in the premium bundle.
 *
 * Read from BUNDLED_PREMIUM rather than from the premium/ directory listing:
 * that constant is what the engine really consults at runtime, so a package
 * present on disk but absent from BUNDLED_PREMIUM (deprecated `seo`/`ai`, the
 * `hello` fixture) correctly does NOT appear here. The manifest must describe
 * what the build can actually do, not what happens to exist in the repo.
 */
function premiumFeatureIds() {
  return [...new Set(premium.BUNDLED_PREMIUM.map((p) => p.featureId))].sort();
}

const free = freeFeatureIds();
const premiumOnly = premiumFeatureIds();

/**
 * Describe one built bundle so the backend can publish it.
 *
 * `publishBuild()` (backend §1.2) requires bundleSha256 and bundleBytes, and
 * WITHOUT THEM A BUILD CANNOT BE PUBLISHED AT ALL — there is no other producer
 * of those values. The hash is also what the loader verifies a downloaded
 * bundle against before decoding (§1.5), catching truncated downloads,
 * mangling proxies, and poisoned caches. So it is emitted here, at the only
 * point where the bytes and the feature list are known together.
 */
function describeBundle(plan, features) {
  const file = join(OUT_DIR, `${plan}.js`);
  // Guards the directory too: a missing OUT_DIR shows up here as a missing file.
  if (!existsSync(file)) {
    console.error(`\n[build-manifest] missing bundle: ${file}`);
    console.error('  Run the delivery build first: npx rollup -c rollup.delivery.config.js\n');
    process.exit(1);
  }
  const bytes = readFileSync(file);
  return {
    features,
    // Content hash of the exact artifact that will be served.
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes: statSync(file).size,
    // Object-storage key (T21). Version-scoped so a published version's bytes
    // are never overwritten — immutability is what makes rollback safe.
    bundleKey: `engine/${pkg.version}/${plan}.js`,
  };
}

// A premium build is a superset: everything free, plus the premium features.
const manifest = {
  version: pkg.version,
  generatedFrom: 'src/entitlements/{feature-catalog,premium-plugins}.js',
  plans: {
    free: describeBundle('free', free),
    premium: describeBundle('premium', [...new Set([...free, ...premiumOnly])].sort()),
  },
};

// ── Sanity checks — fail loud rather than emit a wrong manifest ─────────────
const problems = [];
if (free.length === 0) problems.push('free plan has zero features');
if (premiumOnly.length === 0) problems.push('premium plan adds zero features over free');
for (const id of premiumOnly) {
  if (free.includes(id)) problems.push(`premium id "${id}" is also in the free catalog (collision)`);
}

/**
 * The manifest claims premium features based on BUNDLED_PREMIUM, but the actual
 * premium BUNDLE is built from SHIPPED_PREMIUM in rollup.delivery.config.js.
 * If those two lists ever drift, the manifest would promise a feature the build
 * does not contain — a silent lie, and precisely the T14 failure mode this whole
 * artifact exists to prevent. Cross-check them here.
 */
const rollupConfig = readFileSync(join(ROOT, 'rollup.delivery.config.js'), 'utf-8');
for (const entry of premium.BUNDLED_PREMIUM) {
  // e.g. featureId 'export.pdf' → package '@openeditor-premium/export-pdf'
  const pkgName = `@openeditor-premium/${entry.featureId.replace(/^export\./, 'export-')}`;
  if (!rollupConfig.includes(pkgName)) {
    problems.push(
      `BUNDLED_PREMIUM lists "${entry.featureId}" but rollup.delivery.config.js `
      + `does not bundle "${pkgName}" — the manifest would promise a feature the `
      + 'premium build does not contain',
    );
  }
}
if (problems.length) {
  console.error('\n[build-manifest] REFUSING to emit a manifest:\n');
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error('');
  process.exit(1);
}


writeFileSync(join(OUT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
console.log(`\n[build-manifest] v${manifest.version}`);
for (const [plan, d] of Object.entries(manifest.plans)) {
  console.log(`  ${plan.padEnd(8)} ${String(d.features.length).padStart(3)} features  ${kb(d.bytes).padStart(9)}  ${d.sha256.slice(0, 12)}…`);
}
console.log(`  premium adds: ${premiumOnly.join(', ')}`);
console.log(`  → dist/delivery/manifest.json\n`);
