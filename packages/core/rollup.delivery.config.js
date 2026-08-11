/**
 * rollup.delivery.config.js — builds the RUNTIME-DELIVERED engine bundles
 * (execution plan §1.1). Separate from rollup.config.js, which keeps building
 * the npm package unchanged during migration.
 *
 * Produces exactly two self-contained bundles per version:
 *
 *   dist/delivery/free.js      premium EXCLUDED (external, as today)
 *   dist/delivery/premium.js   premium COMPILED IN  ← the inverse of today
 *
 * WHY TWO BUNDLES, NOT ONE WITH FLAGS: a feature flag can be flipped in the
 * browser. A free customer must never receive premium code at all — so the
 * separation is physical, and scripts/verify-bundles.mjs asserts it against the
 * built artifact rather than trusting this config.
 *
 * WHY ONE FORMAT: the delivered bundle is fetched and evaluated by the loader,
 * which is ESM. The npm package's four outputs (esm tree / esm.min / cjs / umd)
 * stay in rollup.config.js for the npm consumers that need them.
 *
 * CSS: none is emitted here, deliberately. Every style module funnels through
 * injectStyleOnce() (src/utils/inject-style.js), which adopts a constructable
 * stylesheet at runtime on mount. The delivered engine therefore styles itself
 * exactly as an npm-installed one does — the CSS already travels inside the JS.
 * dist/open-editor.css remains only for SSR / strict-CSP npm consumers.
 *
 * T19 — which premium packages ship in the premium bundle: `runtime` (the gating
 * wrapper, always required), `export-pdf`, and `export-docx`. Deliberately NOT
 * `seo`/`ai` (deprecated, excluded from BUNDLED_PREMIUM) or `hello` (a test
 * fixture) — shipping unsellable code to customers buys nothing.
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import terser from '@rollup/plugin-terser';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

const banner = `/*! Open Editor Engine v${pkg.version} | MIT */`;

/**
 * ─── THE DELIVERY KEYRING (§1.5 / B1) ───────────────────────────────────────
 *
 * The engine verifies licences OFFLINE against `licenseKeys` — public keys the
 * INTEGRATOR normally embeds at build time. Under runtime delivery *we* are the
 * integrator, so our public key must be baked into the bundle here.
 *
 * WITHOUT THIS THE PRODUCT SILENTLY DOES NOT WORK. Proven in a real browser
 * against the real bundle: a valid premium session token yields
 *
 *     no keyring  →  export.pdf: false, export.docx: false
 *     keyring     →  export.pdf: true,  export.docx: true
 *
 * A paying customer would download the full premium engine and the editor would
 * refuse to activate any of it — no error, no crash, just a free editor. §1.4's
 * tests could not catch this: they prove the BYTES arrive, never that the engine
 * ACCEPTS the token.
 *
 * WHY BAKED IN RATHER THAN PASSED BY THE LOADER:
 *   • It is a security-relevant value. In loader config it sits in host-page
 *     config where a customer could swap it per page; compiled in, it cannot.
 *   • It can never legitimately vary per page, and T16 says anything that
 *     cannot change does not belong on the customer's disk.
 *   • The free bundle carries it harmlessly — it is a PUBLIC key, and the free
 *     bundle contains no premium code for it to unlock.
 *
 * ⚠️ CONSEQUENCE — ROTATION IS A BUILD, NOT A CONFIG CHANGE. Rotating the
 * signing key requires a new engine build and a version rollout. That is
 * acceptable (a public key has no expiry pressure, and the backend keeps
 * verifying old `kid`s through LICENSE_RETIRED_KEYS), but it is a real
 * constraint: publish the new key in a build BEFORE signing anything with it.
 *
 * Supplied as JSON via DELIVERY_LICENSE_KEYS — an array of { kid, jwk },
 * matching GET /.well-known/jwks.json. Absent → an empty keyring, and the build
 * warns loudly rather than failing, because a free-only build is legitimate.
 */
function loadDeliveryKeyring() {
  const raw = (process.env.DELIVERY_LICENSE_KEYS || '').trim();
  if (!raw) {
    // eslint-disable-next-line no-console
    console.warn(
      '[delivery] WARNING: DELIVERY_LICENSE_KEYS is not set — the bundle will ship '
      + 'with NO keyring, so premium licences cannot be verified and premium '
      + 'features will silently stay locked for paying customers.',
    );
    return [];
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `[delivery] DELIVERY_LICENSE_KEYS is not valid JSON: ${err.message}. `
      + 'Expected an array of { kid, jwk } — the same shape as /.well-known/jwks.json.',
    );
  }
  const keys = Array.isArray(parsed) ? parsed : parsed?.keys;
  if (!Array.isArray(keys) || keys.length === 0) {
    throw new Error('[delivery] DELIVERY_LICENSE_KEYS must be a non-empty array of { kid, jwk }.');
  }

  // Validate the SHAPE at build time. A malformed key fails silently at runtime
  // (the verifier simply cannot import it → unknown-kid → free tier), so the
  // only cheap place to notice is right here.
  return keys.map((entry, i) => {
    const jwk = entry?.jwk ?? entry;                 // accept a bare JWK too
    const kid = entry?.kid ?? jwk?.kid;
    if (!kid) throw new Error(`[delivery] key #${i} has no kid`);
    if (jwk?.kty !== 'EC' || jwk?.crv !== 'P-256' || !jwk?.x || !jwk?.y) {
      throw new Error(
        `[delivery] key "${kid}" is not an ES256 (EC P-256) public JWK — got `
        + `kty=${jwk?.kty} crv=${jwk?.crv}. The editor's verifier only accepts ES256.`,
      );
    }
    if (jwk.d) {
      // A private key in a client bundle would let anyone mint licences.
      throw new Error(`[delivery] key "${kid}" contains a PRIVATE component (d) — refusing to ship it.`);
    }
    // Only the fields the verifier needs, in a fixed order (reproducibility).
    return { kid, jwk: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y } };
  });
}

const DELIVERY_KEYRING = loadDeliveryKeyring();

// Reproducible builds (R17): pin everything that would otherwise vary between
// runs. No timestamps, no randomised identifiers — scripts/verify-reproducible.mjs
// proves this by building twice and diffing the hashes.
const min = {
  plugins: [terser({
    format: { comments: false },
    // Deterministic mangling: no seeded randomness, stable property ordering.
    mangle: { toplevel: false },
  })],
};

// ── FREE: premium stays external and absent (same boundary as the npm build) ──
const premiumExternal = (id) => id.startsWith('@openeditor-premium/')
  || /[\\/]premium[\\/]/.test(id);

// ── PREMIUM: the shipped packages are RESOLVED and compiled in ──────────────
// Everything else premium-scoped stays external, so a deprecated or fixture
// package can never be pulled in by an accidental import.
//
// NOTE (verified): only export-pdf and export-docx are linked into
// packages/core/node_modules — `runtime` is a dependency OF those packages, not
// of core, so it resolves transitively through them. Listing it here anyway is
// harmless and documents the intent, but the two entry points are what matter.
const SHIPPED_PREMIUM = [
  '@openeditor-premium/runtime',
  '@openeditor-premium/export-pdf',
  '@openeditor-premium/export-docx',
];

/**
 * Workspace dependencies the premium packages themselves import, which must be
 * bundled alongside them. Left external, rollup reports "Unresolved
 * dependencies" and the premium bundle ships with a dangling import.
 *
 * WHAT GATES PREMIUM (worth knowing, because the answer is not obvious here):
 * `premium-plugins.js` imports the RAW specs (`rawExportPdfSpec`), not the
 * gated wrappers — so `gatePremiumPlugin` and its upgrade notice are correctly
 * tree-shaken out of the delivered bundle. That is fine: the real protection is
 * core's OWN install-time gate in plugins/plugin-manager.js, which checks
 * `spec.featureId` against `isFeatureGranted()` before installing anything.
 * gatePremiumPlugin exists for consumers who install premium packages directly.
 */
const WORKSPACE_DEPS = {
  '@openeditors/entitlements': '../entitlements',
};
const premiumBundled = (id) => {
  // Bundle the shipped packages, by bare specifier...
  if (SHIPPED_PREMIUM.some((p) => id === p || id.startsWith(`${p}/`))) return false;
  // ...AND by the real file path the resolver returns for them. Without this,
  // the catch-all below re-externalises the very files we just resolved — which
  // silently produced a premium bundle identical to free (caught by the gate).
  if (SHIPPED_PREMIUM.some((p) => {
    const name = p.replace('@openeditor-premium/', '');
    return new RegExp(`[\\\\/]premium[\\\\/]${name}[\\\\/]`).test(id);
  })) return false;
  // Workspace deps the premium packages need (the licence gate's entitlements
  // package) — bundle by specifier and by resolved path.
  if (WORKSPACE_DEPS[id]) return false;
  if (/[\\/]packages[\\/]entitlements[\\/]/.test(id)) return false;
  // Everything else premium-scoped stays out: deprecated packages (seo, ai) and
  // the hello fixture must never reach a customer bundle.
  if (id.startsWith('@openeditor-premium/')) return true;
  return /[\\/]premium[\\/]/.test(id);
};

/**
 * Minimal bare-specifier resolver for the premium build.
 *
 * Rollup does not resolve node_modules specifiers on its own, and without a
 * resolver it silently treats them as external — which produced two IDENTICAL
 * bundles on the first run (the exact failure verify-bundles.mjs exists to
 * catch). Rather than add @rollup/plugin-node-resolve for two known packages,
 * resolve them directly from the workspace symlinks in
 * packages/core/node_modules/@openeditor-premium/*.
 *
 * Deliberately narrow: it resolves ONLY the shipped premium entry points. Any
 * other bare specifier is left alone, so this cannot accidentally start
 * bundling unrelated dependencies.
 */
function resolveShippedPremium() {
  return {
    name: 'resolve-shipped-premium',
    resolveId(source) {
      const isPremium = SHIPPED_PREMIUM.includes(source);
      const workspaceDep = WORKSPACE_DEPS[source];
      if (!isPremium && !workspaceDep) return null;

      // Resolve from the workspace source directory rather than through
      // node_modules symlinks: rollup resolves symlinks to their real paths, so
      // a node_modules-relative candidate never matches for transitive packages.
      //
      // `@openeditor-premium/runtime` is NOT a dependency of core — it is
      // depended on BY export-pdf/export-docx. It must still be bundled: it
      // exports gatePremiumPlugin, the licence gate itself. Leaving it external
      // would emit a premium bundle that cannot gate anything.
      const candidates = workspaceDep
        ? [new URL(`${workspaceDep}/`, import.meta.url)]
        : [
          new URL(`../../premium/${source.replace('@openeditor-premium/', '')}/`, import.meta.url),
          new URL(`./node_modules/${source}/`, import.meta.url),
        ];

      let pkgDir; let manifest;
      for (const dir of candidates) {
        try {
          manifest = JSON.parse(readFileSync(new URL('package.json', dir), 'utf-8'));
          pkgDir = dir;
          break;
        } catch { /* try the next candidate */ }
      }
      if (!pkgDir) {
        // Genuinely unresolvable — fail loud rather than silently emit a premium
        // bundle with premium left external (the exact failure that produced two
        // identical bundles on the first run of this config).
        this.error(
          `[resolve-shipped-premium] cannot resolve "${source}". `
          + 'The premium bundle would silently omit it. Check the workspace links.',
        );
      }
      // Resolve the entry point. `exports` may be a bare string, or an object
      // whose "." is either a string (the shape these packages use) or a
      // conditions map. Handle all three, then fall back to module/main.
      const exp = manifest.exports;
      const dot = typeof exp === 'object' && exp !== null ? exp['.'] : null;
      const entry = (typeof exp === 'string' ? exp : null)
        || (typeof dot === 'string' ? dot : null)
        || dot?.import
        || dot?.default
        || manifest.module
        || manifest.main
        || 'src/index.js';
      return fileURLToPath(new URL(entry, pkgDir));
    },
  };
}

/**
 * Compile the keyring into the bundle's `licenseKeys` DEFAULT (§1.5 / B1).
 *
 * Written as a targeted source transform on editor-config.js rather than a
 * global find-and-replace: the token `licenseKeys: null` is short enough to
 * appear elsewhere by accident, and silently patching the wrong occurrence
 * would be worse than not patching at all.
 *
 * A host may still pass its own `licenseKeys` — config overrides the default,
 * which keeps self-hosted/BYO-key setups (B1 in Phase 0) possible later.
 *
 * The transform ASSERTS it matched. If editor-config.js is ever reworded, this
 * fails the build instead of quietly producing a keyless bundle — the exact
 * silent failure this whole mechanism exists to prevent.
 */
function embedKeyring(keyring) {
  const TARGET = 'licenseKeys: null';
  let patched = false;
  return {
    name: 'embed-delivery-keyring',
    transform(code, id) {
      if (!id.endsWith('editor-config.js')) return null;
      const hits = code.split(TARGET).length - 1;
      if (hits !== 1) {
        throw new Error(
          `[delivery] expected exactly one "${TARGET}" in editor-config.js, found ${hits}. `
          + 'The keyring could not be embedded — refusing to build a bundle that '
          + 'cannot verify licences.',
        );
      }
      patched = true;
      return {
        code: code.replace(TARGET, `licenseKeys: ${JSON.stringify(keyring)}`),
        map: null,
      };
    },
    buildEnd() {
      if (!patched) {
        throw new Error(
          '[delivery] editor-config.js was never transformed — the keyring is NOT in '
          + 'this bundle. Premium licences would silently fail to verify.',
        );
      }
    },
  };
}

/** One delivered bundle. `plan` is 'free' | 'premium'. */
const bundle = (plan, external, plugins = []) => ({
  input: 'src/index.js',
  external,
  plugins,
  output: {
    file: `dist/delivery/${plan}.js`,
    format: 'es',
    banner,
    sourcemap: false,
    // A delivered bundle must be ONE file — the loader fetches a single artifact
    // and evaluates it. No chunk loader exists on the other side.
    inlineDynamicImports: true,
    ...min,
  },
});

export default [
  // Free: no resolver — premium specifiers stay external and absent. It still
  // carries the keyring: harmless (a PUBLIC key with no premium code to unlock)
  // and it keeps the two bundles configured identically.
  bundle('free', premiumExternal, [embedKeyring(DELIVERY_KEYRING)]),
  // Premium: the resolver pulls the shipped packages in.
  bundle('premium', premiumBundled, [
    resolveShippedPremium(),
    embedKeyring(DELIVERY_KEYRING),
  ]),
];
