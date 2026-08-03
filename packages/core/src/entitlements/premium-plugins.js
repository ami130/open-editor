/**
 * premium-plugins.js — Phase 1a-3b: the ONE-PACKAGE premium manifest.
 *
 * This is the structural merge that makes `openeditor-text` a single package:
 * it imports every premium plugin's RAW spec factory by RELATIVE path so
 * rollup bundles the premium code straight into core's dist (the same
 * relative-out-of-root-import pattern proven by license-runtime.js). A customer
 * therefore `npm install openeditor-text` and NEVER installs any
 * `@openeditor-premium/*` package.
 *
 * ONE GATING AUTHORITY: we deliberately import the RAW specs (rawSeoSpec, …) —
 * NOT the gated `create*Plugin(host)` factories — and attach each spec's
 * `featureId`. Core's OWN PluginManager gate (which the pasted license drives,
 * and which re-checks live on every applyEntitlements) then governs install.
 * This keeps a single gate — the license — rather than running premium through
 * both `gatePremiumPlugin`'s call-time gate AND core's install-time gate.
 *
 * INERT until licensed: importing this module pulls the premium CODE into the
 * bundle, but nothing installs/runs until the gate grants the feature. The
 * premium raw specs touch the DOM only inside install()/functions (verified),
 * so bundling them into the ESM/CJS/UMD builds is import-safe (no module-scope
 * DOM, no node:* — the Node-only dev issuer is behind entitlements' ./issuer
 * subpath and is never imported here).
 *
 * NOTE (bundle size): 1a-3b bundles premium EAGERLY (~free users download it).
 * Phase 1b replaces these static imports with dynamic import() chunks so free
 * users download only what a license unlocks. Until then this is the accepted
 * transient cost.
 */
// Phase 1b — LAZY: each premium module is loaded via dynamic import() so it
// becomes its OWN chunk and free users never download it (in the ESM-tree build
// that bundler consumers use). The single-file esm.min/cjs/umd builds inline it
// back (inlineDynamicImports) — a CDN/<script>/Node consumer has no chunk
// loader, so those stay eager; that's the honest, unavoidable outcome.
//
// NOTE the FOUR `../`: premium/ is a sibling of packages/ (repo root), unlike
// entitlements which lives inside packages/ (three `../` in license-runtime.js).
// Each `load` returns the module's raw-spec factory; nothing is imported until
// a license grants the feature (or the free-tier keyless path never calls it).
// SEO + AI are NOT shipped (product decision: no-SEO / no-AI launch). They are
// deliberately OMITTED from the bundle so the editor never registers/installs
// them — no toolbar button, no methods wired, nothing to gate. The plugin code
// still lives in premium/seo + premium/ai (nothing deleted); to re-enable a
// feature, add its entry back here AND flip its catalog/registry flags.
// KEPT: export.pdf + export.docx (the only sold premium).
export const BUNDLED_PREMIUM = [
  { featureId: 'export.pdf',      configKey: 'exportPdf', load: () => import('@openeditor-premium/export-pdf').then((m) => m.rawExportPdfSpec) },
  { featureId: 'export.docx',     configKey: 'exportDocx', load: () => import('@openeditor-premium/export-docx').then((m) => m.rawExportDocxSpec) },
];

/**
 * Build the bundled premium plugin specs for an editor (ASYNC — Phase 1b), each
 * tagged with its `featureId` so core's PluginManager install-gate governs it.
 * Dynamic-imports each premium module (lazy chunk), builds its raw spec with the
 * matching per-plugin config (configKey), and attaches featureId. A single
 * import/build failure is isolated (never breaks the rest). Names are distinct
 * per spec so register/install dedupe by name keeps them separate.
 * @param {object} editor the OpenEditor instance (for per-plugin config)
 * @returns {Promise<Array<{name,featureId,install,destroy}>>}
 */
export async function buildBundledPremiumSpecs(editor) {
  const cfg = (editor && editor._config) || {};
  const specs = [];
  for (const entry of BUNDLED_PREMIUM) {
    try {
      const makeSpec = await entry.load();
      const raw = makeSpec(cfg[entry.configKey] || {});
      if (raw && typeof raw.name === 'string' && typeof raw.install === 'function') {
        raw.featureId = entry.featureId; // core's install-gate reads this
        specs.push(raw);
      }
    } catch { /* a single premium chunk failing to load must not break the rest */ }
  }
  return specs;
}
