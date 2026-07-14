/**
 * Status bar (7.20) — renders below the editor, shows live word count, char
 * count, and cursor line/column. Updates are rAF-throttled. CJK word counting
 * falls back to per-character counting (segmentation hook for locale 7.24).
 */

import { t } from './locale.js';

const CJK_RE = /[\u3000-鿿가-힯豈-﫿]/;

function countWords(text) {
  if (!text) return 0;
  // CJK scripts have no spaces — count CJK chars individually plus
  // whitespace-delimited runs of non-CJK text.
  if (CJK_RE.test(text)) {
    const cjk = (text.match(/[\u3000-鿿가-힯豈-﫿]/g) || []).length;
    const rest = text.replace(/[\u3000-鿿가-힯豈-﫿]/g, ' ')
      .trim().split(/\s+/).filter(Boolean).length;
    return cjk + rest;
  }
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export class StatusBar {
  constructor(editor, locale, doc) {
    this._editor = editor;
    this._locale = locale;
    this._doc = doc;
    this._el = null;
    this._rafId = null;
    this._onSync = () => this._schedule();
    this._build();
    this._bind();
    this._schedule();
  }

  getElement() { return this._el; }

  _build() {
    const doc = this._doc;
    const bar = doc.createElement('div');
    bar.className = 'oe-statusbar';
    bar.setAttribute('role', 'status');
    // L-6: use aria-live="polite" so screen readers eventually hear the counts.
    // The rAF throttle prevents runaway announcements on every keystroke.
    bar.setAttribute('aria-live', 'polite');
    bar.setAttribute('aria-atomic', 'false'); // announce only the changed span
    this._counts = doc.createElement('span');
    this._counts.className = 'oe-statusbar__counts';
    this._pos = doc.createElement('span');
    this._pos.className = 'oe-statusbar__pos';
    // LOW a11y fix: cursor line/col changes on EVERY arrow key — announcing it
    // via the live region spams the screen reader and competes with its own
    // caret tracking. Keep it visible but out of the live announcement.
    this._pos.setAttribute('aria-hidden', 'true');
    bar.appendChild(this._counts);
    bar.appendChild(this._pos);
    if (this._editor._wrapper) this._editor._wrapper.appendChild(bar);
    this._el = bar;
  }

  _bind() {
    const ed = this._editor;
    ed.on('input', this._onSync);
    ed.on('selectionChange', this._onSync);
    ed.on('afterCommand', this._onSync);
    // Programmatic content replacement (setHTML) fires neither input nor
    // afterCommand, so without this the counts stayed stale at their last
    // value (e.g. "0 words") after setHTML. Surfaced by the 16.7.9 e2e.
    ed.on('setHTML', this._onSync);
  }

  _schedule() {
    if (this._rafId != null) return;
    const raf = (typeof requestAnimationFrame === 'function') ? requestAnimationFrame : (fn) => setTimeout(fn, 0);
    this._rafId = raf(() => { this._rafId = null; this._render(); });
  }

  _render() {
    if (!this._editor || this._editor.isDestroyed()) return;
    const text = this._editor.getText();
    const words = countWords(text);
    const chars = this._editor.getCharCount ? this._editor.getCharCount() : text.length;
    // 16.7.9 — when a non-collapsed selection exists, show a selection-scoped
    // count instead of the whole-document one (reusing the same countWords path
    // and the selection manager's existing getSelectedText()). Falls straight
    // back to the document count when nothing is selected.
    const sel = this._editor.selection;
    const selText = (sel && typeof sel.getSelectedText === 'function') ? sel.getSelectedText() : '';
    if (selText) {
      const selWords = countWords(selText);
      // Char count mirrors getCharCount()'s document semantics (code-point-ish
      // length of the plain text); good enough for a "N selected" readout.
      const selChars = selText.length;
      this._counts.textContent =
        `${selWords} ${t(this._locale, 'words')}, ${selChars} ${t(this._locale, 'chars')} ${t(this._locale, 'selected')}`;
    } else {
      this._counts.textContent = `${words} ${t(this._locale, 'words')}, ${chars} ${t(this._locale, 'chars')}`;
    }
    const lc = this._lineColumn();
    if (lc) this._pos.textContent = `${t(this._locale, 'line')} ${lc.line}, ${t(this._locale, 'col')} ${lc.col}`;
    else this._pos.textContent = '';
  }

  // Approximate line/column from the caret position within its block.
  _lineColumn() {
    const sel = this._editor.selection && this._editor.selection.get();
    if (!sel) return null;
    const el = this._editor.getEditorElement();
    if (!el) return null;
    // Line = index of the caret's top-level block among blocks; col = caret offset in text.
    const node = sel.startNode;
    let block = node;
    while (block && block.parentNode && block.parentNode !== el) block = block.parentNode;
    const blocks = Array.from(el.children);
    const line = block ? Math.max(1, blocks.indexOf(block) + 1) : 1;
    const col = (sel.range && typeof sel.range.startOffset === 'number') ? sel.range.startOffset + 1 : 1;
    return { line, col };
  }

  destroy() {
    const ed = this._editor;
    if (this._rafId != null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this._rafId);
    this._rafId = null;
    if (ed) {
      ed.off('input', this._onSync);
      ed.off('selectionChange', this._onSync);
      ed.off('afterCommand', this._onSync);
      ed.off('setHTML', this._onSync);
    }
    if (this._el && this._el.parentNode) this._el.parentNode.removeChild(this._el);
    this._el = null;
    this._editor = null;
  }
}
