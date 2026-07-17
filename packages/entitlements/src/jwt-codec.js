/**
 * 22.2 — base64url + JWT structural decoding. Environment-neutral: uses only
 * `atob`/`TextEncoder`/`Uint8Array`, present in browsers and Node ≥18.
 *
 * Decoding is PURELY structural — it never trusts anything it decodes. The
 * verifier applies signature/claim checks; a decoded token is "untrusted
 * bytes in a known shape" until then.
 */

/** Decode a base64url string to a Uint8Array. Throws on malformed input. */
export function base64urlToBytes(str) {
  if (typeof str !== 'string' || str.length === 0) throw new Error('empty');
  // Reject anything outside the base64url alphabet up front (no '+', '/', '=').
  if (/[^A-Za-z0-9\-_]/.test(str)) throw new Error('bad base64url alphabet');
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4;
  if (pad === 1) throw new Error('bad base64url length');
  if (pad) b64 += '='.repeat(4 - pad);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Decode a base64url string to a UTF-8 string. */
export function base64urlToString(str) {
  return new TextDecoder().decode(base64urlToBytes(str));
}

/** Decode a base64url-encoded JSON object. Throws unless it's a plain object. */
export function base64urlToJson(str) {
  const obj = JSON.parse(base64urlToString(str));
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new Error('not a JSON object');
  }
  return obj;
}

/**
 * Split and structurally decode a compact JWS (`header.payload.signature`).
 * Returns `{ header, payload, signingInput, signature }` where `signingInput`
 * is the exact ASCII bytes that were signed and `signature` is the raw bytes.
 * Throws on any structural problem — the caller treats a throw as "invalid".
 */
export function decodeJwt(token) {
  if (typeof token !== 'string') throw new Error('token not a string');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('not a 3-part JWT');
  const [h, p, s] = parts;
  const header = base64urlToJson(h);
  const payload = base64urlToJson(p);
  const signature = base64urlToBytes(s);
  const signingInput = new TextEncoder().encode(`${h}.${p}`);
  return { header, payload, signature, signingInput };
}
