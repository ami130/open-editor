/**
 * real-license-panel.js — Phase 5b: verify a REAL backend-issued license.
 *
 * The VISIBLE "real license" bar was removed from the playground page
 * permanently (2026-07-31, product decision — no license UI on the demo). The
 * verification PIPELINE is kept here, headless, exposed as `window.__realLicense`
 * for manual/console testing: it verifies an ACTUAL license issued by the
 * standalone open-editor-backend (via a real Stripe purchase) against the
 * backend's REAL published public key (fetched live from its JWKS endpoint),
 * proving the full purchase → license → editor chain end-to-end.
 *
 * It bridges BOTH gating mechanisms from the SAME verified license:
 *   - core-editor gating (toolbar/commands/shortcuts/slash/autoformat) via
 *     `config.entitlements` (a FeatureManager exposes `isGranted`).
 *   - premium-PLUGIN gating (export-pdf/docx) via the create*Plugin factories,
 *     which gate themselves against the SAME FeatureManager instance.
 *
 * Core-feature gating is a CONSTRUCTION-time contract, so each apply/clear
 * destroys + recreates its OWN dedicated editor (mounted into an offscreen
 * node, since there is no on-page panel anymore), mirroring a real embed.
 *
 * DOMAIN BINDING: verification runs with `allowDevHost: true` by default, so a
 * valid license works on a local dev host (localhost/127.0.0.1/::1/*.localhost)
 * AND on the exact domain(s) it was issued for — nowhere else. Pass
 * {strict:true} to turn OFF the localhost exemption and verify against the
 * license's own bound domain (the real production grant).
 */
import { OpenEditor, installAllPlugins } from 'openeditor-text';
import { importEs256PublicKey, verifyLicense, decodeJwt } from '../../../packages/entitlements/src/index.js';
import { FeatureManager } from '../../../packages/entitlements/src/feature-manager.js';
import { createExportPdfPlugin } from '../../../premium/export-pdf/src/index.js';
import { createExportDocxPlugin } from '../../../premium/export-docx/src/index.js';
// SEO + AI are OFF (product decision: not shipping SEO or AI). Code retained in
// premium/seo + premium/ai; re-enable by re-importing + adding to PREMIUM_PLUGINS.

const BACKEND_URL = 'http://localhost:8787';

/** Premium plugins this pipeline can gate, alongside core features from the SAME
 *  license. Only the SOLD premium (PDF + DOCX) — SEO/AI are not shipped. */
const PREMIUM_PLUGINS = [
  { featureId: 'export.pdf', create: (host) => createExportPdfPlugin(host) },
  { featureId: 'export.docx', create: (host) => createExportDocxPlugin(host) },
];

export function initRealLicensePanel() {
  let editor = null;
  let lastStatus = '';
  // Monotonic request token so overlapping apply/clear calls can't race: only
  // the LAST-issued call may mutate `editor` when its async work resolves.
  let requestSeq = 0;

  // Offscreen mount — the dedicated editor still gets built + gated exactly as
  // before, it's just not shown on the page (no panel). Kept in the DOM (not
  // display:none) so layout-dependent editor internals still initialise.
  const mountEl = document.createElement('div');
  mountEl.className = 'pg-real-license-mount';
  mountEl.style.cssText = 'position:absolute; left:-99999px; top:0; width:800px; height:1px; overflow:hidden;';
  document.body.appendChild(mountEl);

  function setStatus(text) { lastStatus = text; }

  /** Read the license's bound domains from its payload (best-effort, for strict
   *  host selection — NOT trusted for verification, which runs the full verify). */
  function licenseDomains(token) {
    try {
      const { payload } = decodeJwt(token);
      return Array.isArray(payload?.domains) ? payload.domains : [];
    } catch { return []; }
  }

  function teardown() {
    if (editor) { editor.destroy(); editor = null; }
    mountEl.innerHTML = '';
  }

  /** Fetch the backend's REAL published public key set (JWKS). */
  async function fetchJwks() {
    const res = await fetch(`${BACKEND_URL}/.well-known/jwks.json`);
    if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
    const { keys } = await res.json();
    return keys;
  }

  /** Build a fresh editor + install the free superset + wire the grant. */
  function mountEditor(entitlements) {
    const host = document.createElement('div');
    host.className = 'pg-editor-mount';
    mountEl.appendChild(host);
    editor = new OpenEditor(host, {
      debug: false,
      placeholder: 'Start typing…',
      minHeight: 220,
      inlineToolbar: true,
      entitlements, // construction-time: drives core gating
    });
    installAllPlugins(editor); // install the superset; the grant trims it.
    return editor;
  }

  /** Wire the SAME FeatureManager into the premium-plugin gate. The factories
   *  gate themselves internally, so just register+install what they produce. */
  function installGatedPremiumPlugins(manager) {
    const gateHost = { manager, gate: (id) => manager.gate(id) };
    for (const { create } of PREMIUM_PLUGINS) {
      const spec = create(gateHost);
      editor.plugins.register(spec);
      editor.plugins.install(spec.name);
    }
  }

  /** Verify + apply a pasted token. token: the compact JWS; strict: use the real
   *  production gate (no localhost exemption, verify against the bound domain). */
  async function applyLicense(token, { strict = false } = {}) {
    const myReq = ++requestSeq;
    token = (token || '').trim();
    if (!token) { setStatus('paste a license token first.'); return; }
    try {
      let keys;
      try {
        keys = await fetchJwks();
      } catch (err) {
        if (myReq !== requestSeq) return;
        setStatus(`could not reach the backend JWKS endpoint (${BACKEND_URL}): ${err.message}`);
        return;
      }
      const keyring = [];
      for (const jwk of keys) {
        try {
          keyring.push({ kid: jwk.kid, alg: 'ES256', key: await importEs256PublicKey(jwk) });
        } catch { /* skip an unimportable key; verifyLicense fails closed on unknown-kid */ }
      }
      const boundDomains = licenseDomains(token);
      const verifyHost = strict && boundDomains.length ? boundDomains[0] : location.hostname;
      const allowDevHost = !strict;
      const result = await verifyLicense(token, { keyring, hostname: verifyHost, allowDevHost });
      if (myReq !== requestSeq) return;
      const manager = new FeatureManager(result);

      teardown();
      mountEditor(manager);
      installGatedPremiumPlugins(manager);

      const granted = manager.grantedFeatures();
      if (result.valid && strict) {
        setStatus(`✓ STRICT (host "${verifyHost}") — grants ONLY: ${(granted === '*' ? [] : granted).join(', ') || '(free tier only)'}.`);
      } else if (result.valid && result.devHost) {
        setStatus(`license VALID (dev host "${location.hostname}") — ALL features granted locally (localhost "free zone").`);
      } else if (result.valid) {
        setStatus(`license VALID — granted: ${granted === '*' ? 'ALL (dev host)' : (granted.join(', ') || 'none')}`);
      } else if (result.reason === 'domain-mismatch') {
        const want = boundDomains.length ? boundDomains.join(', ') : '(none in token)';
        setStatus(`license INVALID (domain-mismatch): bound to ${want}, but page is on "${location.hostname}".`);
      } else {
        setStatus(`license INVALID (${result.reason}) — nothing granted (always-on core only)`);
      }
      return { result, granted, status: lastStatus };
    } catch (err) {
      if (myReq === requestSeq) setStatus(`unexpected error applying the license: ${err.message}`);
    }
  }

  function clearLicense() {
    ++requestSeq; // supersede any in-flight applyLicense()
    teardown();
    const emptyManager = new FeatureManager({ valid: false, reason: 'absent' });
    mountEditor(emptyManager);
    setStatus('no license — always-on core only; everything else hidden.');
  }

  // Headless manual/console surface (no on-page UI). apply() now takes the token
  // as an argument (there is no input box to read from).
  window.__realLicense = {
    apply: applyLicense,
    clear: clearLicense,
    editor: () => editor,
    status: () => lastStatus,
    fetchJwks,
  };

  // NOTE: deliberately do NOT mount an editor on load. The old panel mounted a
  // dedicated editor immediately (into its visible box); with the panel gone we
  // must not leave a second, offscreen `.oe-editor` on the page — it would be a
  // phantom match for the many e2e specs that target `.oe-editor` globally. The
  // editor is created lazily only when apply()/clear() is driven from the
  // console. (clearLicense() still mounts the explicit no-license editor when
  // called manually.)
}
