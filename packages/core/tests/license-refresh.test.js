/**
 * license-refresh.test.js — Phase 4d: the editor-side silent-refresh scheduler.
 *
 * Proves: it is INERT without licenseRefreshUrl; when configured it fires near
 * expiry, calls the refresh endpoint, swaps the fresh token in via setLicenseKey
 * (which re-verifies AND re-schedules), and DEGRADES gracefully on failure (keeps
 * working, no throw). Uses a stubbed global fetch + a tiny lead so the scheduled
 * delay is small and observable without fake timers.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { OpenEditor } from '../src/editor.js';
import { generateDevKeyPair, signDevLicense } from '../../entitlements/src/issuer/dev-issuer.js';

function mint(features, { ttlSeconds = 365 * 24 * 3600 } = {}, domains = ['localhost']) {
  const { privateKeyPem, publicJwk } = generateDevKeyPair();
  const kid = 'refresh-kid';
  const token = signDevLicense({ privateKeyPem, kid, features, domains, ttlSeconds });
  return { token, privateKeyPem, kid, publicJwk, licenseKeys: [{ kid, jwk: publicJwk }] };
}

async function waitFor(cond, ms = 1500) {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) return false;
    await new Promise((r) => setTimeout(r, 5));
  }
  return true;
}

let editor = null;
const realFetch = globalThis.fetch;
afterEach(() => {
  if (editor && !editor.isDestroyed()) editor.destroy();
  editor = null;
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

describe('Phase 4d — editor silent-refresh scheduler', () => {
  it('is INERT with no licenseRefreshUrl (no timer, no fetch)', async () => {
    const { token, licenseKeys } = mint(['seo']);
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;
    const el = document.createElement('div'); document.body.appendChild(el);
    editor = new OpenEditor(el, { licenseKey: token, licenseKeys, allowDevHost: false });
    await waitFor(() => editor.isFeatureGranted('seo'));
    await new Promise((r) => setTimeout(r, 60));
    expect(fetchSpy).not.toHaveBeenCalled();       // opt-in: nothing scheduled
    expect(editor._licenseRefreshTimer).toBeFalsy();
  });

  it('M1: a FAR-from-expiry (lifetime-like) token does NOT phone home — it re-checks later, no fetch', async () => {
    // exp ~1 year out, default lead 24h → untilRefreshMs >> MAX_DELAY_MS (~1 day),
    // so the scheduler must arm a re-CHECK timer and NOT fetch. (Pre-fix this
    // fired a refresh every ~1 day — audit M1.)
    const { token, licenseKeys } = mint(['seo'], { ttlSeconds: 365 * 24 * 3600 });
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;
    const el = document.createElement('div'); document.body.appendChild(el);
    editor = new OpenEditor(el, {
      licenseKey: token, licenseKeys,
      allowDevHost: false,
      licenseRefreshUrl: 'https://api.test/portal/refresh',
    });
    await waitFor(() => editor.isFeatureGranted('seo'));
    await new Promise((r) => setTimeout(r, 80));
    expect(fetchSpy).not.toHaveBeenCalled();        // did NOT phone home
    expect(editor._licenseRefreshTimer).toBeTruthy(); // but a re-check IS scheduled
  });

  it('schedules + fires a refresh near expiry, swapping in the fresh token via setLicenseKey', async () => {
    // Short-lived token + a lead just under the TTL → fires within ~1s.
    const first = mint(['seo'], { ttlSeconds: 100 });
    // The refreshed token: reuse the SAME key so it verifies against licenseKeys.
    const fresh = signDevLicense({
      privateKeyPem: first.privateKeyPem, kid: first.kid, features: ['seo'],
      domains: ['localhost'], ttlSeconds: 100000,
    });
    const fetchSpy = vi.fn(async () => ({
      ok: true, json: async () => ({ refreshed: true, token: fresh, expiresAt: 0 }),
    }));
    globalThis.fetch = fetchSpy;

    const el = document.createElement('div'); document.body.appendChild(el);
    editor = new OpenEditor(el, {
      licenseKey: first.token, licenseKeys: first.licenseKeys,
      allowDevHost: false,
      licenseRefreshUrl: 'https://api.test/portal/refresh',
      licenseRefreshLeadSeconds: 99, // exp - 99 ≈ ~1s from now → fires fast
    });
    await waitFor(() => editor.isFeatureGranted('seo'));

    // The scheduler should call fetch, then swap the token in place.
    const called = await waitFor(() => fetchSpy.mock.calls.length > 0, 2000);
    expect(called).toBe(true);
    // The POST carried the current token to the configured URL.
    expect(fetchSpy.mock.calls[0][0]).toBe('https://api.test/portal/refresh');
    const swapped = await waitFor(() => editor._config.licenseKey === fresh, 2000);
    expect(swapped).toBe(true);                    // fresh token applied in place
    expect(editor.isFeatureGranted('seo')).toBe(true); // still unlocked
  });

  it('DEGRADES gracefully when the refresh endpoint fails (keeps working, no throw)', async () => {
    const first = mint(['seo'], { ttlSeconds: 100 });
    const fetchSpy = vi.fn(async () => { throw new Error('network down'); });
    globalThis.fetch = fetchSpy;

    const el = document.createElement('div'); document.body.appendChild(el);
    editor = new OpenEditor(el, {
      licenseKey: first.token, licenseKeys: first.licenseKeys,
      allowDevHost: false,
      licenseRefreshUrl: 'https://api.test/portal/refresh',
      licenseRefreshLeadSeconds: 99,
      licenseRefreshRetrySeconds: 60,
    });
    await waitFor(() => editor.isFeatureGranted('seo'));
    const called = await waitFor(() => fetchSpy.mock.calls.length > 0, 2000);
    expect(called).toBe(true);
    // Despite the network error, premium still works (the current token is valid).
    expect(editor.isFeatureGranted('seo')).toBe(true);
    // A retry was re-armed (timer present), not abandoned.
    expect(editor._licenseRefreshTimer).toBeTruthy();
    // M2: the backoff attempt counter advanced (exponential backoff, not a fixed
    // hammer). At least one failure was recorded.
    expect(editor._refreshAttempts).toBeGreaterThan(0);
  });

  it('clears the refresh timer on destroy (no leaked timer / no post-destroy fetch)', async () => {
    const first = mint(['seo'], { ttlSeconds: 100 });
    const fetchSpy = vi.fn(async () => ({ ok: true, json: async () => ({ refreshed: false }) }));
    globalThis.fetch = fetchSpy;
    const el = document.createElement('div'); document.body.appendChild(el);
    editor = new OpenEditor(el, {
      licenseKey: first.token, licenseKeys: first.licenseKeys,
      allowDevHost: false,
      licenseRefreshUrl: 'https://api.test/portal/refresh',
      licenseRefreshLeadSeconds: 50,
    });
    await waitFor(() => editor.isFeatureGranted('seo'));
    expect(editor._licenseRefreshTimer).toBeTruthy(); // scheduled
    editor.destroy();
    const callsAtDestroy = fetchSpy.mock.calls.length;
    await new Promise((r) => setTimeout(r, 80));
    expect(fetchSpy.mock.calls.length).toBe(callsAtDestroy); // no fetch after destroy
  });
});
