/**
 * print-audit-fixes.test.js — deep-audit fixes for the free print()/export-to-PDF
 * path:
 *  P1 print() always sanitizes the popup document, even when the editor is
 *     configured with `sanitize: false` (getHTML() alone would skip it there).
 *  P2 the popup window is opened with `noopener`.
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
    document: { write: (s) => { written += s; }, close() {} },
    focus() {}, print() {},
  };
  const orig = window.open;
  window.open = (...args) => { features = args[2]; return fakeWin; };
  return {
    restore: () => { window.open = orig; },
    getWritten: () => written,
    getFeatures: () => features,
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

describe('P2 — the print popup is opened with noopener', () => {
  it('window.open is called with a noopener feature flag', () => {
    make();
    editor.setHTML('<p>x</p>');
    const fake = fakeWindowOpen();
    try { editor.print(); } finally { fake.restore(); }
    expect(fake.getFeatures()).toContain('noopener');
  });
});
