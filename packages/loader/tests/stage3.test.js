/**
 * stage3.test.js — install id (T18) and the degraded fallback (§1.9).
 *
 * Both are pure enough to test in Node with a minimal DOM/storage stub. The
 * browser-dependent parts — a real CSP block, a real offline load — are proven
 * by the Playwright run instead.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getInstallId, mintInstallId, isValidInstallId } from '../src/install-id.js';
import { renderFallback, removeFallback, hasFallback } from '../src/fallback.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The refresh wiring is config the loader hands to the ENGINE, so there is no
 * loader-side value to assert — reading the source is the honest way to pin the
 * two constants that make the fix correct. (jsdom leaves import.meta.url as a
 * non-file URL, hence the explicit path.)
 */
const readLoaderSource = () => readFileSync(join(process.cwd(), 'src', 'index.js'), 'utf-8');

/** Minimal localStorage stand-in. */
function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _map: map,
  };
}

const realStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const setStorage = (value) =>
  Object.defineProperty(globalThis, 'localStorage', { value, configurable: true });

afterEach(() => {
  if (realStorage) Object.defineProperty(globalThis, 'localStorage', realStorage);
  else delete globalThis.localStorage;
});

describe('install id (T18)', () => {
  it('mints a prefixed 128-bit hex id', () => {
    const id = mintInstallId();
    expect(id).toMatch(/^oe_[0-9a-f]{32}$/);
    expect(isValidInstallId(id)).toBe(true);
  });

  it('is STABLE across calls — the same profile keeps one id', () => {
    // If it changed per call, per-install rate limiting (T20) and usage
    // attribution (S1) would both be measuring noise.
    setStorage(fakeStorage());
    expect(getInstallId()).toBe(getInstallId());
  });

  it('is unique per profile', () => {
    setStorage(fakeStorage());
    const a = getInstallId();
    setStorage(fakeStorage());          // a different browser profile
    expect(getInstallId()).not.toBe(a);
  });

  it('persists what it minted', () => {
    const store = fakeStorage();
    setStorage(store);
    const id = getInstallId();
    expect(store.getItem('open-editor.install-id')).toBe(id);
  });

  it('REPLACES a corrupted or hand-edited value', () => {
    // The backend caps installId at 128 chars; a junk value would otherwise be
    // rejected on every session forever.
    for (const junk of ['', 'garbage', 'oe_short', 'x'.repeat(500)]) {
      setStorage(fakeStorage({ 'open-editor.install-id': junk }));
      const id = getInstallId();
      expect(isValidInstallId(id)).toBe(true);
      expect(id).not.toBe(junk);
    }
  });

  it('returns null when storage is unavailable — never blocks a load', () => {
    // Private browsing and sandboxed iframes THROW on access rather than
    // returning undefined, so the read itself must be guarded.
    setStorage(undefined);
    expect(getInstallId()).toBeNull();

    Object.defineProperty(globalThis, 'localStorage', {
      get() { throw new Error('SecurityError'); },
      configurable: true,
    });
    expect(getInstallId()).toBeNull();
  });

  it('survives a storage write failure (quota exceeded)', () => {
    setStorage({
      getItem: () => null,
      setItem: () => { throw new Error('QuotaExceededError'); },
    });
    // Degrades to anonymous rather than throwing into the load path.
    expect(getInstallId()).toBeNull();
  });

  it('rejects anything it did not mint', () => {
    for (const bad of [null, undefined, 42, 'oe_XYZ', 'oe_' + 'f'.repeat(31)]) {
      expect(isValidInstallId(bad)).toBe(false);
    }
  });
});

describe('session refresh timing (D1)', () => {
  // The engine owns the refresh timer (T16); the loader only points it at the
  // endpoint and sizes the lead. These numbers are the whole fix, so they are
  // pinned against the backend's actual TTL rather than left implicit.
  const SESSION_TTL_SECONDS = 15 * 60;   // delivery/session.service.ts
  const ENGINE_DEFAULT_LEAD = 24 * 3600; // editor-license-refresh.js

  it('the engine default lead is UNUSABLE for a 15-minute token', () => {
    // This is why the loader must override it: a 24-hour lead on a 15-minute
    // token means "refresh now", forever, from the moment the editor mounts.
    expect(ENGINE_DEFAULT_LEAD).toBeGreaterThan(SESSION_TTL_SECONDS);
  });

  it('the loader lead fits comfortably inside the token lifetime', () => {
    const src = readLoaderSource();
    const lead = Number(src.match(/REFRESH_LEAD_SECONDS = (\d+)/)?.[1]);
    const retry = Number(src.match(/REFRESH_RETRY_SECONDS = (\d+)/)?.[1]);

    expect(lead).toBeLessThan(SESSION_TTL_SECONDS);
    // Room for more than one retry before the token actually dies.
    expect(retry).toBeLessThan(lead);
    expect(lead / retry).toBeGreaterThanOrEqual(2);
  });

  it('points the engine at the DELIVERY refresh route, not the portal one', () => {
    // The portal's /refresh is licence-scoped: it looks up a licence row, so it
    // cannot serve an anonymous free session at all.
    expect(readLoaderSource()).toContain('/delivery/refresh');
  });
});

describe('degraded fallback (§1.9)', () => {
  let el;
  beforeEach(() => { el = document.createElement('div'); });

  it('leaves a USABLE textarea, not just an error message', () => {
    // The visitor was mid-task. Degraded beats blocked: they can still write
    // and still submit the form.
    const area = renderFallback(el, new Error('offline'));
    expect(area?.tagName).toBe('TEXTAREA');
    expect(hasFallback(el)).toBe(true);
  });

  it('preserves the starting content so nothing is lost', () => {
    const area = renderFallback(el, new Error('x'), { initialValue: 'draft text' });
    expect(area.value).toBe('draft text');
  });

  it('carries the form field name so an ordinary submit still works', () => {
    const area = renderFallback(el, new Error('x'), { name: 'body' });
    expect(area.name).toBe('body');
  });

  it('shows a plain, non-technical message by default', () => {
    renderFallback(el, new Error('ECONNREFUSED 127.0.0.1:443'));
    const text = el.textContent;
    expect(text).toMatch(/could not load/i);
    // The visitor is not the integrator — the technical reason belongs in the
    // console and onError, not on screen.
    expect(text).not.toMatch(/ECONNREFUSED/);
  });

  it('keeps the technical reason available for diagnostics', () => {
    renderFallback(el, new Error('ECONNREFUSED'));
    expect(el.querySelector('[data-oe-fallback]').dataset.oeError).toContain('ECONNREFUSED');
  });

  it('accepts a custom message', () => {
    renderFallback(el, new Error('x'), { message: 'Editor unavailable — plain text only.' });
    expect(el.textContent).toContain('plain text only');
  });

  it('NEVER stacks — a second failure replaces the first', () => {
    renderFallback(el, new Error('one'));
    renderFallback(el, new Error('two'));
    expect(el.querySelectorAll('[data-oe-fallback]')).toHaveLength(1);
  });

  it('can be removed cleanly, so a retry starts from an empty container', () => {
    renderFallback(el, new Error('x'));
    removeFallback(el);
    expect(hasFallback(el)).toBe(false);
    expect(el.children).toHaveLength(0);
  });

  it('is labelled for screen readers', () => {
    const area = renderFallback(el, new Error('x'));
    expect(area.getAttribute('aria-label')).toBeTruthy();
  });
});
