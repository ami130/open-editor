/**
 * 22.3 — FeatureManager. The gate premium plugins ask before activating.
 * Built from a verified license result (22.2). Absent/expired/invalid license
 * degrades gracefully: `has()` returns false, so a premium plugin declines
 * politely (its host shows a non-blocking notice — 19.3) rather than crashing.
 *
 * Imports only the registry — no core, no crypto.
 */
import { isRegisteredFeature } from './feature-registry.js';

export class FeatureManager {
  /**
   * @param {object} [result] a verifyLicense() result, or null/absent for the
   *   free tier. Dev-host results (no payload) grant everything.
   */
  constructor(result = null) {
    this._valid = !!(result && result.valid);
    this._devHost = !!(result && result.devHost);
    const feats = (result && result.payload && result.payload.features) || [];
    this._features = new Set(this._valid ? feats : []);
    this._limits = (result && result.payload && result.payload.limits) || {};
  }

  /** Dev host → everything unlocked (the Jodit rule); else the granted set. */
  has(featureId) {
    if (this._devHost) return true;
    if (!this._valid) return false;
    return this._features.has(featureId);
  }

  /**
   * Alias of has(), so a FeatureManager can be handed DIRECTLY to the core
   * editor as `config.entitlements` (the core gate calls `entitlements.isGranted(id)`).
   * This is the single-source-of-truth adapter: one verified license → one
   * FeatureManager → drives BOTH the core feature gate (text/list/font ids) and
   * the premium plugin gate (ai/export/seo ids). Without this alias the core
   * gate's entitlements path never fires and silently grants-all.
   */
  isGranted(featureId) {
    return this.has(featureId);
  }

  /**
   * Gate a premium plugin install. Returns `{ allowed, reason }`. A plugin
   * calls this in its own install() and no-ops (with the host notice) when
   * not allowed — nothing here touches the editor.
   */
  gate(featureId) {
    if (!isRegisteredFeature(featureId)) return { allowed: false, reason: 'unregistered-feature' };
    // Dev host FIRST — otherwise has() (which is true on a dev host) would
    // always short-circuit to reason:'granted' and the 'dev-host' reason could
    // never be emitted. Checking it here keeps the verdict informative.
    if (this._devHost) return { allowed: true, reason: 'dev-host' };
    if (this.has(featureId)) return { allowed: true, reason: 'granted' };
    if (!this._valid) return { allowed: false, reason: 'no-license' };
    return { allowed: false, reason: 'not-in-license' };
  }

  /** A numeric limit from the payload (e.g. seats, editors), or `fallback`. */
  limit(name, fallback = Infinity) {
    const v = this._limits[name];
    return typeof v === 'number' ? v : fallback;
  }

  /** All granted feature ids (empty on free tier; registry-wide on dev host). */
  grantedFeatures() {
    return this._devHost ? '*' : [...this._features];
  }
}
