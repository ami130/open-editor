/**
 * Inline bubble toolbar (7.19) — Medium-style floating bar above a non-collapsed
 * selection. Shows bold / italic / underline / heading shortcuts. Reuses the
 * Button factory; hides on collapse, blur, or scroll.
 */

import { createButton } from './toolbar-button.js';
import { resolveLocale } from './locale.js';

const BUBBLE_ITEMS = [
  { type: 'button', name: 'bold',          command: 'bold',          icon: 'bold',          labelKey: 'bold' },
  { type: 'button', name: 'italic',        command: 'italic',        icon: 'italic',        labelKey: 'italic' },
  { type: 'button', name: 'underline',     command: 'underline',     icon: 'underline',     labelKey: 'underline' },
  { type: 'button', name: 'strikethrough', command: 'strikethrough', icon: 'strikethrough', labelKey: 'strikethrough' },
  { type: 'button', name: 'inlineCode',    command: 'inlineCode',    icon: 'inlineCode',    labelKey: 'inlineCode' },
  { type: 'button', name: 'blockquote',    command: 'blockquote',    icon: 'blockquote',    labelKey: 'blockquote' },
];

export class InlineToolbar {
  constructor(editor, locale, doc) {
    this._editor = editor;
    this._locale = locale || resolveLocale(editor._config.locale);
    this._doc = doc;
    this._el = null;
    this._controls = [];
    this._rafId = null;
    // H-1 fix: _afterAction is shared (idempotent); each button gets its own
    // hooks object in _build() so bookmarks don't cross-contaminate.
    this._afterAction = () => this._sync();
    this._onSelChange = () => this._scheduleReposition();
    this._onBlur = () => this._hide();
    this._build();
    this._bind();
  }

  getElement() { return this._el; }

  _build() {
    const doc = this._doc;
    const bar = doc.createElement('div');
    bar.className = 'oe-bubble';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Selection toolbar');
    bar.hidden = true;
    for (const item of BUBBLE_ITEMS) {
      // H-1 fix: each button gets its own hooks so bookmarks don't cross-contaminate.
      const hooks = { savedBookmark: null, afterAction: this._afterAction };
      const c = createButton(this._editor, item, this._locale, doc, hooks);
      this._controls.push(c);
      bar.appendChild(c.el);
    }
    if (this._editor._wrapper) this._editor._wrapper.appendChild(bar);
    this._el = bar;
  }

  _bind() {
    const ed = this._editor;
    ed.on('selectionChange', this._onSelChange);
    ed.on('blur', this._onBlur);
  }

  _sync() { for (const c of this._controls) c.update && c.update(); }

  _scheduleReposition() {
    if (this._rafId != null) return;
    const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (fn) => setTimeout(fn, 16);
    this._rafId = raf(() => {
      this._rafId = null;
      this._reposition();
    });
  }

  _reposition() {
    const ed = this._editor;
    const sel = ed.selection && ed.selection.get();
    if (!sel || sel.collapsed) { this._hide(); return; }
    const range = sel.range;
    if (!range || typeof range.getBoundingClientRect !== 'function') { this._hide(); return; }
    const rect = range.getBoundingClientRect();
    const wrapper = ed._wrapper;
    if (!wrapper || (rect.width === 0 && rect.height === 0)) { this._hide(); return; }
    const wRect = wrapper.getBoundingClientRect();
    // iframe mode: range rects are in the iframe's coordinate space, while wRect
    // is in the outer document. Add the iframe element's offset within the
    // wrapper so both are in the same space before subtracting.
    let ox = 0, oy = 0;
    if (ed._iframeEl && typeof ed._iframeEl.getBoundingClientRect === 'function') {
      const iRect = ed._iframeEl.getBoundingClientRect();
      ox = iRect.left - wRect.left;
      oy = iRect.top - wRect.top;
    }
    this._el.hidden = false;
    this._sync();
    const bRect = this._el.getBoundingClientRect();
    let top = rect.top - wRect.top + oy - bRect.height - 8;
    if (top < 0) top = rect.bottom - wRect.top + oy + 8; // flip below if no room above
    let left = rect.left - wRect.left + ox + (rect.width / 2) - (bRect.width / 2);
    left = Math.max(0, Math.min(left, wRect.width - bRect.width));
    this._el.style.top = `${top}px`;
    this._el.style.left = `${left}px`;
  }

  _hide() { if (this._el) this._el.hidden = true; }

  destroy() {
    const ed = this._editor;
    if (ed) {
      ed.off('selectionChange', this._onSelChange);
      ed.off('blur', this._onBlur);
    }
    if (this._el && this._el.parentNode) this._el.parentNode.removeChild(this._el);
    this._el = null;
    this._controls = [];
    this._editor = null;
  }
}
