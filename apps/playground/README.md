# open-editor playground

A local dev/demo host for the editor. `npm run dev` (or `npx vite`) serves it
at `http://localhost:5173`.

## What's on the page

- **The main editor** (`#editor` in `index.html`) — every first-party free
  plugin installed individually, no license/gating wired in. This is the
  "just try the editor" surface most tests in `tests/` exercise.
- **`src/premium-panel.js`** — "Premium license (dev)" panel. Mints an
  **ephemeral, in-browser** ES256 license (its own throwaway keypair) purely
  to exercise the premium-plugin gate (`hello-premium`/`export-pdf`/
  `export-docx`/`seo`) with zero server involvement. Good for iterating on a
  premium plugin's gating without touching the backend at all. Cannot verify
  a real backend-issued license — its keyring only ever contains its own key.
- **`src/real-license-panel.js`** — "Real license (Phase 5b)" panel. Pastes
  an **ACTUAL license issued by `open-editor-backend`** (e.g. from a real
  Stripe test-mode purchase, or `POST /admin/licenses`), fetches the
  backend's REAL published public key from
  `http://localhost:8787/.well-known/jwks.json`, and verifies it for real.
  Unlike the main editor, it mounts its OWN dedicated `OpenEditor` instance
  (core-feature gating is a construction-time contract — see the file's own
  header comment) and destroys/recreates it on every apply/clear. One
  verified license drives BOTH the core toolbar/command/shortcut/slash/
  autoformat gate (`config.entitlements`) and the premium-plugin gate
  (`gatePremiumPlugin`) — proving the "one license, both gates" contract this
  whole project depends on. This is the live-buy-to-editor proof behind
  **Phase 5** of `FEATURE-GATING-PHASES.md`.

## Running the real-license-panel demo against a live backend

1. Start `open-editor-backend` locally (`npm run build && node dist/main.js`,
   or `npm run start:dev`) — needs a signing key configured
   (`LICENSE_PRIVATE_KEY`/`LICENSE_KID`, see the backend's own README) so
   `/.well-known/jwks.json` actually serves a key.
2. **Domain binding & dev hosts**: the panel verifies with
   `allowDevHost: true`, so a valid license works on (a) a local dev host —
   `localhost`, `127.0.0.1`, `::1`, `*.localhost` — AND (b) the exact domain(s)
   the license was issued for. Nothing else. So for LOCAL testing you can load
   the playground from either `http://localhost:5173` or `http://127.0.0.1:5173`
   and any valid token works regardless of its bound domain (dev-host grants
   all features locally — the "localhost is a free zone" rule). On a real
   non-dev host, only the licensed domain works.
   - **CORS**: the panel's `BACKEND_URL` (top of `src/real-license-panel.js`)
     is `http://localhost:8787`. Whichever origin you load the playground from
     (`localhost:5173` and/or `127.0.0.1:5173`) must be in the backend's
     `AI_CORS_ORIGINS` — the local `.env` already lists both. See
     `open-editor-backend/.env.example`.
3. Get a real license token — either buy a real (test-mode) package via
   `open-editor-web`'s `/pricing` → `/checkout` (embedded) → success page, or
   mint one directly via the admin API: `POST /admin/licenses` with a
   `customerId`/`packageId`/`domains`. (On a dev host the bound domain doesn't
   need to match; on production it must.)
4. Paste the token into the panel, click **Verify & apply**.

## `stripe listen` — required for a REAL purchase to fulfill locally

If you're testing the FULL buy-flow (not just pasting an admin-issued
license), `stripe listen --forward-to localhost:8787/billing/webhook` must be
running for the **entire time** you want checkout to work — there's no
public HTTPS endpoint for Stripe to call directly in local dev. If it's not
running when someone pays, the order gets stuck `pending` forever (no
license mints, no email sends) and the buyer's success page just times out
to a vague "almost there" with no real error. Check `GET /admin/orders` for
`stalePending: true` if a purchase seems to have vanished — see
`open-editor-backend/PHASE-F-LIVE-CHECKLIST.md`.

## Permanent test coverage

`tests/real-license-panel.test.js` is a committed, CI-safe Playwright suite
for the real-license-panel (no live backend needed — it intercepts the JWKS
fetch and signs its own real ES256 test licenses in-page, exercising the
exact same verify/gate code path). Run it like any other suite:
```
npx playwright test tests/real-license-panel.test.js
```
