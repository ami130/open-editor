/**
 * 19.2 — the premium host. Verifies a license once (offline, ES256) and
 * exposes the resulting FeatureManager. Created ONCE per page/app, then
 * passed to every premium feature package's create*Plugin(host) factory.
 *
 * Fails closed at every step: bad keys, bad token, wrong host, no WebCrypto —
 * all resolve to the free tier (manager grants nothing). Never throws for
 * license problems; integration mistakes (missing args) do throw, loudly.
 */
import { verifyLicense, importEs256PublicKey, FeatureManager, REASON } from '@openeditors/entitlements';

/**
 * Create a premium host from a license token + published public key(s).
 *
 * @param {object}   [opts]
 * @param {string}   [opts.license]       compact JWS license token; absent → free tier
 * @param {Array<{kid: string, jwk: object}>} [opts.keys] published ES256 public JWKs
 * @param {string}   [opts.hostname]      host to bind against; defaults to location.hostname
 * @param {boolean}  [opts.allowDevHost=false] opt IN to the localhost/dev exemption.
 *   Deliberately strict by default (mirrors verifyLicense): premium must never
 *   unlock on an unexpected hostname because an integrator forgot a flag.
 * @param {boolean}  [opts.upgradeNotice=true] show the non-blocking upgrade
 *   notice (19.3) when a gated plugin is denied; false = deny silently
 *   (the 'premiumDenied' editor event still fires either way).
 * @param {number}   [opts.now]           unix seconds (injectable for tests)
 * @returns {Promise<{manager: FeatureManager, result: object|null,
 *   gate: (id: string) => {allowed: boolean, reason: string},
 *   upgradeNotice: boolean}>}
 */
export async function createPremiumHost(opts = {}) {
  const {
    license = null,
    keys = [],
    hostname,
    allowDevHost = false,
    upgradeNotice = true,
    now,
  } = opts;

  const host = hostname != null
    ? hostname
    : (typeof location !== 'undefined' && location ? location.hostname : '');

  let result = null;
  if (license || allowDevHost) {
    const keyring = await buildKeyring(keys);
    const verifyOpts = { keyring, hostname: host, allowDevHost };
    if (typeof now === 'number') verifyOpts.now = now;
    result = await verifyLicense(license || '', verifyOpts);
  }
  // No license and no dev exemption requested → free tier, nothing to verify.

  const manager = new FeatureManager(result);
  return {
    manager,
    result,
    upgradeNotice,
    gate: (featureId) => manager.gate(featureId),
  };
}

/**
 * Import published JWKs into a verifier keyring. A key that fails to import
 * (malformed JWK, no WebCrypto) is skipped — verification then fails closed
 * with `unknown-kid` rather than this host construction throwing.
 */
async function buildKeyring(keys) {
  const ring = [];
  for (const entry of Array.isArray(keys) ? keys : []) {
    if (!entry || typeof entry.kid !== 'string' || !entry.jwk) continue;
    try {
      const key = await importEs256PublicKey(entry.jwk);
      ring.push({ kid: entry.kid, alg: 'ES256', key });
    } catch { /* skip — fail closed via unknown-kid */ }
  }
  return ring;
}

export { REASON };
