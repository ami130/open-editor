/**
 * editor-license-refresh.js — Phase 4d: the editor-side SILENT REFRESH scheduler,
 * applied as a mixin (like editor-license.js) to respect the 300-line source limit.
 *
 * Makes "paste once, forever" real from the editor side: when a valid license is
 * applied and `licenseRefreshUrl` is configured, schedule a background fetch to
 * the backend refresh endpoint (Phase 4c) a lead time BEFORE the token expires.
 * On success it hands the fresh token to setLicenseKey() (which re-verifies AND
 * re-schedules the next refresh). On failure it degrades gracefully — the current
 * token keeps working until its real expiry, and we simply try again later.
 *
 * OPT-IN + inert by default: with no `licenseRefreshUrl`, nothing is scheduled, so
 * existing embeds are unchanged. NOT a per-page-load phone-home — one timer, fired
 * only near expiry, with jitter to avoid synchronized refresh storms.
 *
 * TOKEN STORAGE: the refreshed token lives in memory (this._config.licenseKey, via
 * setLicenseKey). The editor does NOT write it to localStorage — a bearer token in
 * JS-readable storage is an XSS exposure the HOST must own. The host can capture the
 * fresh token from the `premiumReady`/`entitlementsApplied` flow if it wants to
 * persist it (env/build-time inject recommended; never commit a domain-bound key).
 *
 * Also hosts the DOWNGRADE teardown (_disableRevokedFeatures, audit #2) — the
 * inverse of _enableGrantedFeatures — kept here to respect editor-license.js's
 * 300-line budget.
 */
import { featureForPlugin } from './entitlements/feature-catalog.js';

// Fraction of jitter applied to the scheduled delay (±), so many editors sharing
// an expiry don't all refresh in the same instant.
const JITTER = 0.1;
// Default lead: refresh a day before expiry (overridable via config).
const DEFAULT_LEAD_SECONDS = 24 * 3600;
// Never schedule further out than this (setTimeout with a huge delay is unreliable
// and a token years out doesn't need an early timer); re-evaluated on next apply.
const MAX_DELAY_MS = 24 * 3600 * 1000; // cap a single wait at ~1 day; re-arm after.
// Ceiling for the exponential retry backoff — a persistently-broken endpoint
// settles to at most one attempt per this interval (audit M2), not a steady storm.
const MAX_RETRY_MS = 12 * 3600 * 1000; // ~12h

export const editorLicenseRefreshMixin = {
  /**
   * Schedule (or reschedule) the background refresh from a verified result.
   * Called by _verifyAndApplyLicense on a VALID verify. No-ops unless a refresh
   * URL is configured and the result carries a future `exp`. Idempotent: clears
   * any prior timer first, so re-verifying (setLicenseKey / a prior refresh)
   * never stacks timers.
   * @param {{ valid?: boolean, payload?: { exp?: number } }|null} result
   */
  _scheduleLicenseRefresh(result) {
    if (this._destroyed) return;
    this._clearLicenseRefreshTimer();
    const url = this._config && this._config.licenseRefreshUrl;
    const exp = result && result.payload && typeof result.payload.exp === 'number' ? result.payload.exp : 0;
    if (!url || !exp) return; // inert: not configured, or no expiry to track

    const lead = this._refreshLeadSeconds();
    const nowMs = Date.now();
    const untilRefreshMs = (exp - lead) * 1000 - nowMs; // time until we SHOULD refresh

    // Far from expiry? Do NOT refresh — just CHECK BACK later. Firing a refresh
    // every MAX_DELAY_MS would make a lifetime/multi-year token phone home daily,
    // defeating "paste once, forever offline" (audit M1). Instead sleep the capped
    // interval and RE-SCHEDULE (no network), so we only actually refresh once we're
    // genuinely within the lead window.
    if (untilRefreshMs > MAX_DELAY_MS) {
      this._armTimer(MAX_DELAY_MS, () => this._scheduleLicenseRefresh(result));
      return;
    }

    // Within (or past) the lead window → refresh soon. Floor keeps it off the sync
    // path; jitter (±) prevents synchronized refresh storms across many editors.
    let delay = untilRefreshMs < 1000 ? 1000 : untilRefreshMs;
    delay = delay * (1 + this._refreshJitter());
    this._armTimer(delay, () => this._doLicenseRefresh());
  },

  /** Arm the single tracked refresh timer with `fn` after `delayMs`. Tracked in
   *  `_timers` so destroy() auto-clears it; only one is ever pending. */
  _armTimer(delayMs, fn) {
    const tid = setTimeout(() => {
      this._timers && this._timers.delete(tid);
      this._licenseRefreshTimer = null;
      if (!this._destroyed) fn();
    }, delayMs);
    this._licenseRefreshTimer = tid;
    this._timers && this._timers.add(tid);
  },

  /** Clear a pending refresh timer (idempotent; safe on a destroyed editor). */
  _clearLicenseRefreshTimer() {
    if (this._licenseRefreshTimer) {
      clearTimeout(this._licenseRefreshTimer);
      this._timers && this._timers.delete(this._licenseRefreshTimer);
      this._licenseRefreshTimer = null;
    }
  },

  /**
   * Perform one background refresh: POST the current token to the refresh URL.
   * On a fresh token, apply it via setLicenseKey (re-verifies + re-schedules).
   * On ANY failure (network, non-200, refused), degrade gracefully: keep the
   * current token (still valid until real expiry) and re-arm a retry a bit later.
   * Never throws. @returns {Promise<void>}
   */
  _doLicenseRefresh() {
    if (this._destroyed) return Promise.resolve();
    const url = this._config && this._config.licenseRefreshUrl;
    const token = this._config && this._config.licenseKey;
    if (!url || !token || typeof fetch !== 'function') return Promise.resolve();

    return Promise.resolve()
      .then(() => fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      }))
      .then((res) => (res && res.ok ? res.json() : null))
      .then((body) => {
        if (this._destroyed) return undefined;
        if (body && body.refreshed && typeof body.token === 'string' && body.token) {
          // Success → reset backoff; setLicenseKey re-verifies AND re-schedules
          // the next refresh off the new exp. No remount, no content loss.
          this._refreshAttempts = 0;
          return this.setLicenseKey(body.token);
        }
        // Refused / not-refreshed → degrade with EXPONENTIAL backoff.
        this._rearmRefreshRetry();
        return undefined;
      })
      .catch(() => {
        if (this._destroyed) return;
        this._rearmRefreshRetry(); // network error → keep working, try again later
      });
  },

  /**
   * Re-arm a retry after a failed refresh, with EXPONENTIAL backoff + jitter,
   * capped (audit M2: a fixed ~1h retry hammered a down endpoint forever). Delay
   * = base × 2^attempts, capped at MAX_RETRY, so a persistently-broken endpoint
   * settles to one attempt per cap interval instead of a steady storm. Backoff
   * resets to base on the next success. The current token keeps working until its
   * real expiry regardless — this only paces the RETRY.
   */
  _rearmRefreshRetry() {
    if (this._destroyed) return;
    this._clearLicenseRefreshTimer();
    const attempts = this._refreshAttempts || 0;
    const base = this._refreshRetrySeconds() * 1000;
    const backoff = Math.min(base * Math.pow(2, attempts), MAX_RETRY_MS);
    const delay = backoff * (1 + this._refreshJitter());
    this._refreshAttempts = attempts + 1;
    this._armTimer(delay, () => this._doLicenseRefresh());
  },

  _refreshLeadSeconds() {
    const v = this._config && this._config.licenseRefreshLeadSeconds;
    return typeof v === 'number' && v > 0 ? v : DEFAULT_LEAD_SECONDS;
  },

  _refreshRetrySeconds() {
    const v = this._config && this._config.licenseRefreshRetrySeconds;
    return typeof v === 'number' && v > 0 ? v : 3600; // default: retry in ~1h
  },

  /** ± JITTER fraction. Uses Math.random when available; 0 if not (deterministic tests). */
  _refreshJitter() {
    const rand = typeof Math.random === 'function' ? Math.random() : 0.5;
    return (rand * 2 - 1) * JITTER;
  },

  /**
   * Phase 5 audit #2 — DOWNGRADE teardown. On a key clear/narrow, the gate now
   * denies the revoked premium, but the installed premium PLUGINS keep working
   * (their toolbar button's onClick + imperative methods like `editor.analyzeSeo`
   * bypass the command gate). So uninstall any installed plugin whose feature is
   * no longer granted, then rebuild the toolbar so its buttons disappear. Guarded
   * + best-effort: never throws into the apply path. `revoked` is the id delta
   * from applyEntitlements; we still re-check the live gate per plugin to be safe.
   * @param {string[]} revoked feature ids newly DENIED this apply.
   */
  _disableRevokedFeatures(revoked) {
    if (this._destroyed || !this.plugins || !Array.isArray(revoked) || revoked.length === 0) return;
    const revokedSet = new Set(revoked);
    try {
      const installed = this.plugins.getAll ? this.plugins.getAll() : null; // name → spec
      if (!installed) return;
      for (const [name, spec] of installed) {
        const featureId = (spec && spec.featureId) || featureForPlugin(name);
        // Uninstall if this plugin's feature is in the revoked delta AND the live
        // gate now denies it (double-check: never rip out a still-granted plugin).
        if (featureId && revokedSet.has(featureId)
          && this.isFeatureGranted && !this.isFeatureGranted(featureId)) {
          try { this.plugins.uninstall(name); } catch (e) {
            this.logger && this.logger.warn(`downgrade: uninstall "${name}" failed:`, e && e.message);
          }
        }
      }
      // Rebuild the toolbar so any revoked built-in items also drop, then
      // re-contribute the STILL-installed plugins' buttons (rebuild wipes them).
      if (this.toolbar && typeof this.toolbar.rebuild === 'function') {
        this.toolbar.rebuild();
        if (this.plugins.contributeAllToolbarButtons) this.plugins.contributeAllToolbarButtons();
      }
    } catch (e) {
      this.logger && this.logger.warn('downgrade teardown failed:', e && e.message);
    }
  },
};
