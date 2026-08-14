/**
 * verify-bundles.mjs — build gate for the delivered bundles (execution plan
 * §1.1, risk R38).
 *
 * WHY THIS EXISTS: the free/premium split is enforced by rollup config, and a
 * config can be wrong in a way that produces a *plausible-looking* build. On the
 * very first run of rollup.delivery.config.js both bundles came out byte-for-byte
 * the same size because rollup silently treated the premium packages as external
 * — no error, no warning that mattered, just a premium bundle with no premium in
 * it. Shipping that would have meant paying customers receiving the free engine.
 *
 * So this asserts against the BUILT ARTIFACT, never the config:
 *
 *   1. Premium implementation is ABSENT from free.js   (the money assertion)
 *   2. Premium implementation is PRESENT in premium.js (catches silent-external)
 *   3. The two bundles genuinely differ
 *   4. Both parse as valid ESM
 *
 * Run: node scripts/verify-bundles.mjs   (exits non-zero on any failure)
 */
import { readFileSync, existsSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = join(HERE, '..', 'dist', 'delivery');

const FREE = join(DIST, 'free.js');
const PREMIUM = join(DIST, 'premium.js');

/**
 * Identifiers that only exist inside premium IMPLEMENTATION code.
 *
 * Deliberately NOT `rawExportPdfSpec` / `rawExportDocxSpec`: those names appear
 * in the free bundle too, as the property access inside the dynamic-import
 * loader stub (`.then(m => m.rawExportPdfSpec)`). That is correct and expected —
 * the stub is how a free build reaches premium when it is licensed. Asserting on
 * them would produce a false failure.
 *
 * These are function/event names that exist only in the premium sources.
 */
const PREMIUM_ONLY = [
  'exportPdfBlocked',   // premium/export-pdf — emitted event name
  'buildDocxBytes',     // premium/export-docx — public API
  'exportDocxFailed',   // premium/export-docx — emitted event name
];

const fail = [];
const ok = [];
/**
 * Non-fatal findings. Used where a condition is legitimate in development but
 * wrong for a release — a keyless build being the case in point: fine locally,
 * a silent premium outage in production.
 */
const warnings = [];
const warn = (m) => warnings.push(m);

function check(condition, message) {
  (condition ? ok : fail).push(message);
}

// ── Files exist ─────────────────────────────────────────────────────────────
for (const [name, path] of [['free', FREE], ['premium', PREMIUM]]) {
  if (!existsSync(path)) {
    console.error(`\n✗ ${name} bundle missing: ${path}`);
    console.error('  Run: npx rollup -c rollup.delivery.config.js\n');
    process.exit(1);
  }
}

const free = readFileSync(FREE, 'utf-8');
const premium = readFileSync(PREMIUM, 'utf-8');

// ── 1. Premium implementation absent from FREE (the assertion that matters) ──
for (const id of PREMIUM_ONLY) {
  check(
    !free.includes(id),
    `free.js does NOT contain premium identifier "${id}"`,
  );
}

// ── 2. Premium implementation present in PREMIUM (catches silent-external) ──
for (const id of PREMIUM_ONLY) {
  check(
    premium.includes(id),
    `premium.js DOES contain premium identifier "${id}"`,
  );
}

// ── 3. The bundles genuinely differ ─────────────────────────────────────────
check(free !== premium, 'free.js and premium.js are different builds');
check(
  statSync(PREMIUM).size > statSync(FREE).size,
  'premium.js is larger than free.js (premium code adds weight)',
);

// ── 4. Both are non-trivial and look like ESM ───────────────────────────────
for (const [name, src] of [['free', free], ['premium', premium]]) {
  check(src.length > 100_000, `${name}.js is a full bundle, not a stub`);
  check(/\bexport\s*\{/.test(src), `${name}.js has ESM exports`);
}

// ── 4b. The licence KEYRING is embedded (§1.5 / B1) ─────────────────────────
// The engine verifies licences OFFLINE against the `licenseKeys` default baked
// in at build time. Ship without it and a paying customer downloads the full
// premium engine, then the editor refuses to activate any of it — no error, no
// crash, just a free editor. Proven in a real browser:
//   no keyring → export.pdf false | keyring → export.pdf true
//
// A keyless build is LEGITIMATE for local development, so this is only fatal
// when a keyring was requested — otherwise it warns, loudly.
//
// ⚠️ THAT WARNING WAS NOT ENOUGH, AND A REAL RELEASE SHIPPED WITHOUT A KEYRING.
// The trap is that "was a keyring requested?" was inferred from the very
// variable you forget: no DELIVERY_LICENSE_KEYS meant no check, so the build
// went green, uploaded, and served `keyring:n=[]` to every customer. A licence
// then failed to verify in the browser and the editor silently fell back to
// free — the paying customer saw no PDF/DOCX button and no error anywhere.
//
// So intent is now declared INDEPENDENTLY of the key material: set
// DELIVERY_RELEASE=1 for anything customers will download, and a missing
// keyring is fatal. Local builds are unaffected and still just warn.
{
  const wanted = (process.env.DELIVERY_LICENSE_KEYS || '').trim();
  const isRelease = /^(1|true|yes)$/i.test((process.env.DELIVERY_RELEASE || '').trim());
  for (const [name, src] of [['free', free], ['premium', premium]]) {
    // Terser strips quotes from object keys, so match the compiled shape.
    const hasKeyring = /licenseKeys:\[\{kid:/.test(src);
    if (wanted || isRelease) {
      check(hasKeyring, `${name}.js has the licence keyring embedded`);
    } else if (!hasKeyring) {
      warn(
        `${name}.js ships with an EMPTY keyring — premium licences cannot be `
        + 'verified. Set DELIVERY_LICENSE_KEYS before a release build.',
      );
    }
    // Never, under any circumstances, ship private key material.
    check(
      !/"d":|,d:"/.test(src.slice(0, src.indexOf('licenseKeys') + 400)),
      `${name}.js keyring carries NO private key component`,
    );
  }
}

// ── 5. The manifest exists and is coherent ──────────────────────────────────
// §1.2's feature intersection (granted = package.features ∩ version.features)
// is only as trustworthy as this file. A missing or malformed manifest must
// fail the build, not be discovered at session time.
const MANIFEST = join(DIST, 'manifest.json');
if (!existsSync(MANIFEST)) {
  console.error(`\n✗ manifest missing: ${MANIFEST}`);
  console.error('  Run: node scripts/build-manifest.mjs\n');
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(MANIFEST, 'utf-8'));
check(typeof manifest.version === 'string' && manifest.version.length > 0,
  'manifest declares a version');
check(Array.isArray(manifest.plans?.free?.features) && manifest.plans.free.features.length > 0,
  'manifest lists free features');
check(Array.isArray(manifest.plans?.premium?.features)
  && manifest.plans.premium.features.length > manifest.plans.free.features.length,
  'manifest premium features are a strict superset of free');
// Every free feature must also be in premium — premium is free-plus, never a
// different set. A violation would mean upgrading LOSES a feature.
check(manifest.plans.free.features.every((f) => manifest.plans.premium.features.includes(f)),
  'every free feature is also present in premium (upgrading never removes a feature)');

// ── Report ──────────────────────────────────────────────────────────────────
const kb = (p) => (statSync(p).size / 1024).toFixed(1);
console.log(`\n  free.js     ${kb(FREE)} KB`);
console.log(`  premium.js  ${kb(PREMIUM)} KB  (+${(kb(PREMIUM) - kb(FREE)).toFixed(1)} KB)\n`);

for (const m of ok) console.log(`  ✓ ${m}`);
for (const m of warnings) console.warn(`  ⚠ ${m}`);
if (fail.length) {
  console.error('\n  BUNDLE VERIFICATION FAILED:\n');
  for (const m of fail) console.error(`  ✗ ${m}`);
  console.error('\n  A failure here means the free/premium split is broken.');
  console.error('  Do NOT publish these bundles.\n');
  process.exit(1);
}
console.log(`\n  All ${ok.length} checks passed.\n`);
