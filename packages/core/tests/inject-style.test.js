/**
 * Stage 1 (15.9) — injectStyleOnce delivery.
 *
 * PRIMARY path: Constructable Stylesheets (adoptedStyleSheets) — CSP-clean, no
 * <style> element. FALLBACK: <style>+textContent when the engine lacks
 * constructable sheets (jsdom, Safari < 16.4). These tests exercise BOTH paths
 * by feature-toggling the document, and lock in the once-guard.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { injectStyleOnce } from '../src/utils/inject-style.js';

describe('injectStyleOnce — <style> fallback path (jsdom default)', () => {
  let host;
  beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); });
  afterEach(() => {
    host.remove();
    // clean any styles we added to head
    document.querySelectorAll('#test-a, #test-b').forEach((n) => n.remove());
  });

  it('injects a <style> when constructable sheets are unavailable (jsdom)', () => {
    const ok = injectStyleOnce(document, 'test-a', '.x{color:red}');
    expect(ok).toBe(true);
    const el = document.getElementById('test-a');
    expect(el).not.toBeNull();
    expect(el.tagName).toBe('STYLE');
    expect(el.textContent).toContain('color:red');
  });

  it('is idempotent — a second call with the same id is a no-op', () => {
    injectStyleOnce(document, 'test-b', '.y{color:blue}');
    const ok2 = injectStyleOnce(document, 'test-b', '.y{color:green}');
    expect(ok2).toBe(false);
    expect(document.querySelectorAll('#test-b').length).toBe(1);
    expect(document.getElementById('test-b').textContent).toContain('blue'); // not overwritten
  });

  it('returns false for a null document', () => {
    expect(injectStyleOnce(null, 'x', '.z{}')).toBe(false);
  });
});

describe('injectStyleOnce — constructable path (CSP-clean, no <style>)', () => {
  // Simulate a document/window that DOES support constructable stylesheets, the
  // way a CSP-restricted modern browser would. We stub a minimal CSSStyleSheet
  // and an adoptedStyleSheets array on a fake document.
  function fakeDocWithConstructable() {
    const adopted = [];
    const created = [];
    class FakeSheet {
      constructor() { this.rules = ''; }
      replaceSync(css) { this.rules = css; created.push(this); }
    }
    const doc = {
      defaultView: { CSSStyleSheet: FakeSheet },
      get adoptedStyleSheets() { return adopted; },
      set adoptedStyleSheets(v) { adopted.length = 0; adopted.push(...v); },
      // Present so a mistaken fallback would be detectable, but must NOT be used.
      getElementById: vi.fn(() => null),
      createElement: vi.fn(() => { throw new Error('fallback <style> must NOT be used under CSP'); }),
    };
    // The 'in' check needs adoptedStyleSheets to be an own/proto property → it is (getter).
    return { doc, adopted, created };
  }

  it('adopts a CSSStyleSheet instead of creating a <style> element', () => {
    const { doc, adopted, created } = fakeDocWithConstructable();
    const ok = injectStyleOnce(doc, 'cnstr-1', '.a{color:red}');
    expect(ok).toBe(true);
    expect(created.length).toBe(1);
    expect(created[0].rules).toContain('color:red');
    expect(adopted.length).toBe(1);         // sheet adopted
    expect(doc.createElement).not.toHaveBeenCalled(); // NO <style> element → CSP-safe
  });

  it('is idempotent across the constructable path (same id not re-adopted)', () => {
    const { doc, adopted } = fakeDocWithConstructable();
    injectStyleOnce(doc, 'cnstr-2', '.a{}');
    const ok2 = injectStyleOnce(doc, 'cnstr-2', '.a{}');
    expect(ok2).toBe(false);
    expect(adopted.length).toBe(1);
  });

  it('appends without clobbering previously-adopted sheets', () => {
    const { doc, adopted } = fakeDocWithConstructable();
    // Pretend the host page already adopted one of its own sheets.
    const foreign = {};
    doc.adoptedStyleSheets = [foreign];
    injectStyleOnce(doc, 'cnstr-3', '.a{}');
    expect(adopted.length).toBe(2);
    expect(adopted[0]).toBe(foreign);       // host sheet preserved
  });
});
