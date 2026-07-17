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
 *   `*.customer.com`  matches `app.customer.com`, NOT `a.b.customer.com`,
 *                     and NOT the apex `customer.com`
 * Case-insensitive. Anything malformed returns false (fail closed).
 */
export function hostMatchesPattern(hostname, pattern) {
  if (typeof hostname !== 'string' || typeof pattern !== 'string') return false;
  const host = hostname.toLowerCase();
  const pat = pattern.toLowerCase();
  if (!pat.startsWith('*.')) return host === pat;
  const base = pat.slice(2);
  if (base === '' || base.includes('*')) return false;
  if (!host.endsWith(`.${base}`)) return false;
  // exactly one extra label to the left of `.base`
  const label = host.slice(0, host.length - base.length - 1);
  return label.length > 0 && !label.includes('.');
}

/** True if `hostname` matches ANY pattern in the license's domain list. */
export function hostAllowed(hostname, domains) {
  return Array.isArray(domains) && domains.some((d) => hostMatchesPattern(hostname, d));
}
