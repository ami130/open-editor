/**
 * entitlements-webcrypto.test.js — Phase 22 gap #11.
 *
 * Proves the ES256 offline-verifier path works in REAL browsers (Chromium,
 * Firefox, WebKit) — the algorithm bet behind PHASE-22-DESIGN.md. The Node
 * unit tests use Node's WebCrypto; this drives the browser's own
 * `crypto.subtle` end-to-end: generate a P-256 key IN the browser, sign a
 * license with it, and verify it through the real verifier module.
 */
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__entitlements);
});

test('a browser-signed ES256 license verifies through the real verifier', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { verifyLicense, importEs256PublicKey } = window.__entitlements;
    const enc = (obj) => btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    // 1. generate a P-256 keypair with the browser's own WebCrypto
    const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const publicJwk = await crypto.subtle.exportKey('jwk', kp.publicKey);

    // 2. build + sign a license (raw P1363 signature, exactly the JWS format)
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'ES256', kid: 'browser-test', typ: 'JWT' };
    const payload = { lic: 'e2e-1', features: ['export.pdf'], domains: [location.hostname], iat: now - 10, exp: now + 3600 };
    const signingInput = `${enc(header)}.${enc(payload)}`;
    const sigBuf = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey, new TextEncoder().encode(signingInput));
    const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sigBuf)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const token = `${signingInput}.${sigB64}`;

    // 3. verify through the REAL module
    const keyring = [{ kid: 'browser-test', alg: 'ES256', key: await importEs256PublicKey(publicJwk) }];
    const good = await verifyLicense(token, { keyring, hostname: location.hostname, now });

    // 4. a tampered token must fail closed
    const tampered = token.slice(0, -4) + (token.slice(-4) === 'AAAA' ? 'BBBB' : 'AAAA');
    const bad = await verifyLicense(tampered, { keyring, hostname: location.hostname, now });

    return { good, bad };
  });

  expect(result.good.valid).toBe(true);
  expect(result.good.reason).toBe('ok');
  expect(result.good.payload.features).toContain('export.pdf');
  expect(result.bad.valid).toBe(false);
});

test('crypto.subtle ECDSA P-256 is available in this engine (support-floor check)', async ({ page }) => {
  const ok = await page.evaluate(async () => {
    try {
      const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
      return !!kp.privateKey;
    } catch { return false; }
  });
  expect(ok).toBe(true);
});
