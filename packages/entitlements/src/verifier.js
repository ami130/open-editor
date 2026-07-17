/**
 * 22.2 — offline license verification. ES256 (ECDSA P-256 + SHA-256) via
 * native WebCrypto (`crypto.subtle`) — zero bundled cryptography. Every path
 * FAILS CLOSED: any doubt returns `{ valid:false, reason }`, never throws to
 * the caller and never "passes on error".
 *
 * Imports only sibling modules in this package — nothing from the editor core.
 */
import { decodeJwt } from './jwt-codec.js';
import { hostAllowed, isDevHost } from './domain-check.js';

/** Reasons are stable strings so hosts/tests can branch on them. */
export const REASON = {
  OK: 'ok',
  DEV_HOST: 'dev-host',
  NO_SUBTLE: 'no-webcrypto',
  MALFORMED: 'malformed-token',
  ALG: 'unsupported-alg',
  UNKNOWN_KID: 'unknown-kid',
  BAD_SIGNATURE: 'bad-signature',
  EXPIRED: 'expired',
  NOT_YET_VALID: 'not-yet-valid',
  DOMAIN: 'domain-mismatch',
  SHAPE: 'bad-payload-shape',
  LIFETIME: 'lifetime-too-long',
};

// Only ES256 is accepted today. 'none', HS-family, and RS-family algs are all
// rejected up front — this is the alg-confusion defense.
const SUPPORTED_ALGS = new Set(['ES256']);
const ALG_TO_SUBTLE = { ES256: { name: 'ECDSA', hash: 'SHA-256' } };

/** Small negative skew tolerated on iat (clock drift); none on exp. */
const IAT_SKEW_SECONDS = 300;

// Sanity ceiling on total license lifetime (exp - iat). A signed token with an
// absurd expiry (a fat-fingered issuer minting a 30-year key) is treated as
// invalid — real licenses are annual/multi-year, never decades. 3 years + a
// margin covers legitimate multi-year enterprise deals; anything beyond is a
// mistake or abuse. Fails closed.
const MAX_LIFETIME_SECONDS = 3 * 366 * 24 * 3600 + 30 * 24 * 3600; // ~3y + 30d

function subtle() {
  const c = (typeof globalThis !== 'undefined' && globalThis.crypto) || null;
  return c && c.subtle ? c.subtle : null;
}

function fail(reason) { return { valid: false, reason }; }

/**
 * Verify a license token offline.
 *
 * @param {string} token compact JWS license
 * @param {object} opts
 * @param {Array<{kid,alg,key:CryptoKey}>} opts.keyring imported public keys
 * @param {string} opts.hostname   host to bind against (e.g. location.hostname)
 * @param {number} opts.now        unix seconds (injectable for tests)
 * @param {boolean} [opts.allowDevHost=false] honor the dev-host exemption.
 *   Defaults to FALSE: the raw verify path is strict. The integration layer
 *   (the editor plugin / host) opts IN to dev-host bypass explicitly, so a
 *   plugin that simply verifies a token can never accidentally unlock premium
 *   on an unexpected hostname.
 * @returns {Promise<{valid, reason, payload?, devHost?, lic?}>}
 */
export async function verifyLicense(token, opts = {}) {
  const { keyring = [], hostname = '', now = Math.floor(Date.now() / 1000), allowDevHost = false } = opts;

  // Dev-host exemption BEFORE any crypto — development never fights the license.
  if (allowDevHost && isDevHost(hostname)) return { valid: true, reason: REASON.DEV_HOST, devHost: true };

  const cs = subtle();
  if (!cs) return fail(REASON.NO_SUBTLE); // non-secure context / no WebCrypto

  let decoded;
  try { decoded = decodeJwt(token); } catch { return fail(REASON.MALFORMED); }
  const { header, payload, signature, signingInput } = decoded;

  if (!header || !SUPPORTED_ALGS.has(header.alg)) return fail(REASON.ALG);

  const entry = keyring.find((k) => k.kid === header.kid && k.alg === header.alg);
  if (!entry) return fail(REASON.UNKNOWN_KID);

  let sigOk;
  try {
    sigOk = await cs.verify(ALG_TO_SUBTLE[header.alg], entry.key, signature, signingInput);
  } catch {
    return fail(REASON.BAD_SIGNATURE); // treat any verify error as failure
  }
  if (!sigOk) return fail(REASON.BAD_SIGNATURE);

  // Claims — only trusted AFTER the signature check passes.
  if (!isPayloadShapeValid(payload)) return fail(REASON.SHAPE);
  if (payload.exp - payload.iat > MAX_LIFETIME_SECONDS) return fail(REASON.LIFETIME);
  if (payload.iat - IAT_SKEW_SECONDS > now) return fail(REASON.NOT_YET_VALID);
  if (payload.exp <= now) return fail(REASON.EXPIRED);
  if (!hostAllowed(hostname, payload.domains)) return fail(REASON.DOMAIN);

  return { valid: true, reason: REASON.OK, payload, lic: payload.lic || null };
}

/** Minimal structural contract for a license payload. */
export function isPayloadShapeValid(p) {
  return !!p
    && Array.isArray(p.features)
    && p.features.every((f) => typeof f === 'string')
    && Array.isArray(p.domains)
    && typeof p.exp === 'number'
    && typeof p.iat === 'number';
}

/**
 * Import a raw public JWK (or SPKI) as an ES256 verify key. Convenience so
 * hosts can build a keyring from published key material.
 */
export async function importEs256PublicKey(jwk) {
  const cs = subtle();
  if (!cs) throw new Error('WebCrypto unavailable');
  return cs.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
}
