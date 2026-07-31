/**
 * license-runtime.js — Phase 1a. The license verify pipeline, moved INSIDE the
 * one package so a customer pastes ONE `licenseKey` in config and premium turns
 * on — no separate premium host to wire, no second install.
 *
 * This is the core-internal equivalent of premium/runtime's `createPremiumHost`,
 * reusing the SAME entitlements verifier (imported by relative path so rollup's
 * preserveModules bundles it into core's dist — no bare specifier, no consumer
 * dependency, no node-resolve plugin needed). The Node-only dev issuer
 * (`node:crypto`) is behind the entitlements `./issuer` subpath and is NEVER
 * imported here, so nothing Node-only reaches the browser bundle.
 *
 * Config (all on the editor config object):
 *   • licenseKey  {string}  — the compact JWS license token the customer pastes.
 *                             Absent → free tier (FeatureManager grants nothing).
 *   • licenseKeys {Array<{kid, jwk}>} — the integrator's PUBLISHED ES256 public
 *                             key(s) (D-A: config-provided, offline — the
 *                             integrator embeds their own key at build time; core
 *                             stays key-agnostic, no network, no phone-home).
 *   • allowDevHost {boolean} — opt IN to the localhost/dev exemption (default
 *                             false, strict — mirrors verifyLicense).
 *
 * FAILS CLOSED at every step (bad/absent key, unimportable JWK, wrong host, no
 * WebCrypto) → free tier. NEVER throws for a license problem; the editor always
 * mounts with (at least) the free set.
 */
import {
  verifyLicense,
  importEs256PublicKey,
  FeatureManager,
  FEATURES as PREMIUM_FEATURES,
} from '../../../entitlements/src/index.js';
import { createFeatureGate } from './feature-gate.js';
import { allEditorFeatureIds } from './feature-catalog.js';
import { buildBundledPremiumSpecs } from './premium-plugins.js';

/**
 * Resolve an editor config into a FeatureManager (the object the core gate
 * consumes via `entitlements.isGranted(id)`), verifying the pasted licenseKey
 * offline against the config-provided public keyring.
 *
 * @param {object} config resolved editor config (needs licenseKey/licenseKeys)
 * @returns {Promise<{ manager: FeatureManager, result: object|null }>}
 */
export async function resolveEntitlements(config = {}) {
  const licenseKey = typeof config.licenseKey === 'string' ? config.licenseKey : '';
  const licenseKeys = Array.isArray(config.licenseKeys) ? config.licenseKeys : [];
  const allowDevHost = config.allowDevHost === true;

  const hostname = (typeof location !== 'undefined' && location) ? location.hostname : '';

  let result = null;
  // Nothing to verify → free tier (unless dev-host is explicitly opted in).
  if (licenseKey || allowDevHost) {
    const keyring = await buildKeyring(licenseKeys);
    result = await verifyLicense(licenseKey, { keyring, hostname, allowDevHost });
  }

  return { manager: new FeatureManager(result), result };
}

/** True if the config carries anything that warrants a verify pass at all. */
export function hasLicenseConfig(config = {}) {
  return (typeof config.licenseKey === 'string' && config.licenseKey.length > 0)
    || config.allowDevHost === true;
}

/**
 * Import published JWKs into a verifier keyring. A key that fails to import
 * (malformed JWK / no WebCrypto) is skipped — verification then fails closed
 * with `unknown-kid` rather than this throwing. (Mirrors premium-host.)
 */
async function buildKeyring(keys) {
  const ring = [];
  for (const entry of Array.isArray(keys) ? keys : []) {
    if (!entry || typeof entry.kid !== 'string' || !entry.jwk) continue;
    try {
      const key = await importEs256PublicKey(entry.jwk);
      ring.push({ kid: entry.kid, alg: 'ES256', key });
    } catch { /* skip — fail closed via unknown-kid */ }
  }
  return ring;
}

/** Registered premium feature ids (from the entitlements registry). */
function premiumFeatureIds() {
  return Object.keys(PREMIUM_FEATURES || {});
}

/**
 * Apply a resolved entitlement to a LIVE editor AFTER mount (Phase 1a). Rebuilds
 * the editor's feature gate from the new entitlements, computes which features
 * are newly granted (vs before), enables them via the editor's
 * `_enableGrantedFeatures` hook (toolbar/shortcuts/commands/plugins — wired in
 * 1a-2b..2d), emits `entitlementsApplied`, and returns the newly-granted delta.
 * Preserves `enforceFreeTier` so anything the new entitlements do NOT grant stays
 * fail-closed. Idempotent; no-ops safely on a bad arg or a destroyed editor.
 *
 * Lives here (not in the editor-api mixin) to keep that file under the line
 * limit and to co-locate all license-runtime logic.
 *
 * @param {object} editor the OpenEditor instance
 * @param {{ isGranted(id: string): boolean }} entitlements
 * @returns {string[]} feature ids newly enabled by this call
 */
export function applyEntitlementsToEditor(editor, entitlements) {
  if (!editor || editor._destroyed) return [];
  if (!entitlements || typeof entitlements.isGranted !== 'function') return [];

  const wasGranted = editor._isFeatureGranted || (() => true);

  // Rebuild the gate: same config, new entitlements take precedence.
  editor._config = { ...editor._config, entitlements };
  editor._isFeatureGranted = createFeatureGate(editor._config);

  // Compute BOTH deltas over the full catalog + premium registry ids: features
  // newly granted (upgrade) AND newly denied (downgrade). The downgrade delta is
  // the audit-#2 fix — clearing/narrowing a key must tear down premium, not just
  // deny it at the gate (the shipped premium plugins expose direct onClick/
  // imperative surfaces that bypass the command gate).
  const candidates = new Set([...allEditorFeatureIds(), ...premiumFeatureIds()]);
  const newlyGranted = [];
  const newlyDenied = [];
  for (const id of candidates) {
    const now = editor._isFeatureGranted(id);
    const before = wasGranted(id);
    if (now && !before) newlyGranted.push(id);
    else if (!now && before) newlyDenied.push(id);
  }

  // Tear down FIRST (downgrade), then enable (upgrade) — an id can't be in both.
  if (newlyDenied.length && typeof editor._disableRevokedFeatures === 'function') {
    editor._disableRevokedFeatures(newlyDenied);
  }
  if (newlyGranted.length && typeof editor._enableGrantedFeatures === 'function') {
    editor._enableGrantedFeatures(newlyGranted);
  }
  if (typeof editor.emit === 'function') {
    editor.emit('entitlementsApplied', { granted: newlyGranted, revoked: newlyDenied });
  }
  return newlyGranted;
}

/**
 * Phase 1a-2d — register the editor's configured premium plugin specs (once)
 * and INSTALL the ones the license currently grants into the LIVE editor.
 * `PluginManager.install` is both feature-gated (skips an ungranted plugin) and
 * idempotent (no double-install), so this is safe to call at mount AND on every
 * applyEntitlements: locked plugins are skipped now and install later, the
 * moment the gate widens. Failures per plugin are isolated (never break others).
 *
 * @param {object} editor the OpenEditor instance (needs .plugins, ._config)
 */
// Register (once) + install-if-granted a single premium spec. Both the register
// (guarded by a per-editor marker) and install (gated + idempotent in
// PluginManager) are safe to call repeatedly. Sync.
function installOnePremiumSpec(editor, spec) {
  if (!spec || typeof spec.name !== 'string' || typeof spec.install !== 'function') return;
  try {
    editor._premiumRegistered = editor._premiumRegistered || new Set();
    if (!editor._premiumRegistered.has(spec.name)) {
      editor.plugins.register(spec);
      editor._premiumRegistered.add(spec.name);
    }
    if (!editor.plugins.isInstalled || !editor.plugins.isInstalled(spec.name)) {
      editor.plugins.install(spec.name);
    }
  } catch (e) {
    editor.logger && editor.logger.warn(`premium plugin "${spec.name}" install failed:`, e && e.message);
  }
}

/**
 * Register + install premium plugins for an editor.
 *
 * TWO paths, deliberately different in timing (Phase 1b):
 *   • config.premiumPlugins (integrator-passed) → installed SYNCHRONOUSLY, so a
 *     caller can assert install state right after applyEntitlements.
 *   • BUNDLED one-package specs (1a-3b) → loaded via dynamic import() (lazy
 *     chunks, so free users don't download premium) and installed on the next
 *     microtask. Only when the licensing model is active (enforceFreeTier);
 *     legacy grant-all mode never auto-installs bundled premium.
 *
 * Fire-and-forget for the async part: the returned promise is for callers that
 * want to await the lazy install (tests); _initLicense/_enableGrantedFeatures
 * attach .catch() and do NOT await, keeping the constructor + applyEntitlements
 * synchronous.
 *
 * Emits `premiumReady` once ALL premium installs (sync config specs + async
 * bundled specs) have settled, with the list of premium plugin names now
 * installed — the signal a consumer/wrapper waits on to know "premium finished
 * loading" (premium loads async since Phase 1b). Fires even when there is
 * nothing to load (empty list) so a listener always gets exactly one resolution.
 * @returns {Promise<void>} resolves once the bundled lazy specs are installed.
 */
export function registerAndInstallPremiumPlugins(editor) {
  if (!editor || editor._destroyed || !editor.plugins) return Promise.resolve();
  const cfg = (editor._config) || {};

  // SYNC path — integrator-passed specs install immediately.
  const extra = Array.isArray(cfg.premiumPlugins) ? cfg.premiumPlugins : [];
  for (const spec of extra) installOnePremiumSpec(editor, spec);

  // ASYNC path — bundled premium, lazily imported, only under the licensing model.
  if (cfg.enforceFreeTier !== true) { emitPremiumReady(editor); return Promise.resolve(); }
  if (!editor._bundledPremiumSpecsPromise) {
    editor._bundledPremiumSpecsPromise = buildBundledPremiumSpecs(editor);
  }
  return editor._bundledPremiumSpecsPromise.then((specs) => {
    if (editor._destroyed) return;
    for (const spec of specs) installOnePremiumSpec(editor, spec);
    emitPremiumReady(editor);
  });
}

// Emit `premiumReady` with the premium plugin names currently installed —
// but ONLY when that set has CHANGED since the last emit. registerAndInstall is
// called from BOTH _initLicense and _enableGrantedFeatures (and on every
// applyEntitlements), so a naive emit would fire repeatedly with no new
// unlocks; deduping on the installed-set means a listener sees one event per
// actual change. Guards _destroyed/missing-emit. Empty = free tier.
function emitPremiumReady(editor) {
  if (!editor || editor._destroyed || typeof editor.emit !== 'function') return;
  const registered = editor._premiumRegistered instanceof Set ? [...editor._premiumRegistered] : [];
  const installed = (editor.plugins
    ? registered.filter((name) => editor.plugins.isInstalled(name))
    : []).sort();
  const sig = installed.join(',');
  if (editor._lastPremiumReadySig === sig) return; // unchanged → don't re-fire
  editor._lastPremiumReadySig = sig;
  editor.emit('premiumReady', { installed });
}
