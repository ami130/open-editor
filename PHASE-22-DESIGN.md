# Phase 22 Design Decision — License Crypto & Contract

**Prepared:** 2026-07-15 · **Status:** awaiting owner approval — nothing in
22.x is built until the algorithm decision below is signed off.
**Scope:** the one genuine engineering choice of Phase 22 (signature
algorithm), plus the concrete contracts the rest of the phase builds against.

---

## 1. The problem

Phase 22.2 (and the 19.1 decision record) specify **Ed25519-signed JWTs,
verified offline in the browser**. Three constraints collide:

1. **Zero-dependency policy** — no npm crypto libraries, ever.
2. **Browser floor** — Chrome/Edge 90+, Firefox 88+, Safari 14+ (the
   project's published support table; premium customers are exactly the
   enterprises that run older fleets).
3. **WebCrypto Ed25519 is too new for that floor.** As of the knowledge
   available at writing: Safari shipped it in 17 (2023), Firefox in ~129
   (2024), Chrome/Edge enabled it by default only in 2025 (~137). Every
   browser BELOW those versions — including the entire supported floor —
   has `crypto.subtle` but NOT Ed25519. *(Verify against caniuse at build
   time; the floor conclusion will not change.)*

So "Ed25519 via WebCrypto" cannot serve the support table, and "Ed25519 via
bundled JS" means vendoring and maintaining hand-ported cryptography — the
single worst category of code for a zero-dep, single-maintainer project to
own.

## 2. Options

| | Option | Floor coverage | Crypto code shipped | Risk |
|---|---|---|---|---|
| A | **ES256 (ECDSA P-256) via WebCrypto** | ✅ native everywhere since ~Chrome 37 / Firefox 34 / Safari 11 | **zero** | lowest |
| B | Ed25519 native + bundled JS fallback | ✅ (via fallback) | ~1–2 KB vendored | medium — two code paths, one is hand-owned crypto |
| C | Ed25519 bundled always | ✅ | ~1–2 KB vendored | medium+ — all verification rides on hand-owned crypto |

Security-wise, ES256 and Ed25519 are both far beyond adequate for license
signing (the "attacker" is a paying customer sharing a key, not a
nation-state). The differences that actually matter here are operational:
who maintains the verifier, and does it run natively at the browser floor.

## 3. Recommendation — Option A: ES256, alg-agile

- **Verify with `crypto.subtle.verify({ name:'ECDSA', hash:'SHA-256' }, …)`**
  — native, constant-time, maintained by browser vendors, available on the
  entire support floor. The editor ships **zero lines of cryptography.**
- **Sign server-side with Node's built-in `crypto`** (dev issuer 22.4 and the
  Phase 23 license service both run on Node — P-256 has been first-class
  there for a decade).
- **Alg-agility built into the token from day one:** the JWT header carries
  `alg` + `kid`; verifiers hold a keyring of `{kid → (alg, publicKey)}`.
  When the browser floor eventually rises past Ed25519 availability, new
  keys can be issued as Ed25519 **without breaking a single outstanding
  license** — rotation is already in the design (22.2).
- **Amendment to the decision record:** 19.1/22.2's "Ed25519" becomes
  "ES256 now, alg-agile (`alg`+`kid`) with Ed25519 as the designated
  successor." One sentence each; the rest of both records stands.

**Secure-context caveat (documented behavior, not a blocker):**
`crypto.subtle` exists only in secure contexts (HTTPS or localhost).
Production sites are HTTPS; dev domains never need a key (the 22.2 Jodit
rule). The one residual case — a licensed key on a plain-HTTP production
host — **degrades exactly like an invalid license**: free tier + quiet
notice, never a crash. Fail-closed, consistent with 22.5(d).

## 4. License token contract (concretizes README 22.2)

- **Format:** JWT — `header.payload.signature`, base64url.
- **Header:** `{ "alg": "ES256", "kid": "2026-07-a", "typ": "JWT" }`
- **Payload:**
  `lic` (license id) · `customer` · `plan` · `features: string[]` (snapshot
  at issuance — offline verification never needs the plan DB) ·
  `limits: {}` (e.g. `editors`, `seats`) · `domains: string[]` ·
  `iat` / `exp` (unix seconds).
- **Domain matching:** exact hostname, plus one-level wildcard
  (`*.customer.com` matches `app.customer.com`, not `a.b.customer.com`).
  Dev exemption list (always keyless, quiet console note): `localhost`,
  `127.0.0.1`, `[::1]`, `*.local`, `*.localhost`, `*.test`.
- **Verification order (each step fails closed to free tier + notice):**
  well-formed → known `kid` → signature valid → not expired → hostname in
  `domains` (or dev-exempt) → requested feature id present.

## 5. Feature registry conventions (22.1)

- IDs are **dot-namespaced, additive-only, never renamed**: `export.pdf`,
  `export.docx`, `import.word`, `versionHistory`, `comments`,
  `track.changes`, `collab.rt`.
- The registry is a single versioned module (id → { since, title }) shared
  by premium plugins (declare requirements), the dev issuer (validate
  grants), and later the Phase 23 plan builder (compose packages). New plans
  = new ID combinations — never code changes.

## 6. Adversarial sweep (22.4 gate — all must fail closed)

Forged signature · tampered payload (any byte) · expired token · wrong
domain · feature not granted · unknown `kid` · `alg` confusion (`none`,
HS256, alg/key mismatch) · malformed JWT / not-a-JWT · empty or absent key.
Plus the two environmental cases: non-secure context, and clock skew
(accept small negative skew on `iat`, none on `exp`).

**Hardening additions (2026-07-16, implemented):**
- **Rogue issuer** — a fully-valid token signed by an attacker's OWN P-256
  key (claiming our `kid`) must fail: the signature doesn't verify against the
  trusted keyring key. (This is the realistic attack, now covered.)
- **Absurd lifetime** — `exp − iat` beyond a **~3-year + 30-day ceiling**
  (`MAX_LIFETIME_SECONDS`) is rejected even with a genuine signature, so a
  fat-fingered issuer can't mint a decades-long key. Normal multi-year deals
  still pass.
- **Prototype pollution** — `__proto__`/`constructor` strings in `features[]`
  can't poison `Object.prototype` (FeatureManager stores grants in a `Set`).
- **`allowDevHost` now defaults to `false`** on the raw verify path — the
  integration layer opts in explicitly, so a plugin that merely verifies can
  never accidentally unlock premium.
- **Dev-host list narrowed** to loopback + `*.localhost` only. Bare `.local`
  (mDNS/Bonjour, pervasive on corporate LANs) and `.test` were REMOVED — they
  silently unlocked premium on internal-network deployments.
- **`lic` (license id) surfaced** on success, so revocation (22.5/23.2) has
  the identifier to check.

## 7. Build order once approved

22.1 registry → 22.2 verifier (ES256, keyring, domain semantics) →
22.4 dev issuer + adversarial sweep → 22.3 FeatureManager + gating contract
→ 22.5 anti-sharing layers (with 23). Rationale: the issuer exists before
the FeatureManager so gating is tested against real tokens from day one.
