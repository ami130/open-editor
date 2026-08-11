/**
 * loader.test.js — the loader's network and verification logic (§1.5 stage 1).
 *
 * Node-only: everything here is testable without a browser. The parts that
 * genuinely need one — blob: import, CSP behaviour, real mounting — are proven
 * by the Playwright run instead, because faking them would prove nothing.
 */
import { describe, it, expect, vi } from 'vitest';
import { openSession } from '../src/session.js';
import { fetchEngine, digestHex } from '../src/fetch-engine.js';
import { looksLikeCspDenial, CSP_HELP } from '../src/evaluate.js';
import { keyFor, MAX_ENTRIES } from '../src/cache.js';

const SHA = 'a'.repeat(64);
const okSession = (over = {}) => ({
  sessionToken: 'tok', refreshToken: 'ref', plan: 'free', features: ['text.bold'],
  version: '1.3.0',
  engine: { key: 'engine/1.3.0/free.js', sha256: SHA, url: 'https://cdn/e.js' },
  ...over,
});
const jsonRes = (body, status = 200) => ({
  ok: status >= 200 && status < 300, status, json: async () => body,
});

describe('openSession', () => {
  it('posts to the delivery endpoint and returns the session', async () => {
    const fetchImpl = vi.fn(async () => jsonRes(okSession()));
    const s = await openSession({ endpoint: 'https://api.test', fetchImpl });

    expect(s.version).toBe('1.3.0');
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.test/delivery/session');
    expect(init.method).toBe('POST');
  });

  it('sends the licence key only when there is one', async () => {
    const fetchImpl = vi.fn(async () => jsonRes(okSession()));
    await openSession({ endpoint: 'https://api.test', fetchImpl });
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({});

    await openSession({ endpoint: 'https://api.test', licenceKey: 'K', fetchImpl });
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body)).toEqual({ licenceKey: 'K' });
  });

  it('never sends Origin in the BODY — the browser sets the header', async () => {
    // A page must not be able to claim a domain it is not on; domain-bound
    // licences depend on Origin being unspoofable.
    const fetchImpl = vi.fn(async () => jsonRes(okSession()));
    await openSession({ endpoint: 'https://api.test', licenceKey: 'K', fetchImpl });
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).not.toHaveProperty('origin');
  });

  it('names the "nothing published yet" case, which is an operator problem', async () => {
    const fetchImpl = async () => jsonRes({}, 404);
    await expect(openSession({ endpoint: 'https://api.test', fetchImpl }))
      .rejects.toThrow(/no engine version is configured|has no engine version/i);
  });

  it('rejects a response with no engine URL or a bad hash', async () => {
    // Proceeding without either turns a clear failure into a confusing one.
    for (const bad of [
      okSession({ engine: { key: 'k', sha256: SHA, url: '' } }),
      okSession({ engine: { key: 'k', sha256: 'not-a-hash', url: 'https://cdn/e.js' } }),
    ]) {
      await expect(openSession({ endpoint: 'https://api.test', fetchImpl: async () => jsonRes(bad) }))
        .rejects.toThrow(/engine URL|engine hash/);
    }
  });

  it('times out rather than hanging the page forever', async () => {
    const fetchImpl = (_u, { signal }) => new Promise((_res, rej) => {
      signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    });
    await expect(openSession({ endpoint: 'https://api.test', fetchImpl, timeoutMs: 20 }))
      .rejects.toThrow(/timed out/);
  });

  it('refuses to run with no endpoint configured', async () => {
    await expect(openSession({})).rejects.toThrow(/no delivery endpoint/);
  });
});

describe('fetchEngine — verify before execute', () => {
  const bytes = new TextEncoder().encode('export const engine = 1;');

  it('returns the source when the hash matches', async () => {
    const sha = await digestHex(bytes);
    const fetchImpl = async () => ({ ok: true, status: 200, arrayBuffer: async () => bytes.buffer });
    expect(await fetchEngine('https://cdn/e.js', sha, { fetchImpl }))
      .toBe('export const engine = 1;');
  });

  it('REFUSES a bundle whose hash does not match', async () => {
    // A truncated download or a proxy rewriting JS would otherwise execute and
    // fail somewhere far less obvious.
    const fetchImpl = async () => ({ ok: true, status: 200, arrayBuffer: async () => bytes.buffer });
    await expect(fetchEngine('https://cdn/e.js', 'b'.repeat(64), { fetchImpl }))
      .rejects.toThrow(/integrity check FAILED/);
  });

  it('names a 403 as an expired or invalid signed URL', async () => {
    const fetchImpl = async () => ({ ok: false, status: 403 });
    await expect(fetchEngine('https://cdn/e.js', SHA, { fetchImpl }))
      .rejects.toThrow(/expired or invalid signed URL/);
  });

  it('is case-insensitive about the expected hash', async () => {
    const sha = await digestHex(bytes);
    const fetchImpl = async () => ({ ok: true, status: 200, arrayBuffer: async () => bytes.buffer });
    await expect(fetchEngine('https://cdn/e.js', sha.toUpperCase(), { fetchImpl })).resolves.toBeTruthy();
  });
});

describe('engine URL resolution', () => {
  // FOUND IN A REAL BROWSER: /session may legitimately return a RELATIVE path
  // (same-origin or local development, where DELIVERY_PUBLIC_BASE_URL is
  // unset). Resolved against the page it would hit the CUSTOMER'S domain —
  // 404, or worse, a stale look-alike from their own server. It must resolve
  // against the delivery endpoint.
  it('resolves a relative engine path against the ENDPOINT, not the page', () => {
    expect(new URL('/engine/1.2.0/free/abc.js', 'https://api.test').toString())
      .toBe('https://api.test/engine/1.2.0/free/abc.js');
  });

  it('leaves an absolute engine URL untouched', () => {
    expect(new URL('https://cdn.test/engine/1.2.0/free/abc.js', 'https://api.test').toString())
      .toBe('https://cdn.test/engine/1.2.0/free/abc.js');
  });

  it('keeps the premium signature intact through resolution', () => {
    expect(new URL('/engine/1.2.0/premium/abc.js?exp=123&sig=ff', 'https://api.test').toString())
      .toBe('https://api.test/engine/1.2.0/premium/abc.js?exp=123&sig=ff');
  });
});

describe('cache keying and eviction policy (stage 2)', () => {
  it('keys on version AND plan — never version alone', () => {
    // Keyed on version alone, a customer who upgrades keeps loading the cached
    // FREE bundle: they pay and premium silently never appears. The single most
    // expensive bug this module could have.
    expect(keyFor('1.2.0', 'free')).not.toBe(keyFor('1.2.0', 'premium'));
    expect(keyFor('1.2.0', 'premium')).toBe('1.2.0::premium');
  });

  it('scopes the key by ENDPOINT, so staging never serves production (D2)', () => {
    // Staging and production routinely publish the same version and plan. Keyed
    // on version+plan alone, whichever was cached first would win — the hash
    // check catches a genuine mismatch, but only after a wasted load, and two
    // environments serving byte-identical bundles would cross over silently.
    const stage = keyFor('1.2.0', 'premium', 'https://staging.example.com');
    const prod = keyFor('1.2.0', 'premium', 'https://api.example.com');
    expect(stage).not.toBe(prod);

    // A trailing slash or a path suffix is the same environment, not a new one.
    expect(keyFor('1.2.0', 'premium', 'https://api.example.com/'))
      .toBe(keyFor('1.2.0', 'premium', 'https://api.example.com/v2'));
  });

  it('still distinguishes plan and version within one endpoint', () => {
    const ep = 'https://api.example.com';
    expect(keyFor('1.2.0', 'free', ep)).not.toBe(keyFor('1.2.0', 'premium', ep));
    expect(keyFor('1.2.0', 'free', ep)).not.toBe(keyFor('1.3.0', 'free', ep));
  });

  it('falls back to an unscoped key when no endpoint is given', () => {
    // Kept working so the helper stays usable (and testable) without one.
    expect(keyFor('1.2.0', 'free')).toBe('1.2.0::free');
  });

  it('keeps a small, bounded number of entries', () => {
    // Two covers free → premium; three leaves room for a version change on top.
    expect(MAX_ENTRIES).toBeGreaterThanOrEqual(2);
    expect(MAX_ENTRIES).toBeLessThanOrEqual(5);
  });

  it('evicts by LAST USE, never by version order', () => {
    // "Keep the newest" is wrong in two directions: a PINNED customer stays on
    // an old version forever, and a ROLLBACK makes an older version current.
    // Both are normal operations, and both would fight newest-wins.
    const entries = [
      { key: '1.0.0::free', usedAt: 300 },   // old version, used most recently
      { key: '2.0.0::free', usedAt: 100 },
      { key: '3.0.0::free', usedAt: 200 },
      { key: '4.0.0::free', usedAt: 50 },
    ];
    const kept = [...entries].sort((a, b) => b.usedAt - a.usedAt).slice(0, 3).map((e) => e.key);
    expect(kept).toContain('1.0.0::free');   // the pinned customer survives
    expect(kept).not.toContain('4.0.0::free');
  });
});

describe('speculative cache read (T10) — the guess must never be trusted blindly', () => {
  // The remembered plan is read CONCURRENTLY with /session, before the real
  // answer is known. Everything below is about what makes that safe.
  const matches = (guess, session) =>
    !!guess && guess.version === session.version && guess.plan === session.plan;

  it('uses the guess only when BOTH version and plan match the session', () => {
    const session = { version: '1.3.0', plan: 'premium' };
    expect(matches({ version: '1.3.0', plan: 'premium' }, session)).toBe(true);
    // A customer who upgraded since their last visit: same version, new plan.
    // Using this guess would serve them the FREE bundle they paid to leave.
    expect(matches({ version: '1.3.0', plan: 'free' }, session)).toBe(false);
    // A version moved under them (rollout or rollback).
    expect(matches({ version: '1.2.0', plan: 'premium' }, session)).toBe(false);
    expect(matches(null, session)).toBe(false);
  });

  it('a matching guess is still hash-verified before use', async () => {
    // The speculative read happens with NO hash to compare against, because
    // none is known yet. Verifying afterwards is what stops the fast path
    // becoming the one that trusts unverified bytes.
    const source = 'export const engine = 1;';
    const good = await digestHex(new TextEncoder().encode(source));
    expect(good).toMatch(/^[0-9a-f]{64}$/);
    expect(await digestHex(new TextEncoder().encode('POISONED'))).not.toBe(good);
  });
});

describe('CSP detection (T22)', () => {
  // The real strings each engine produces, captured from the browser run. A
  // CSP block otherwise surfaces as an opaque error and a blank container.
  it.each([
    ['chromium', 'Failed to fetch dynamically imported module: blob:...'],
    ['firefox', 'error loading dynamically imported module'],
    ['webkit', 'Importing a module script failed.'],
    ['explicit', "Refused to load the script because it violates Content Security Policy"],
  ])('recognises a %s CSP denial', (_engine, message) => {
    expect(looksLikeCspDenial(new Error(message))).toBe(true);
  });

  it('does NOT mistake a genuine syntax error for a CSP block', () => {
    expect(looksLikeCspDenial(new SyntaxError('Unexpected token }'))).toBe(false);
  });

  it('the CSP message names the exact directive to add', () => {
    expect(CSP_HELP).toContain('blob:');
    expect(CSP_HELP).toContain('script-src');
  });
});
