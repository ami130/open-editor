/**
 * 22.4 — dev license issuer. Node-only (uses `node:crypto`). Signs ES256
 * license JWTs for local development and testing so Phase 19 premium plugins
 * are built against REAL license mechanics long before the platform (23)
 * exists. NEVER shipped to a browser — reached only via the ./issuer subpath.
 *
 * The production license service (23.2) re-implements issuance server-side
 * with KMS-held keys; this issuer is the same token format with a local key.
 */
import { generateKeyPairSync, createSign, createPublicKey } from 'node:crypto';
import { validateFeatureList } from '../feature-registry.js';

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Generate a P-256 dev keypair. Returns PEM strings + the public JWK. */
export function generateDevKeyPair() {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const publicJwk = publicKey.export({ format: 'jwk' });
  return {
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }),
    publicJwk,
  };
}

/** Derive the public JWK from a private PEM (for building a verifier keyring). */
export function publicJwkFromPrivatePem(privateKeyPem) {
  return createPublicKey(privateKeyPem).export({ format: 'jwk' });
}

/**
 * Sign a development license.
 *
 * @param {object} opts
 * @param {string} opts.privateKeyPem  PKCS8 PEM (P-256)
 * @param {string} opts.kid            key id (goes in the header; matches keyring)
 * @param {string[]} opts.features     granted feature ids (validated vs registry)
 * @param {string[]} opts.domains      bound hostnames (exact or `*.base`)
 * @param {object} [opts.limits]       numeric limits (seats, editors…)
 * @param {string} [opts.customer]     free-form customer id
 * @param {string} [opts.plan]         plan name (informational)
 * @param {number} [opts.iat]          issued-at (unix s); default now
 * @param {number} [opts.ttlSeconds]   lifetime; default 365 days
 * @param {boolean} [opts.skipFeatureValidation] escape hatch for adversarial tests
 * @returns {string} compact JWS license
 */
export function signDevLicense(opts) {
  const {
    privateKeyPem, kid, features = [], domains = [], limits = {},
    customer = 'dev', plan = 'dev', iat, ttlSeconds = 365 * 24 * 3600,
    skipFeatureValidation = false,
  } = opts;

  if (!privateKeyPem) throw new Error('privateKeyPem required');
  if (!kid) throw new Error('kid required');
  if (!skipFeatureValidation) {
    const check = validateFeatureList(features);
    if (!check.ok) {
      throw new Error(`invalid features: malformed=${check.malformed.join(',')} unknown=${check.unknown.join(',')}`);
    }
  }

  const issued = typeof iat === 'number' ? iat : Math.floor(Date.now() / 1000);
  const header = { alg: 'ES256', kid, typ: 'JWT' };
  const payload = {
    lic: `dev-${issued}`,
    customer, plan, features, domains, limits,
    iat: issued, exp: issued + ttlSeconds,
  };

  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;

  // Node ECDSA output is DER; JWS/WebCrypto expect raw r||s (P1363, 64 bytes).
  const der = createSign('SHA256').update(signingInput).end().sign(privateKeyPem);
  const sig = derToP1363(der, 32);

  return `${signingInput}.${b64url(sig)}`;
}

/** Convert a DER-encoded ECDSA signature to fixed-length r||s (P1363). */
function derToP1363(der, size) {
  let offset = 2; // skip SEQUENCE tag + length
  if (der[1] & 0x80) offset += der[1] & 0x7f; // long-form length
  const read = () => {
    if (der[offset++] !== 0x02) throw new Error('bad DER integer');
    const len = der[offset++];
    const start = offset;
    offset += len;
    let bytes = der.subarray(start, offset);
    while (bytes.length > size && bytes[0] === 0x00) bytes = bytes.subarray(1); // strip sign pad
    const out = Buffer.alloc(size);
    bytes.copy(out, size - bytes.length);
    return out;
  };
  return Buffer.concat([read(), read()]);
}
