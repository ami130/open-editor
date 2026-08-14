/**
 * editor-license.js — Phase 1 licensing methods, applied as a mixin via
 * Object.assign(OpenEditor.prototype, editorLicenseMixin). Split into its own
 * file (like the other editor-*.js mixins) to respect the 300-line source
 * limit and to co-locate the "paste one key → premium turns on" surface.
 */
import {
  applyEntitlementsToEditor,
  registerAndInstallPremiumPlugins,
  resolveEntitlements,
  hasLicenseConfig,
} from './entitlements/license-runtime.js';
import { registerGrantedShortcuts } from './commands/setup-commands.js';

export const editorLicenseMixin = {
  /**
   * Phase 1a — called ONCE at end of _init(). Registers any configured premium
   * plugin specs (so a later runtime applyEntitlements can install them), then —
   * if a license is configured (licenseKey/allowDevHost) — verifies it OFFLINE
   * (async) and applies the result, enabling granted premium without blocking
   * the sync constructor. No-ops cleanly when no license is configured (the free
   * set is already mounted). Fires `licenseError` if verification throws.
   */
  _initLicense() {
    if (this._destroyed) return;
    // Register/install premium up front (idempotent + gated; locked ones wait
    // for a grant). Returns a promise for the lazily-imported bundled specs —
    // fire-and-forget with .catch (the sync part already ran); NOT awaited, so
    // the constructor stays synchronous.
    try {
      Promise.resolve(registerAndInstallPremiumPlugins(this)).catch((e) =>
        this.logger && this.logger.warn('license init: premium install failed:', e && e.message));
    } catch (e) { this.logger && this.logger.warn('license init: premium register failed:', e && e.message); }

    if (!hasLicenseConfig(this._config)) return; // free tier, nothing to verify
    this._verifyAndApplyLicense();
  },

  /**
   * Verify the license currently in `this._config` (licenseKey/licenseKeys/
   * allowDevHost) OFFLINE and apply the result to the live editor. Async and
   * destroy-guarded; NEVER throws (fires `licenseError` on an invalid/failed
   * verify). Returns a promise for callers that want to await it (setLicenseKey,
   * tests); _initLicense fires-and-forgets. Shared by mount-time init and the
   * runtime setLicenseKey() path so the verify logic lives in ONE place.
   * @returns {Promise<void>}
   */
  _verifyAndApplyLicense() {
    // Generation guard (audit #10): each call claims the next generation; if a
    // NEWER call starts before this one's async verify resolves, this stale result
    // is DROPPED — so rapid setLicenseKey(A)/setLicenseKey(null) can't let A's
    // (slower) verify win and re-apply stale entitlements. Verify uses the config
    // SNAPSHOT captured now, so each still verifies its own token.
    const gen = (this._licenseGen = (this._licenseGen || 0) + 1);
    const config = this._config;
    return Promise.resolve()
      .then(() => resolveEntitlements(config))
      .then(({ manager, result }) => {
        if (this._destroyed || gen !== this._licenseGen) return undefined; // superseded
        this.applyEntitlements(manager);
        if (result && result.valid === false) {
          this.emit('licenseError', { reason: result.reason });
          // DX (dev-experience) fix: most integrators never wire a `licenseError`
          // listener, so a valid-but-wrong-domain / expired key would silently mean
          // "premium just doesn't work" with no clue why — the #1 support ticket.
          // Surface a clear, actionable console warning by default. Opt out with
          // `licenseWarnings: false`. NEVER logs the key or the token.
          this._warnLicenseProblem(result.reason);
        }
        // Phase 4d — (re)schedule the silent background refresh from this verify.
        // A VALID result carries payload.exp; the scheduler is a no-op unless a
        // licenseRefreshUrl is configured. Clearing/failing a key clears the timer.
        if (this._scheduleLicenseRefresh) this._scheduleLicenseRefresh(result);
        // applyEntitlements is sync (returns the delta) but the BUNDLED premium
        // install it kicks off is async; await that here so a caller of
        // setLicenseKey() can reliably observe installed premium after awaiting.
        return this._premiumInstallPromise;
      })
      .catch((e) => {
        if (this._destroyed || gen !== this._licenseGen) return; // superseded
        this.emit('licenseError', { reason: 'verify-failed', message: e && e.message });
      });
  },

  /**
   * DX helper: print ONE clear, actionable console warning explaining why a
   * configured license did not unlock premium. Off when `licenseWarnings: false`.
   * Never logs the license key/token — only the reason and (for a domain
   * mismatch) the current host, which is what a developer needs to self-diagnose.
   * @param {string} reason the verifier REASON on a failed verify.
   */
  _warnLicenseProblem(reason) {
    if (this._config && this._config.licenseWarnings === false) return;
    if (typeof console === 'undefined' || typeof console.warn !== 'function') return;
    const host = (typeof location !== 'undefined' && location && location.hostname) || '(unknown host)';
    const messages = {
      'domain-mismatch': `license is valid but NOT bound to this domain ("${host}"). Use the key on its licensed domain, or ask whoever issued the license to re-bind it to this domain. Local dev on localhost is exempt by default.`,
      domain: `license is valid but NOT bound to this domain ("${host}"). Use the key on its licensed domain, or ask whoever issued the license to re-bind it to this domain. Local dev on localhost is exempt by default.`,
      expired: 'license has EXPIRED. Renew or re-purchase to keep premium features.',
      'bad-signature': 'license key is invalid (signature check failed) — check the key was copied in full, and that licenseKeys matches the key that signed it.',
      'unknown-kid': 'license key was signed by a key not in your configured licenseKeys — verify you embedded the correct public key.',
      'no-webcrypto': 'premium could not be verified because WebCrypto is unavailable (needs a secure context — https or localhost).',
    };
    const detail = messages[reason] || `license could not be verified (${reason}).`;
    console.warn(`[OpenEditor] Premium is running in FREE mode: ${detail}`);
  },

  /**
   * Phase 2 — set/replace the license at RUNTIME and re-verify in place (the
   * reactive-licenseKey path the wrappers call when their licenseKey prop
   * changes). Updates config, re-runs the offline verify, and applies the new
   * entitlement via applyEntitlements — unlocking newly-granted premium WITHOUT
   * a remount or content loss.
   *
   * DOWNGRADE: passing a falsy key (or a narrower one) clears/reduces premium —
   * the gate DENIES the revoked features AND applyEntitlements now tears down the
   * newly-denied premium plugins in place (_disableRevokedFeatures, audit #2):
   * their toolbar buttons are removed and imperative methods (e.g. analyzeSeo)
   * deleted via the plugin's destroy(). No remount needed. Free features stay.
   *
   * No-ops on a destroyed editor. The returned promise resolves once the verify,
   * the (sync) gate apply, AND the async BUNDLED premium install have all settled
   * — so a caller can `await setLicenseKey(...)` and then reliably observe the
   * newly-unlocked premium as installed.
   * @param {string|null} licenseKey the new license token (falsy = clear).
   * @param {Array<{kid,jwk}>} [licenseKeys] optional new public keyring.
   * @returns {Promise<void>}
   */
  setLicenseKey(licenseKey, licenseKeys) {
    if (this._destroyed) return Promise.resolve();
    this._config = { ...this._config, licenseKey: licenseKey || null };
    if (licenseKeys !== undefined) this._config.licenseKeys = licenseKeys;
    return this._verifyAndApplyLicense();
  },

  /**
   * Phase 1a — apply a verified entitlement to this LIVE editor AFTER mount
   * (the license is verified asynchronously post-construction). Rebuilds the
   * feature gate from the new entitlements and ENABLES the newly-granted
   * features (toolbar/shortcuts/commands/premium plugins) without rebuilding the
   * editor and without disturbing the already-mounted free set. Idempotent;
   * no-ops safely on a bad arg or a destroyed editor. Emits `entitlementsApplied`
   * with `{ granted }`. Returns the newly-granted feature-id delta.
   *
   * This is the foundation of "paste one key": the sync constructor paints the
   * free set, then this runs when the internal license verification resolves.
   *
   * @param {{ isGranted(id: string): boolean }} entitlements a FeatureManager or
   *   any object implementing the gate contract.
   * @returns {string[]} feature ids newly enabled by this call.
   */
  applyEntitlements(entitlements) {
    return applyEntitlementsToEditor(this, entitlements);
  },

  /**
   * Phase 1a — enable the authoring surfaces for features that just became
   * granted (called by applyEntitlements with the newly-granted id delta).
   * Each surface is additive and guarded: toolbar (2b), shortcuts+commands (2c),
   * premium plugins (2d). Failures in one surface must not break the others or
   * the editor — hence the per-step try/catch. `newlyGranted` is informational
   * here; the surfaces re-read the (already-updated) gate themselves.
   * @param {string[]} newlyGranted feature ids newly granted this apply.
   */
  _enableGrantedFeatures(newlyGranted) {
    if (this._destroyed || !Array.isArray(newlyGranted) || newlyGranted.length === 0) return;
    // 2b — toolbar: rebuild in place so newly-granted built-in items appear,
    // THEN re-contribute installed plugins' buttons (B1: rebuild()/_build() only
    // restores config items, so plugin buttons — link/image/table + premium —
    // must be re-added or they'd be permanently lost).
    try {
      if (this.toolbar && typeof this.toolbar.rebuild === 'function') {
        this.toolbar.rebuild();
        if (this.plugins && typeof this.plugins.contributeAllToolbarButtons === 'function') {
          this.plugins.contributeAllToolbarButtons();
        }
      }
    } catch (e) {
      this.logger && this.logger.warn('applyEntitlements: toolbar rebuild failed:', e && e.message);
    }
    // 2c — shortcuts: register now-granted built-in combos (idempotent; skips
    // already-registered, so no double-binding). Commands need NOTHING here:
    // they are all registered up front and gated LIVE at execute-time, so a
    // newly-granted command works the moment the gate widened (2a).
    try {
      registerGrantedShortcuts(this);
    } catch (e) {
      this.logger && this.logger.warn('applyEntitlements: shortcut registration failed:', e && e.message);
    }
    // 2d — install now-granted premium plugins into the live editor. Config
    // specs install synchronously; BUNDLED specs load lazily (async). applyEntitlements
    // itself stays SYNC (returns the delta), so we don't await here — but we STASH
    // the in-flight install promise on the editor so the awaitable callers
    // (_verifyAndApplyLicense → setLicenseKey/_initLicense) can await the bundled
    // install actually finishing. Still .catch so a failure never rejects unheard.
    //
    // ⚠️ ORDERING: 2b above already rebuilt the toolbar and re-contributed
    // buttons — but BUNDLED premium installs ASYNCHRONOUSLY, so at that moment
    // export-pdf/export-docx were not installed yet and had no buttons to
    // contribute. Nothing re-ran afterwards, so a paying customer got a working
    // `editor.exportPdf()` and NO TOOLBAR BUTTON, for the one feature they paid
    // for. Every other signal looked healthy: the plugin reported installed,
    // the feature reported granted, the spec offered the button.
    //
    // So re-contribute once the async install has actually settled. Idempotent
    // (addButton dedupes by name), so the common case where premium is already
    // installed costs one no-op pass.
    try {
      this._premiumInstallPromise = Promise.resolve(registerAndInstallPremiumPlugins(this))
        .then(() => {
          if (this._destroyed) return;
          try {
            if (this.plugins && typeof this.plugins.contributeAllToolbarButtons === 'function') {
              this.plugins.contributeAllToolbarButtons();
            }
          } catch (e) {
            this.logger && this.logger.warn(
              'applyEntitlements: premium toolbar contribution failed:', e && e.message,
            );
          }
        })
        .catch((e) => {
          this.logger && this.logger.warn('applyEntitlements: premium plugin install failed:', e && e.message);
        });
    } catch (e) {
      this.logger && this.logger.warn('applyEntitlements: premium plugin register failed:', e && e.message);
      this._premiumInstallPromise = Promise.resolve();
    }
  },
};
