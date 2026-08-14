/**
 * print-audit-fixes.test.js — deep-audit fixes for the free print()/export-to-PDF
 * path:
 *  P1 print() always sanitizes the popup document, even when the editor is
 *     configured with `sanitize: false` (getHTML() alone would skip it there).
 *  P2 the popup window carries no `window.opener` back-reference.
 *     (This assertion was INVERTED once — see the P2 block for why the old
 *     `noopener` requirement silently broke printing entirely.)
 */
import { describe, it, expect, afterEach } from 'vitest';
import { OpenEditor } from '../src/editor.js';

let editor, target;
function make(config) {
  target = document.createElement('div');
  document.body.appendChild(target);
  editor = new OpenEditor(target, config || {});
  return editor;
}
afterEach(() => {
  if (editor && !editor.isDestroyed()) editor.destroy();
  if (target && target.parentNode) target.remove();
  editor = target = null;
});

function fakeWindowOpen() {
  let written = '';
  let features = null;
  const fakeWin = {
    // Starts non-null on purpose: a real popup HAS an opener, so the production
    // code has to sever it. Initialising to null would let the test pass
    // whether or not that ever happened.
    opener: {},
    document: { write: (s) => { written += s; }, close() {} },
    focus() {}, print() {},
  };
  const orig = window.open;
  window.open = (...args) => { features = args[2]; return fakeWin; };
  return {
    restore: () => { window.open = orig; },
    getWritten: () => written,
    getFeatures: () => features,
    getWindow: () => fakeWin,
  };
}

describe('P1 — print() always sanitizes, regardless of the sanitize config flag', () => {
  it('strips a script tag from the print document even with sanitize:false', () => {
    make({ sanitize: false });
    // With sanitize:false, _setRawHTML bypasses the input sanitizer too, so this
    // is exactly how unsafe content could land in the live DOM under this config.
    editor._setRawHTML('<p>hi</p><script>window.__pwned = true;</script>');
    const fake = fakeWindowOpen();
    try { editor.print(); } finally { fake.restore(); }
    expect(fake.getWritten()).not.toContain('<script>');
    expect(fake.getWritten()).not.toContain('__pwned');
  });

  it('normal (sanitize-on) content still prints correctly', () => {
    make();
    editor.setHTML('<p>hello world</p>');
    const fake = fakeWindowOpen();
    try { editor.print(); } finally { fake.restore(); }
    expect(fake.getWritten()).toContain('hello world');
  });
});

describe('P2 — the print popup must NOT hold a window.opener back-reference', () => {
  /**
   * ⚠️ THIS TEST USED TO ASSERT THE OPPOSITE, AND THE ASSERTION WAS THE BUG.
   *
   * It required `noopener` in the feature string. But per spec
   * `window.open(..., 'noopener')` returns NULL — withholding the handle is what
   * noopener *is* — and print() must WRITE into the window it opens. So `win`
   * was always null, print() took its "popup blocked" early-return, and NOTHING
   * EVER PRINTED. The premium PDF export shared the code and the fault, telling
   * customers to "allow pop-ups" for a problem pop-ups never caused.
   *
   * The mock is why it went unnoticed: fakeWindowOpen() always hands back a
   * fake window, so the test could not observe the null that real browsers
   * return. It asserted the mechanism (a flag) instead of the goal (no opener),
   * and passed for four years of a broken feature.
   *
   * So assert the GOAL. `win.opener === null` is what we actually want, and it
   * is reachable only if the handle survived — this cannot pass while printing
   * is broken.
   */
  it('opener is severed on the popup', () => {
    make();
    editor.setHTML('<p>x</p>');
    const fake = fakeWindowOpen();
    try { editor.print(); } finally { fake.restore(); }
    expect(fake.getWindow().opener).toBeNull();
  });

  it('does NOT pass noopener, which would return null and break printing', () => {
    make();
    editor.setHTML('<p>x</p>');
    const fake = fakeWindowOpen();
    try { editor.print(); } finally { fake.restore(); }
    expect(fake.getFeatures()).not.toContain('noopener');
  });
});
