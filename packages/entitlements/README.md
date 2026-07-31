# @openeditors/entitlements

The Open Editor entitlements foundation: the feature-id registry, the **offline
ES256 license verifier**, `FeatureManager`, and domain helpers. It imports nothing
from the editor core — it does not know the editor exists.

## Packaging & publish policy (Phase 0 note — read before "fixing")

This package is `"private": true` and carries the shared **`prepublishOnly`
publish guard** (`scripts/guard-no-publish.mjs`), exactly like the premium
packages — so it can never reach the public npm registry by accident.

**BUT, unlike the premium packages, it ships its source UNMINIFIED
(`files: ["src"]`), and that is intentional — not an oversight:**

1. **It is MIT-licensed** (`"license": "MIT"`), whereas the premium packages are
   proprietary (`SEE LICENSE IN LICENSE`). There is no commercial secret here to
   protect by minifying.
2. **It holds no secret material.** The verifier is **public-key only** — it
   checks ES256 signatures against the published JWKS public key. Reading this
   source teaches an attacker nothing they couldn't already learn from any
   client-side verifier; the security of the scheme rests on the server-held
   **private** signing key, which lives in the backend (KMS), never here.
   - The `./issuer` subpath (`dev-issuer.js`) *can* sign, but it **generates its
     own ephemeral P-256 keypair** for local development/tests and is Node-only.
     It contains no production key. Production issuance is re-implemented
     server-side (backend) with a KMS-held key.
3. **It gets bundled + minified into `openeditor-text` in Phase 1.** The
   one-package model pulls the verifier into the core bundle (which already ships
   minified), so the customer-facing distribution of this code is minified
   there. Minifying the standalone package now would be low-value churn on code
   that is about to be absorbed.

**Net:** the `private:true` flag + publish guard protect against accidental
publish (defense in depth); the MIT license + zero-secret nature mean there is
nothing to hide by minifying the standalone package; and Phase 1 handles the
minified customer distribution via the core bundle. If a future change makes this
package hold a secret or go proprietary, revisit this decision and add it to
`scripts/build-premium.mjs` like the premium packages.
