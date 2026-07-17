/**
 * createPremiumHost — REAL ES256 mechanics end to end: the dev issuer signs
 * genuine tokens, the host verifies them offline and builds the
 * FeatureManager. Every deny path must fail closed to the free tier.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { generateDevKeyPair, signDevLicense } from '@openeditors/entitlements/issuer';
import { createPremiumHost } from '../src/premium-host.js';

let keys, mint;
beforeAll(() => {
  const kp = generateDevKeyPair();
  keys = [{ kid: 'test-key', jwk: kp.publicJwk }];
  mint = (opts = {}) => signDevLicense({
    privateKeyPem: kp.privateKeyPem,
    kid: 'test-key',
    features: ['dev.smoke', 'export.pdf'],
    domains: ['app.example.com'],
    ...opts,
  });
});

describe('createPremiumHost — grant paths', () => {
  it('valid license on a licensed host grants exactly the licensed features', async () => {
    const host = await createPremiumHost({ license: mint(), keys, hostname: 'app.example.com' });
    expect(host.result.valid).toBe(true);
    expect(host.gate('dev.smoke')).toEqual({ allowed: true, reason: 'granted' });
    expect(host.gate('export.pdf').allowed).toBe(true);
    expect(host.gate('comments')).toEqual({ allowed: false, reason: 'not-in-license' });
  });

  it('allowDevHost on localhost unlocks everything with NO license (the Jodit rule)', async () => {
    const host = await createPremiumHost({ keys: [], hostname: 'localhost', allowDevHost: true });
    expect(host.result.devHost).toBe(true);
    expect(host.gate('comments').allowed).toBe(true);
    expect(host.manager.grantedFeatures()).toBe('*');
  });
});

describe('createPremiumHost — fail-closed paths', () => {
  it('no license at all → free tier (nothing verified, nothing granted)', async () => {
    const host = await createPremiumHost({ keys, hostname: 'app.example.com' });
    expect(host.result).toBe(null);
    expect(host.gate('dev.smoke')).toEqual({ allowed: false, reason: 'no-license' });
  });

  it('allowDevHost is STRICTLY opt-in: localhost without license stays free by default', async () => {
    const host = await createPremiumHost({ keys, hostname: 'localhost' });
    expect(host.gate('dev.smoke').allowed).toBe(false);
  });

  it('hostname not in the licensed domains → invalid (domain-mismatch)', async () => {
    const host = await createPremiumHost({ license: mint(), keys, hostname: 'evil.example.net' });
    expect(host.result.valid).toBe(false);
    expect(host.result.reason).toBe('domain-mismatch');
    expect(host.gate('dev.smoke').allowed).toBe(false);
  });

  it('expired license → invalid, nothing granted', async () => {
    const iat = Math.floor(Date.now() / 1000) - 10_000;
    const host = await createPremiumHost({
      license: mint({ iat, ttlSeconds: 100 }), keys, hostname: 'app.example.com',
    });
    expect(host.result.reason).toBe('expired');
    expect(host.gate('dev.smoke').allowed).toBe(false);
  });

  it('tampered token → bad signature, nothing granted', async () => {
    const token = mint();
    const [h, p, s] = token.split('.');
    const payload = JSON.parse(Buffer.from(p.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
    payload.features = ['comments', 'collab.rt', 'dev.smoke'];
    const forged = Buffer.from(JSON.stringify(payload)).toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const host = await createPremiumHost({ license: `${h}.${forged}.${s}`, keys, hostname: 'app.example.com' });
    expect(host.result.valid).toBe(false);
    expect(host.gate('comments').allowed).toBe(false);
  });

  it('malformed public keys are skipped → unknown-kid, never a throw', async () => {
    const host = await createPremiumHost({
      license: mint(),
      keys: [{ kid: 'test-key', jwk: { kty: 'garbage' } }, { jwk: null }, null],
      hostname: 'app.example.com',
    });
    expect(host.result.valid).toBe(false);
    expect(host.result.reason).toBe('unknown-kid');
  });

  it('an UNREGISTERED feature id is denied even under a dev-host grant-all', async () => {
    const host = await createPremiumHost({ hostname: 'localhost', allowDevHost: true });
    expect(host.gate('not.aRealFeature')).toEqual({ allowed: false, reason: 'unregistered-feature' });
  });
});
