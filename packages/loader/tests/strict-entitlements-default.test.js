/**
 * strict-entitlements-default.test.js — the loader must hand the engine
 * `strictEntitlements: true` unless the host says otherwise.
 *
 * ─── WHY THIS IS THE WHOLE FEATURE ──────────────────────────────────────────
 * Without it, `feature-gate.js` grants the engine's OWN built-in free set on
 * top of whatever the token says:
 *
 *   if (!strictEntitlements && FREE_SET.has(id)) return true;
 *
 * FREE_SET is "every feature compiled into this bundle", so an admin could
 * compose a package of two features, the backend would grant exactly two, the
 * signed token would carry exactly two — and the editor would still enable all
 * ~53, because the BUILD contains them. Measured on a real domain before the
 * fix: a 2-feature package granted insert.table, insert.image and colour.
 *
 * That made the free tier a property of the ENGINE BUILD rather than of the
 * package an admin composed, so the product behaved as two fixed tiers instead
 * of N packages.
 *
 * ─── WHY A UNIT TEST, AND NOT A BROWSER ─────────────────────────────────────
 * The browser proof needs HTTPS on a NON-localhost host: `localhost` triggers
 * the engine's `allowDevHost` exemption (grants everything, hiding the result),
 * and plain http:// on any other host has no WebCrypto, so the loader correctly
 * refuses to verify the bundle at all. Both were hit while trying. The only
 * environment satisfying both is the real deployment.
 *
 * So the contract is pinned here — what the LOADER passes — and the gate
 * behaviour itself is proven separately against real production tokens.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Stub the ONE seam that needs a real browser: turning fetched bytes into a
// module. Everything before it (session → config) is the code under test.
vi.mock('../src/evaluate.js', async (orig) => ({
  ...(await orig()),
  evaluateModule: async () => ({
    OpenEditor: class {
      constructor(_el, config) { globalThis.__seenConfig = config; }
      on() {} destroy() {} isDestroyed() { return false; }
      applyEntitlements() {}
    },
  }),
}));

const { createEditor } = await import('../src/index.js');

const SESSION = {
  sessionToken: 'header.eyJmZWF0dXJlcyI6WyJ0ZXh0LmJvbGQiXX0.sig',
  refreshToken: 'r',
  expiresAt: Math.floor(Date.now() / 1000) + 900,
  plan: 'free',
  features: ['text.bold', 'list.bullet'],
  version: '1.2.2',
  engine: { key: 'engine/1.2.2/free.js', url: '/e.js', sha256: 'af5570f5a1810b7af78caf4bc70a660f0df51e42baf91d4de5b2328de0e83dfc' },
};

async function mount(extra = {}) {
  globalThis.__seenConfig = undefined;
  globalThis.fetch = vi.fn(async (url) => {
    if (String(url).includes('/delivery/session')) {
      return { ok: true, status: 200, json: async () => SESSION };
    }
    // The bundle body; evaluateModule is stubbed, so the bytes are irrelevant.
    return { ok: true, status: 200, text: async () => 'x', arrayBuffer: async () => new ArrayBuffer(8) };
  });
  const el = document.createElement('div');
  document.body.appendChild(el);
  await createEditor(el, {
    endpoint: 'https://api.test',
    cache: false,
    fallback: false,
    plugins: [],
    ...extra,
  }).catch(() => { /* integrity may fail after config capture */ });
  return globalThis.__seenConfig || {};
}

describe('loader default: strictEntitlements', () => {
  it('is passed to the engine as TRUE when the host says nothing', async () => {
    const cfg = await mount();
    expect(cfg.strictEntitlements).toBe(true);
  });

  it('does NOT override a host that explicitly opts out', async () => {
    // A host with long-lived pasted licences may still need the old blanket.
    // This is a default, not a policy.
    const cfg = await mount({ strictEntitlements: false });
    expect(cfg.strictEntitlements).toBe(false);
  });

  it('leaves an explicit true alone', async () => {
    const cfg = await mount({ strictEntitlements: true });
    expect(cfg.strictEntitlements).toBe(true);
  });
});

describe('loader source contract', () => {
  it('sets the default only when undefined, never clobbering the host', async () => {
    const src = readFileSync(join(__dirname, '..', 'src', 'index.js'), 'utf-8');
    expect(src).toMatch(/if \(engineConfig\.strictEntitlements === undefined\)/);
    expect(src).toMatch(/engineConfig\.strictEntitlements = true/);
  });
});


