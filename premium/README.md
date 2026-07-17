# Premium packages (Phase 19)

License-gated features. **Nothing in this tree ever ships in the free build** —
the boundary is structural (separate workspace tree, separate packages), verified
by the size gate and a bundle grep in CI review.

## How it works

```
license token (signed ES256 JWT, minted by the admin platform — Phase 23)
        │
        ▼
createPremiumHost({ license, keys })     ← @openeditor-premium/runtime
        │  offline verify (WebCrypto), fails closed
        ▼
FeatureManager  →  gatePremiumPlugin(host, featureId, spec)
        │
        ├─ granted → raw plugin spec, installed like any core plugin
        └─ denied  → same-name stub: 'premiumDenied' event + one dismissible,
                     non-blocking upgrade notice. The free editor is untouched.
```

Plans/packages are composed by the admin from **feature ids** (see
`packages/entitlements/src/feature-registry.js`) — the vocabulary is
ADDITIVE-ONLY: an id, once shipped, is never renamed or removed.

## Adding a feature package (copy the `hello/` template)

1. `premium/<feature>/` with `package.json` depending on
   `@openeditor-premium/runtime` (workspace).
2. Declare ONE registered feature id: `export const FEATURE_ID = '…'`.
3. Keep the raw plugin spec module-private; export only the gated factory:
   `create<Feature>Plugin(host)` → `gatePremiumPlugin(host, FEATURE_ID, rawSpec())`.
4. Same quality bar as core: ≤300-line source files, zero dependencies,
   unit tests + e2e, theme variables only (no color literals).
5. `pnpm test:packages` and root `pnpm lint` pick the package up automatically.

## Integration (what a customer's app does)

```js
import { createPremiumHost } from '@openeditor-premium/runtime';
import { createExportPdfPlugin } from '@openeditor-premium/export-pdf';

const host = await createPremiumHost({
  license: '<token>',
  keys: [{ kid: 'prod-2026', jwk: PUBLISHED_PUBLIC_JWK }],
  // allowDevHost: true  → opt-in localhost exemption for development
});
editor.plugins.install(createExportPdfPlugin(host));
```

Re-licensing at runtime (SPA fetches the license async): uninstall, then
`plugins.register(create…Plugin(newHost))` **before** `plugins.install(name)`
— install-by-spec resolves the previously registered spec by name — and call
`resetUpgradeNotice(editor)` so the notice reflects the new grants.

## Dev tooling

- **Playground panel** — "Premium license (dev)": mints real in-browser ES256
  licenses per feature-flag checkbox; `window.__premium` drives the same paths
  in e2e (`apps/playground/tests/premium-gate.test.js`).
- **Node issuer** — `@openeditors/entitlements/issuer` (`signDevLicense`) for
  tests and CLI tooling.
