/**
 * BlockquoteToolbar — contextual floating toolbar that appears when the cursor
 * enters a <blockquote>. Hides when the cursor leaves or editor loses focus.
 *
 * Row 1 — Style pills: Border / Card / Pull quote / 4 Callout variants
 * Row 2 — Accent color swatches + custom hex (visible for ALL styles)
 *          For border-type styles: sets border-left-color
 *          For card/pull/callout styles: sets --bq-accent CSS variable
 * Row 3 — Remove button
 *
 * Style is stored as data-bq-style="<key>" on the <blockquote>.
 * Accent color is stored as style="--bq-accent: <color>" on the <blockquote>.
 * CSS in base-css.js uses var(--bq-accent) for each style.
 */

import { walkUp } from '../../selection/range-utils.js';
import { buildBlockquoteToolbar } from './blockquote-toolbar-dom.js';
import { isSafeCSSValue } from '../../commands/style-commands.js';
import {
  BQ_STYLES, BLOCKQUOTE_BORDER_COLORS, DEFAULT_STYLE_KEY, DEFAULT_ACCENT,
} from './blockquote-toolbar-data.js';

// ─── Style definitions ────────────────────────────────────────────────────────

// Style/accent/color data lives in a leaf module (blockquote-toolbar-data.js) so
// blockquote-toolbar-dom.js can import it too WITHOUT re-importing this file
// (breaks the former cycle). Re-export the public names for existing consumers.
export { BQ_STYLES, BLOCKQUOTE_BORDER_COLORS };

// ─── BlockquoteToolbar ────────────────────────────────────────────────────────

export class BlockquoteToolbar {
  constructor(editor, doc) {
    this._editor    = editor;
    this._doc       = doc;
    this._el        = null;
    this._rafId     = null;
    this._currentBQ = null;
    this._prevBQ    = null;

    this._styleBtns   = [];
    this._swatchRow   = null;
    this._colorLabel  = null;
    this._hexInput    = null;
    this._colorSection = null;

    this._onSelChange   = () => this._scheduleUpdate();
    this._onBlur        = () => this._hide();
    this._onAfterCmd    = (ev) => {
      if (ev && ev.command === 'blockquoteEnter') this._hide();
    };
    // Hide on click outside editor/toolbar. selectionChange isn't emitted there
    // (get() returns null) and blur is unreliable, so a doc-level mousedown is
    // the only guaranteed signal.
    this._onDocMouseDown = (e) => {
      if (!this._el || this._el.hidden) return;
      const editorEl = editor.getEditorElement && editor.getEditorElement();
      const wrapper  = editor._wrapper;
      const target   = e.target;
      // Click inside the toolbar itself — keep open (user is picking a style/color)
      if (this._el.contains(target)) return;
      // Click inside the editor content area — selectionChange will handle it
      if (editorEl && editorEl.contains(target)) return;
      // Click inside the wrapper (e.g. toolbar buttons) — keep open
      if (wrapper && wrapper.contains(target)) return;
      // Anything else (outside the editor entirely) — hide immediately
      this._hide();
    };

    this._build();
    this._bind();
  }

  getElement() { return this._el; }

  // ─── Build ─────────────────────────────────────────────────────────────────

  _build() {
    // DOM construction lives in blockquote-toolbar-dom.js (300-line limit).
    buildBlockquoteToolbar(this, this._doc);
  }

  // ─── Bind ──────────────────────────────────────────────────────────────────

  _bind() {
    this._editor.on('selectionChange', this._onSelChange);
    this._editor.on('blur',            this._onBlur);
    this._editor.on('afterCommand',    this._onAfterCmd);
    // Listen on the OUTER document (toolbar + page clicks) and, in iframe mode,
    // also on the iframe document (clicks inside the editable content fire
    // there, not on the outer document).
    if (typeof document !== 'undefined') {
      document.addEventListener('mousedown', this._onDocMouseDown, true);
    }
    const idoc = this._editor._iframeDoc;
    if (idoc && idoc !== document) {
      idoc.addEventListener('mousedown', this._onDocMouseDown, true);
    }
  }

  // ─── Style apply ───────────────────────────────────────────────────────────

  _applyStyle(key) {
    const bq = this._currentBQ;
    if (!bq) return;

    const prevKey = bq.getAttribute('data-bq-style') || DEFAULT_STYLE_KEY;
    bq.setAttribute('data-bq-style', key);

    // When switching style, reset accent color to the new style's default
    // so the inherited color from the old style doesn't bleed through.
    if (key !== prevKey) {
      const def = DEFAULT_ACCENT[key] || '#c5c5c5';
      bq.style.setProperty('--bq-accent', def);
    }

    this._syncUI(bq);
  }

  _applyAccent(color) {
    const bq = this._currentBQ;
    if (!bq) return;
    // LOW fix: the custom-color input used to write its raw value unvalidated.
    // Reject anything the shared CSS-injection guard flags; flag the input.
    if (!color || !isSafeCSSValue(color)) {
      if (this._hexInput) {
        this._hexInput.classList.add('oe-bq-toolbar__hex--invalid');
        this._hexInput.focus();
      }
      return;
    }
    // Store as CSS custom property — all style variants read it via var(--bq-accent)
    bq.style.setProperty('--bq-accent', color);
    this._syncSwatchActive(color);
    if (this._hexInput) {
      this._hexInput.classList.remove('oe-bq-toolbar__hex--invalid');
      this._hexInput.value = '';
    }
  }

  // ─── UI sync ───────────────────────────────────────────────────────────────

  _syncUI(bq) {
    const key = bq.getAttribute('data-bq-style') || DEFAULT_STYLE_KEY;
    const def = BQ_STYLES.find((d) => d.key === key) || BQ_STYLES[0];

    // Active style pill
    for (const { key: k, el } of this._styleBtns) {
      el.classList.toggle('oe-bq-toolbar__stylebtn--active', k === key);
    }

    // Update color row label to match current style
    if (this._colorLabel) this._colorLabel.textContent = def.colorLabel;

    // Sync swatch to current accent color (or default for this style)
    const accent = bq.style.getPropertyValue('--bq-accent').trim() ||
                   DEFAULT_ACCENT[key] || '#c5c5c5';
    this._syncSwatchActive(accent);
  }

  _syncSwatchActive(color) {
    if (!this._swatchRow) return;
    const norm = (color || '').toLowerCase();
    for (const sw of Array.from(this._swatchRow.querySelectorAll('.oe-bq-toolbar__swatch'))) {
      const swColor = (sw.getAttribute('title') || '').toLowerCase();
      sw.classList.toggle('oe-bq-toolbar__swatch--active', swColor === norm);
    }
  }

  // ─── Show / hide / position ────────────────────────────────────────────────

  _scheduleUpdate() {
    if (this._rafId != null) return;
    const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (fn) => setTimeout(fn, 16);
    this._rafId = raf(() => {
      this._rafId = null;
      this._update();
    });
  }

  _update() {
    const ed = this._editor;
    if (!ed) return;
    const root = ed.getEditorElement && ed.getEditorElement();
    const sel  = ed.selection && ed.selection.get();
    // If no selection or not inside the editor root — always hide
    if (!sel || !root || !sel.startNode) { this._hide(); return; }
    // If the startNode is no longer connected to the editor root — stale cursor, hide
    if (!root.contains(sel.startNode)) { this._hide(); return; }

    const bq = walkUp(sel.startNode, root,
      (n) => n.nodeType === 1 && n.tagName.toLowerCase() === 'blockquote'
    );

    if (!bq) { this._hide(); return; }

    this._currentBQ = bq;
    this._syncUI(bq);

    if (bq !== this._prevBQ) {
      this._prevBQ = bq;
      this._show();
    }
    this._position(bq);
  }

  _position(bq) {
    const bar     = this._el;
    const wrapper = this._editor && this._editor._wrapper;
    if (!bar || !wrapper || !bq) return;
    try {
      const bqRect = bq.getBoundingClientRect();
      const wRect  = wrapper.getBoundingClientRect();
      const barH   = bar.offsetHeight || 100;
      const barW   = bar.offsetWidth  || 380;
      const vw     = window.innerWidth  || 1024;
      const vh     = window.innerHeight || 768;

      // iframe mode: bqRect is in the iframe coordinate space; add the iframe
      // element's offset within the wrapper so it matches wRect's space.
      let ox = 0, oy = 0;
      const iframeEl = this._editor && this._editor._iframeEl;
      if (iframeEl && typeof iframeEl.getBoundingClientRect === 'function') {
        const iRect = iframeEl.getBoundingClientRect();
        ox = iRect.left - wRect.left;
        oy = iRect.top - wRect.top;
      }

      let top = bqRect.bottom - wRect.top + oy + 4;
      if (bqRect.bottom + barH + 4 > vh - 8) top = bqRect.top - wRect.top + oy - barH - 4;

      let left = bqRect.left - wRect.left + ox;
      if (bqRect.left + barW > vw - 8) left = Math.max(0, bqRect.right - wRect.left + ox - barW);

      bar.style.top  = `${Math.max(0, top)}px`;
      bar.style.left = `${Math.max(0, left)}px`;
    } catch { /* headless */ }
  }

  _show() { if (this._el) this._el.hidden = false; }

  _hide() {
    if (this._el) this._el.hidden = true;
    this._currentBQ = null;
    this._prevBQ    = null;
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  destroy() {
    if (this._rafId != null) {
      (typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : clearTimeout)(this._rafId);
      this._rafId = null;
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('mousedown', this._onDocMouseDown, true);
    }
    if (this._editor) {
      const idoc = this._editor._iframeDoc;
      if (idoc && idoc !== document) {
        idoc.removeEventListener('mousedown', this._onDocMouseDown, true);
      }
      this._editor.off('selectionChange', this._onSelChange);
      this._editor.off('blur',            this._onBlur);
      this._editor.off('afterCommand',    this._onAfterCmd);
    }
    if (this._el && this._el.parentNode) this._el.parentNode.removeChild(this._el);
    this._el     = null;
    this._editor = null;
  }
}
