/**
 * print-popup-handle.test.js — `window.open` must NOT be called with `noopener`.
 *
 * ─── THE BUG THIS LOCKS DOWN ────────────────────────────────────────────────
 * Both print paths open a blank popup and WRITE the print document into it:
 *   • editor.print()            (free)   — editor-view.js
 *   • editor.exportPdf()        (premium) — premium/export-pdf
 *
 * Both passed `noopener` in the feature string. Per spec that makes
 * `window.open` return NULL — handing back no handle is precisely what noopener
 * means — so `win` was always null and both took the "popup blocked" branch.
 * Free print silently did nothing; PDF export told the customer to "allow
 * pop-ups", advice that could not have helped because pop-ups were never the
 * problem. The paid feature failed 100% of the time, in every browser.
 *
 * Verified directly in Chromium before the fix:
 *   window.open('', '_blank', 'width=800,height=600,noopener') -> null
 *   window.open('', '_blank', 'width=800,height=600')          -> Window
 *
 * The security intent (no `window.opener` back-reference from a window we write
 * into) is preserved by setting `win.opener = null` right after opening, which
 * these tests also assert — so the guard cannot be "fixed" by dropping it.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { OpenEditor } from '../src/editor.js';

let editor, target;
function mk(config) {
  target = document.createElement('div');
  document.body.appendChild(target);
  editor = new OpenEditor(target, config || {});
  return editor;
}
afterEach(() => {
  if (editor && !editor.isDestroyed()) editor.destroy();
  if (target && target.parentNode) target.remove();
  editor = target = null;
  vi.restoreAllMocks();
});

/** A minimal stand-in for the popup `print()` writes into. */
function fakeWindow() {
  const written = [];
  return {
    opener: {},               // must be nulled by the caller
    document: {
      write: (s) => written.push(s),
      close: () => {},
    },
    focus: () => {},
    print: () => {},
    written,
  };
}

describe('print() popup handle', () => {
  it('does NOT pass noopener — that would return null and break printing', () => {
    mk();
    editor.setHTML('<p>hello</p>');
    const spy = vi.spyOn(window, 'open').mockImplementation(() => fakeWindow());

    editor.print();

    expect(spy).toHaveBeenCalled();
    const features = String(spy.mock.calls[0][2] || '');
    // The exact regression: noopener in the feature string.
    expect(features).not.toContain('noopener');
  });

  it('severs opener on the popup instead (same protection, keeps the handle)', () => {
    mk();
    editor.setHTML('<p>hello</p>');
    const win = fakeWindow();
    vi.spyOn(window, 'open').mockImplementation(() => win);

    editor.print();

    expect(win.opener).toBeNull();
  });

  it('actually writes the print document into the popup', () => {
    mk();
    editor.setHTML('<p>unique-print-marker</p>');
    const win = fakeWindow();
    vi.spyOn(window, 'open').mockImplementation(() => win);

    editor.print();

    // Proves the handle was usable — the whole point of dropping noopener.
    expect(win.written.length).toBeGreaterThan(0);
    expect(win.written.join('')).toContain('unique-print-marker');
  });

  it('still fails gracefully when the popup is GENUINELY blocked', () => {
    mk();
    editor.setHTML('<p>hello</p>');
    vi.spyOn(window, 'open').mockImplementation(() => null);
    // Must not throw: a real popup block is a normal, handled outcome.
    expect(() => editor.print()).not.toThrow();
  });
});
