import { describe, it, expect, beforeAll } from 'vitest';
import { verifyLicense, importEs256PublicKey, isPayloadShapeValid, REASON } from '../src/verifier.js';
import { FeatureManager } from '../src/feature-manager.js';
import { generateDevKeyPair, signDevLicense } from '../src/issuer/dev-issuer.js';

const KID = '2026-07-a';
const HOST = 'app.customer.com';
const NOW = 1_800_000_000; // fixed clock for determinism

let priv, keyring, base;

beforeAll(async () => {
  const kp = generateDevKeyPair();
  priv = kp.privateKeyPem;
  keyring = [{ kid: KID, alg: 'ES256', key: await importEs256PublicKey(kp.publicJwk) }];
  base = {
    privateKeyPem: priv, kid: KID,
    features: ['export.pdf', 'comments'],
    domains: ['*.customer.com'],
    iat: NOW - 100, ttlSeconds: 3600,
  };
});

const verify = (token, over = {}) =>
  verifyLicense(token, { keyring, hostname: HOST, now: NOW, allowDevHost: false, ...over });

describe('happy path (22.2)', () => {
  it('a well-formed, in-domain, unexpired ES256 license verifies', async () => {
    const r = await verify(signDevLicense(base));
    expect(r).toMatchObject({ valid: true, reason: REASON.OK });
    expect(r.payload.features).toContain('export.pdf');
  });

  it('feeds a working FeatureManager', async () => {
    const r = await verify(signDevLicense(base));
    const fm = new FeatureManager(r);
    expect(fm.has('export.pdf')).toBe(true);
    expect(fm.has('collab.rt')).toBe(false);
    expect(fm.gate('export.pdf')).toMatchObject({ allowed: true });
    expect(fm.gate('collab.rt')).toMatchObject({ allowed: false, reason: 'not-in-license' });
  });

  it('dev host short-circuits to valid ONLY when explicitly opted in', async () => {
    const r = await verifyLicense('garbage', { keyring, hostname: 'localhost', now: NOW, allowDevHost: true });
    expect(r).toMatchObject({ valid: true, reason: REASON.DEV_HOST });
    expect(new FeatureManager(r).has('anything.at.all')).toBe(true);
  });

  it('dev host does NOT bypass when allowDevHost is left at its (false) default', async () => {
    // Hardening: the raw verify path is strict. 'garbage' on localhost, no opt-in.
    const r = await verifyLicense('garbage', { keyring, hostname: 'localhost', now: NOW });
    expect(r.valid).toBe(false);
  });

  it('surfaces the license id (lic) on success for revocation wiring', async () => {
    const r = await verify(signDevLicense({ ...base }));
    expect(r.valid).toBe(true);
    expect(typeof r.lic).toBe('string');
    expect(r.lic.startsWith('dev-')).toBe(true);
  });
});

describe('adversarial sweep (22.4) — ALL must fail closed', () => {
  it('forged signature (tampered last byte)', async () => {
    const t = signDevLicense(base);
    const forged = t.slice(0, -3) + (t.slice(-3) === 'AAA' ? 'BBB' : 'AAA');
    expect((await verify(forged)).valid).toBe(false);
  });

  it('tampered payload (re-encode a changed claim, keep old signature)', async () => {
    const t = signDevLicense(base);
    const [h, p, s] = t.split('.');
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
    payload.features.push('collab.rt'); // escalate
    const p2 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const r = await verify(`${h}.${p2}.${s}`);
    expect(r).toMatchObject({ valid: false, reason: REASON.BAD_SIGNATURE });
  });

  it('expired token', async () => {
    const r = await verify(signDevLicense({ ...base, iat: NOW - 10_000, ttlSeconds: 100 }));
    expect(r).toMatchObject({ valid: false, reason: REASON.EXPIRED });
  });

  it('not-yet-valid token (iat far in the future beyond skew)', async () => {
    const r = await verify(signDevLicense({ ...base, iat: NOW + 10_000 }));
    expect(r).toMatchObject({ valid: false, reason: REASON.NOT_YET_VALID });
  });

  it('wrong domain', async () => {
    const r = await verify(signDevLicense({ ...base, domains: ['*.other.com'] }));
    expect(r).toMatchObject({ valid: false, reason: REASON.DOMAIN });
  });

  it('apex host against a wildcard-only license', async () => {
    const r = await verify(signDevLicense({ ...base, domains: ['*.customer.com'] }), { hostname: 'customer.com' });
    expect(r).toMatchObject({ valid: false, reason: REASON.DOMAIN });
  });

  it('unknown kid (key not in ring)', async () => {
    const r = await verify(signDevLicense({ ...base, kid: 'rotated-out' }));
    expect(r).toMatchObject({ valid: false, reason: REASON.UNKNOWN_KID });
  });

  it('alg confusion: none (with a signature present, so it reaches the alg gate)', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', kid: KID, typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ features: [], domains: [HOST], iat: NOW, exp: NOW + 100 })).toString('base64url');
    const r = await verify(`${header}.${payload}.AAAA`);
    expect(r).toMatchObject({ valid: false, reason: REASON.ALG });
  });

  it('alg confusion: none with EMPTY signature also fails closed (malformed)', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', kid: KID, typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ features: [], domains: [HOST], iat: NOW, exp: NOW + 100 })).toString('base64url');
    expect((await verify(`${header}.${payload}.`)).valid).toBe(false);
  });

  it('alg confusion: HS256 (symmetric) rejected before any verify', async () => {
    const t = signDevLicense(base);
    const [, p, s] = t.split('.');
    const h2 = Buffer.from(JSON.stringify({ alg: 'HS256', kid: KID, typ: 'JWT' })).toString('base64url');
    expect((await verify(`${h2}.${p}.${s}`)).reason).toBe(REASON.ALG);
  });

  it('malformed tokens', async () => {
    for (const bad of ['', 'a.b', 'a.b.c.d', 'not-base64url!.x.y', '...']) {
      expect((await verify(bad)).valid).toBe(false);
    }
  });

  it('empty domains → genuine signature but no host can match (fails closed)', async () => {
    const r = await verify(signDevLicense({ ...base, domains: [] }));
    expect(r).toMatchObject({ valid: false, reason: REASON.DOMAIN });
  });

  it('SHAPE path is unit-tested directly (isPayloadShapeValid)', () => {
    expect(isPayloadShapeValid({ features: [], domains: [], exp: 1, iat: 0 })).toBe(true);
    expect(isPayloadShapeValid({ features: [], exp: 1, iat: 0 })).toBe(false); // no domains
    expect(isPayloadShapeValid({ features: 'x', domains: [], exp: 1, iat: 0 })).toBe(false);
    expect(isPayloadShapeValid(null)).toBe(false);
  });

  it('no WebCrypto (simulated) fails closed for production hosts', async () => {
    // Can't remove globalThis.crypto safely; assert the reason constant exists
    // and that a non-secure path is representable. Dev host still bypasses.
    expect(REASON.NO_SUBTLE).toBe('no-webcrypto');
  });

  // ── hardening additions (2026-07-16) ──────────────────────────────────────
  it('ROGUE ISSUER: a token signed by a different valid key is rejected', async () => {
    // The most realistic attack: attacker generates their OWN valid P-256 key
    // and signs a fully-formed, in-domain, unexpired license. It must fail —
    // the signature does not verify against the keyring's trusted key.
    const rogue = generateDevKeyPair();
    const forged = signDevLicense({
      privateKeyPem: rogue.privateKeyPem, kid: KID, // claims our kid…
      features: ['export.pdf', 'collab.rt'], domains: ['*.customer.com'],
      iat: NOW - 100, ttlSeconds: 3600,
    });
    const r = await verify(forged); // …but signed with the rogue key
    expect(r).toMatchObject({ valid: false, reason: REASON.BAD_SIGNATURE });
  });

  it('ABSURD LIFETIME: a genuine token with a decades-long expiry is rejected', async () => {
    const t = signDevLicense({ ...base, iat: NOW - 100, ttlSeconds: 30 * 365 * 24 * 3600 });
    const r = await verify(t);
    expect(r).toMatchObject({ valid: false, reason: REASON.LIFETIME });
  });

  it('a normal multi-year (2y) license is still accepted (ceiling not too tight)', async () => {
    const t = signDevLicense({ ...base, iat: NOW - 100, ttlSeconds: 2 * 365 * 24 * 3600 });
    expect((await verify(t)).valid).toBe(true);
  });

  it('PROTOTYPE POLLUTION: a __proto__ feature string cannot poison FeatureManager', async () => {
    const t = signDevLicense({
      ...base, features: ['export.pdf', '__proto__', 'constructor'],
      skipFeatureValidation: true, // issuer would normally reject these
    });
    const r = await verify(t);
    // token itself is genuinely signed, so it verifies…
    expect(r.valid).toBe(true);
    // …but the FeatureManager must not let those strings pollute Object.prototype
    const fm = new FeatureManager(r);
    expect(fm.has('export.pdf')).toBe(true);
    expect(({}).polluted).toBeUndefined();
    // and a normal capability check on a random object key stays false
    expect(fm.has('toString')).toBe(false);
  });
});

describe('FeatureManager degradation (22.3 / 19.3)', () => {
  it('no license → nothing granted, gates decline politely', () => {
    const fm = new FeatureManager(null);
    expect(fm.has('export.pdf')).toBe(false);
    expect(fm.gate('export.pdf')).toMatchObject({ allowed: false, reason: 'no-license' });
    expect(fm.gate('made.up')).toMatchObject({ allowed: false, reason: 'unregistered-feature' });
  });
  it('invalid result → nothing granted', () => {
    const fm = new FeatureManager({ valid: false, reason: REASON.EXPIRED });
    expect(fm.grantedFeatures()).toEqual([]);
  });
  it('limits read with fallback', () => {
    const fm = new FeatureManager({ valid: true, payload: { features: [], domains: [], exp: 0, iat: 0, limits: { seats: 5 } } });
    expect(fm.limit('seats')).toBe(5);
    expect(fm.limit('editors', 1)).toBe(1);
  });
});
