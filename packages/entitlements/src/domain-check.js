/**
 * 22.2 / 22.5(a) — hostname matching + the dev-domain exemption (the Jodit
 * rule): localhost and common dev hostnames always run without a key.
 *
 * Pure string logic — no network, no DOM. `hostname` is expected to be a bare
 * host (no port, no scheme); callers pass `location.hostname`.
 */

/**
 * Dev/staging hosts that are ALWAYS keyless (premium included), with a quiet
 * "development mode" note left to the caller. Matched case-insensitively.
 *
 * DELIBERATELY NARROW (hardened 2026-07-16): only the loopback family and the
 * `*.localhost` reserved TLD (RFC 6761, always resolves to loopback). Bare
 * `.local` (mDNS/Bonjour — pervasive on real corporate LANs) and `.test` were
 * REMOVED: they were a licensing bypass, silently unlocking premium on any
 * internal-network deployment. A dev machine reaching a `.local` box is doing
 * real work on a real host and should carry a real (or trial) key.
 */
const DEV_EXACT = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);
const DEV_SUFFIXES = ['.localhost'];

/** True if `hostname` is a development host exempt from licensing. */
export function isDevHost(hostname) {
  if (typeof hostname !== 'string' || hostname === '') return false;
  const h = hostname.toLowerCase();
  if (DEV_EXACT.has(h)) return true;
  return DEV_SUFFIXES.some((suf) => h.endsWith(suf));
}

/**
 * Match a hostname against one licensed domain pattern. Supports an exact
 * host and a SINGLE-level leading wildcard:
 *   `customer.com`    matches only `customer.com`
 *   `*.customer.com`  matches `app.customer.com` AND the apex `customer.com`,
 *                     but NOT `a.b.customer.com` (single sub-level only)
 * Case-insensitive. Anything malformed returns false (fail closed).
 *
 * NOTE (Phase 5): `*.base` ALSO matches the apex `base`. This reconciles the two
 * wildcard semantics that had drifted apart — the server-side refresh matcher
 * (RefreshService.originMatches) already treated `*.base` as apex-inclusive, so a
 * license that refreshed from the apex must also VERIFY there. One rule, both sides.
 * (apex↔www auto-pairing is done at ISSUE time on the backend; this matcher only
 * needs the wildcard-apex rule.)
 */
export function hostMatchesPattern(hostname, pattern) {
  if (typeof hostname !== 'string' || typeof pattern !== 'string') return false;
  const host = hostname.toLowerCase();
  const pat = pattern.toLowerCase();
  if (!pat.startsWith('*.')) return host === pat;
  const base = pat.slice(2);
  if (base === '' || base.includes('*')) return false;
  if (host === base) return true; // apex is covered by its own wildcard
  if (!host.endsWith(`.${base}`)) return false;
  // exactly one extra label to the left of `.base`
  const label = host.slice(0, host.length - base.length - 1);
  return label.length > 0 && !label.includes('.');
}

/**
 * True if `hostname` is allowed by the license's domain list.
 *
 * An EMPTY array means a NON-DOMAIN-BOUND license → allowed on ANY host (audit
 * F2). The backend deliberately issues `domains: []` for a non-bound plan, and a
 * domain-BOUND license is guaranteed to carry ≥1 domain (issue rejects
 * bound+empty), so `[]` unambiguously means "unbound", not "missing field". A
 * non-array (malformed/absent) stays DENIED — fail closed. A non-empty list must
 * match a pattern as before.
 */
export function hostAllowed(hostname, domains) {
  if (!Array.isArray(domains)) return false;        // malformed → fail closed
  if (domains.length === 0) return true;            // non-domain-bound → any host
  return domains.some((d) => hostMatchesPattern(hostname, d));
}
