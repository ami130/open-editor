/**
 * activated-key.js — remembers a licence key handed to this browser by a §2.4
 * activation claim.
 *
 * ─── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * When someone buys premium from inside the editor, the backend hands their key
 * to the very next session for that install — ONCE. The claim is deliberately
 * single-use (an install id appears in server logs, so a repeatable claim would
 * make any log reader a permanent free customer).
 *
 * "Once" means the loader MUST persist what it receives. Without this module the
 * upgrade would appear on one page load and vanish on refresh, and the claim
 * that could have restored it is already spent — the customer would be left
 * with no premium and no obvious cause.
 *
 * ─── WHAT IS STORED ─────────────────────────────────────────────────────────
 * The signed licence key: the same value the customer was emailed, and the same
 * one they would otherwise paste into config. It is not additionally sensitive
 * here — a licence key is a client-side credential by design, domain-bound and
 * seat-capped server-side — but it IS a credential, so it is namespaced per
 * endpoint rather than shared across origins.
 *
 * Losing it is safe: the customer still has the emailed key, and an admin can
 * re-arm an activation. Failing to store it must never break the page, so every
 * path here degrades silently.
 */

const KEY_PREFIX = 'open-editor.licence-key';

/** Scoped per endpoint so two backends on one origin cannot read each other's key. */
function storageKey(endpoint) {
  return `${KEY_PREFIX}::${endpoint || 'default'}`;
}

function store() {
  try {
    return globalThis.localStorage || null;
  } catch {
    // Accessing localStorage THROWS in sandboxed/blocked contexts rather than
    // returning undefined, so the read itself must be guarded.
    return null;
  }
}

/** The key previously handed to this browser, or null. */
export function readActivatedKey(endpoint) {
  const s = store();
  if (!s) return null;
  try {
    const v = s.getItem(storageKey(endpoint));
    return typeof v === 'string' && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

/**
 * Remember a key handed over by an activation claim.
 *
 * Returns whether it was stored, so a caller can warn when a purchase cannot be
 * remembered — but a false return is never fatal on its own.
 */
export function writeActivatedKey(endpoint, licenceKey) {
  if (typeof licenceKey !== 'string' || !licenceKey) return false;
  const s = store();
  if (!s) return false;
  try {
    s.setItem(storageKey(endpoint), licenceKey);
    return true;
  } catch {
    // Quota exceeded, or storage disabled mid-session.
    return false;
  }
}

/** Forget the stored key — used when the server no longer honours it. */
export function clearActivatedKey(endpoint) {
  const s = store();
  if (!s) return;
  try {
    s.removeItem(storageKey(endpoint));
  } catch {
    /* nothing to do */
  }
}
