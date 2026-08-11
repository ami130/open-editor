/**
 * install-id.js — a stable, anonymous identifier for this browser profile
 * (execution plan §1.5 stage 3, decision T18).
 *
 * ─── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * Anonymous free sessions ship in Phase 1, and without any identifier:
 *
 *   • per-install rate limiting is impossible — only per-IP, which is blunt
 *     enough to punish a whole office for one abuser (T20)
 *   • S1's "record usage from day one" has nothing to attribute usage TO, and
 *     retrofitting that after every customer is live means changing the very
 *     endpoint they all call
 *
 * ─── WHAT IT IS NOT ─────────────────────────────────────────────────────────
 * NOT a user identifier, and deliberately not capable of becoming one. It is a
 * random value with no derivation from anything about the person or device: no
 * fingerprinting, no canvas hashing, no IP, no user agent. Two people sharing a
 * machine under one browser profile share an install id, and the same person on
 * two devices has two — which is exactly right for "how many installs are
 * calling us", and useless for tracking anyone.
 *
 * Clearing site data resets it, and that is the intended behaviour rather than
 * something to defend against.
 */

const STORAGE_KEY = 'open-editor.install-id';

/** Prefix makes the value self-describing in logs and support tickets. */
const PREFIX = 'oe';

/**
 * Read the existing install id, or mint one on first run.
 *
 * localStorage rather than IndexedDB: this is a single short string on the hot
 * path, wanted synchronously before the session request goes out. The bundle
 * cache uses IndexedDB precisely because it is the opposite case — large, async,
 * and not needed before the first network call.
 *
 * Returns null when storage is unavailable (private browsing, disabled
 * cookies, sandboxed iframes). A missing install id must NEVER block a load —
 * the session simply goes out without one, exactly as it did before T18.
 */
export function getInstallId() {
  let store;
  try {
    store = globalThis.localStorage;
    if (!store) return null;
  } catch {
    // Accessing localStorage THROWS in some sandboxed/blocked contexts rather
    // than returning undefined, so the read itself must be guarded.
    return null;
  }

  try {
    const existing = store.getItem(STORAGE_KEY);
    if (isValidInstallId(existing)) return existing;

    const fresh = mintInstallId();
    store.setItem(STORAGE_KEY, fresh);
    return fresh;
  } catch {
    // Quota exceeded, or storage disabled mid-session. Degrade to anonymous.
    return null;
  }
}

/**
 * Mint a new identifier: 128 bits of randomness, hex, prefixed.
 *
 * randomUUID is not used because it is unavailable on insecure origins in some
 * browsers, and this must not become another reason a load fails. getRandomValues
 * has far wider support; Math.random is the last resort and is fine here —
 * this value is a bucket label, not a secret, and nothing is authorised by it.
 */
export function mintInstallId() {
  const bytes = new Uint8Array(16);
  const crypto = globalThis.crypto;
  if (crypto?.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return `${PREFIX}_${hex}`;
}

/**
 * Is this a value we minted?
 *
 * Guards against a corrupted or hand-edited entry becoming a permanently
 * malformed id: the backend caps installId at 128 chars, and an oversized or
 * junk value would be rejected on every single session forever.
 */
export function isValidInstallId(value) {
  return typeof value === 'string' && new RegExp(`^${PREFIX}_[0-9a-f]{32}$`).test(value);
}
