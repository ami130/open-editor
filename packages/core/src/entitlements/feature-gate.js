/**
 * feature-gate.js — the editor's OWN feature-gating predicate.
 *
 * Core is deliberately crypto-free: it does NOT verify licenses. The license is
 * verified offline (license-runtime.js) and the RESULT is passed in via config —
 * either an `entitlements` object with `isGranted(id)` (a verified FeatureManager)
 * or a static `grantedFeatures` list. This module turns that config into a single
 * predicate `isFeatureGranted(id)` that every authoring surface (toolbar,
 * commands, shortcuts, slash, autoformat) consults.
 *
 * FAIL-CLOSED is now the DEFAULT (`enforceFreeTier: true`, editor-config.js) —
 * flipped in Phase 1a-3c once premium ships bundled in the one package, so a
 * keyless install must NOT unlock the bundled premium. In this mode:
 *     1. ALWAYS_ON            → granted (never gated — gating it breaks the editor).
 *     2. explicit `'*'` list  → grant all.
 *     3. entitlements present → FREE set always granted; premium granted iff
 *        `entitlements.isGranted(id)` (entitlements takes precedence over a list).
 *        A dev-host FeatureManager grants all here (its isGranted returns true).
 *     4. explicit grantedFeatures array (no entitlements) → grant EXACTLY that
 *        list (restrictive allowlist; the free-set blanket does NOT apply).
 *     5. pure keyless (no list, no entitlements) → FREE set granted, premium DENIED.
 *
 * LEGACY grant-all mode — opt OUT with `enforceFreeTier: false` (e.g. an embed
 * that ships no premium at all): no config → grant ALL; `'*'`/list as before.
 * Kept for backward compatibility; not the default.
 */
import { allEditorFeatureIds } from './feature-catalog.js';

/** The FREE set: every non-premium catalog id (core + free plugins). Frozen. */
export const FREE_SET = new Set(allEditorFeatureIds());

/**
 * Feature ids (and command names) that must ALWAYS work regardless of license,
 * or the editor becomes unusable / corrupts. Kept intentionally small.
 * These are matched by BOTH catalog-id form and raw command name so callers can
 * pass either during the migration.
 */
export const ALWAYS_ON = new Set([
  // core catalog ids (Phase 1 will formalize these)
  'core.typing', 'core.undo', 'core.redo', 'core.clipboard', 'core.selection',
  'core.paragraph', 'core.removeFormat',
  // raw command names that map to the above always-on capabilities. These are
  // load-bearing (selection/clipboard/a11y/paragraph/cleanup) — gating them
  // would break the editor, so they are NEVER gated regardless of license.
  'undo', 'redo', 'paragraph',
  'selectAll', 'cut', 'copyAsPlainText',      // selection + clipboard
  'accessibilityHelp',                        // a11y help dialog
  'removeFormat', 'unlink',                   // format cleanup
  'removeTextColor', 'removeBackgroundColor', 'removeBgColor', // color cleanup
]);

/**
 * Build the gate predicate from resolved config.
 * @param {{ grantedFeatures?: string[]|null, entitlements?: { isGranted?: (id:string)=>boolean }|null }} cfg
 * @returns {(featureId: string) => boolean}
 */
export function createFeatureGate(cfg = {}) {
  const entitlements = cfg.entitlements || null;
  const list = cfg.grantedFeatures;
  const enforceFreeTier = cfg.enforceFreeTier === true;

  // An entitlements object with isGranted() takes precedence.
  const hasEntitlements = entitlements && typeof entitlements.isGranted === 'function';

  // Grant-all when nothing is configured, or when '*' is present.
  const grantAll = !hasEntitlements && (list == null || (Array.isArray(list) && list.includes('*')));

  const set = Array.isArray(list) ? new Set(list) : null;
  // Explicit wildcard grant-all: an explicit '*' in the list. Distinct from the
  // legacy no-config grant-all, which must NOT leak premium in enforce mode.
  // NOTE: a dev-host license is NOT handled here — a dev-host FeatureManager's
  // isGranted() already returns true for everything, so it grants-all via the
  // hasEntitlements branch below. (An earlier `entitlements.devHost === true`
  // clause here was dead: FeatureManager exposes _devHost privately, never a
  // public `.devHost` field, so it never matched the real object.)
  const explicitStar = Array.isArray(list) && list.includes('*');

  return function isFeatureGranted(featureId) {
    if (!featureId) return true;                 // no id → don't gate
    if (ALWAYS_ON.has(featureId)) return true;   // never gate the core

    if (enforceFreeTier) {
      // Explicit '*' in the list → grant everything. (Dev-host grants-all via
      // the hasEntitlements branch below, since its isGranted() returns true.)
      if (explicitStar) return true;
      // An ENTITLEMENTS object (a verified license / FeatureManager) is the
      // authoritative, LIVE grant and takes precedence over a static
      // grantedFeatures list (which is only the construct-time default; after
      // applyEntitlements both may be present). Free is ALWAYS granted on top —
      // a real license lists only PREMIUM, so without this layer a paying
      // customer would lose free features.
      if (hasEntitlements) {
        if (FREE_SET.has(featureId)) return true;         // free, always
        try { return !!entitlements.isGranted(featureId); } catch { return false; }
      }
      // No entitlements object: an explicit grantedFeatures ARRAY is a deliberate
      // "grant EXACTLY these" restrictive allowlist (Phase-2 limited-license
      // contract) — honor it verbatim, the free-set blanket does NOT apply.
      if (set) return set.has(featureId) || set.has('*');
      // Pure keyless default (no list, no entitlements): free granted, premium
      // denied. The "npm install, no key" one-package case.
      if (FREE_SET.has(featureId)) return true;
      return false;                                       // premium + no key → DENY
    }

    // LEGACY grant-all mode (enforceFreeTier:false, opt-out) — grant-all default.
    if (grantAll) return true;
    if (hasEntitlements) {
      try { return !!entitlements.isGranted(featureId); } catch { return false; }
    }
    if (set) return set.has(featureId) || set.has('*');
    return true; // defensive: unknown config shape → don't break the editor
  };
}
