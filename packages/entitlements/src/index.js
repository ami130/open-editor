/**
 * @openeditors/entitlements — Phase 22 entitlements foundation.
 *
 * Browser-facing surface: feature registry, offline ES256 license verifier,
 * FeatureManager, and domain helpers. Imports NOTHING from the editor core —
 * this package does not know the editor exists. (The dev issuer is Node-only
 * and lives behind the ./issuer subpath so it never reaches a browser bundle.)
 */
export {
  FEATURES,
  getFeature,
  allFeatureIds,
  isRegisteredFeature,
  isValidFeatureIdShape,
  validateFeatureList,
} from './feature-registry.js';

export {
  verifyLicense,
  importEs256PublicKey,
  isPayloadShapeValid,
  REASON,
} from './verifier.js';

export { FeatureManager } from './feature-manager.js';

export { isDevHost, hostMatchesPattern, hostAllowed } from './domain-check.js';

export { decodeJwt } from './jwt-codec.js';
