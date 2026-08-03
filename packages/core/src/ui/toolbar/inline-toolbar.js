/**
 * Inline bubble toolbar (7.19) — Medium-style floating bar above a non-collapsed
 * selection. Shows bold / italic / underline / heading shortcuts. Reuses the
 * Button factory; hides on collapse, blur, or scroll.
 */

import { createButton } from './toolbar-button.js';
import { resolveLocale } from './locale.js';
import { featureForCommand } from '../../entitlements/feature-catalog.js';

export const BUBBLE_ITEMS = [
  { type: 'button', name: 'bold',          command: 'bold',          icon: 'bold',          labelKey: 'bold' },
  { type: 'button', name: 'italic',        command: 'italic',        icon: 'italic',        labelKey: 'italic' },
  { type: 'button', name: 'underline',     command: 'underline',     icon: 'underline',     labelKey: 'underline' },
  { type: 'button', name: 'strikethrough', command: 'strikethrough', icon: 'strikethrough', labelKey: 'strikethrough' },
  { type: 'button', name: 'inlineCode',    command: 'inlineCode',    icon: 'inlineCode',    labelKey: 'inlineCode' },
  { type: 'button', name: 'blockquote',    command: 'blockquote',    icon: 'blockquote',    labelKey: 'blockquote' },
  // Link — "select text → add link" is a Google-Docs staple. It has no command
  // (the link plugin owns the dialog), so onClick activates that plugin's
  // toolbar button; the row hides itself when the link plugin isn't installed
  // (see _syncLinkVisibility — the bubble is built before plugins install).
  // Literal `tooltip` + inline icon so no new locale key / cross-plugin import.
  {
    type: 'button', name: 'bubbleLink', tooltip: 'Insert Link',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
    onClick: (editor) => activateLinkButton(editor),
  },
];

/** The link plugin's rendered toolbar button, or null. The SAME predicate backs
 *  both the bubble button's visibility and its click, so they can never diverge
 *  (e.g. plugin installed but its button not rendered under toolbar:false / a
 *  custom items list / feature-gated away → the bubble button must stay hidden,
 *  not show a no-op). */
function findLinkButton(editor) {
  const root = editor && editor.getContainer && editor.getContainer();
  return root && typeof root.querySelector === 'function'
    ? root.querySelector('.oe-tb__btn[data-name="insertLink"]')
    : null;
}

/** Activate the link plugin's toolbar button (opens its dialog) if present. */
function activateLinkButton(editor) {
  const btn = findLinkButton(editor);
  if (btn) btn.click();
}

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
      // Feature gating (Phase 2.4): skip a bubble button whose feature isn't
      // granted (its own hardcoded list, separate from the main toolbar).
      const featureId = featureForCommand(item.command);
      if (featureId && this._editor.isFeatureGranted && !this._editor.isFeatureGranted(featureId)) continue;
      // H-1 fix: each button gets its own hooks so bookmarks don't cross-contaminate.
      const hooks = { savedBookmark: null, afterAction: this._afterAction };
      const c = createButton(this._editor, item, this._locale, doc, hooks);
      this._controls.push(c);
      if (item.name === 'bubbleLink') this._linkBtn = c.el; // toggled by presence
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
    this._syncLinkVisibility();
    this._sync();
    const bRect = this._el.getBoundingClientRect();
    let top = rect.top - wRect.top + oy - bRect.height - 8;
    if (top < 0) top = rect.bottom - wRect.top + oy + 8; // flip below if no room above
    let left = rect.left - wRect.left + ox + (rect.width / 2) - (bRect.width / 2);
    left = Math.max(0, Math.min(left, wRect.width - bRect.width));
    this._el.style.top = `${top}px`;
    this._el.style.left = `${left}px`;
  }

  /** Show the bubble Link button only when the link plugin's RENDERED toolbar
   *  button exists — matching exactly what the click needs, so the bubble never
   *  shows a button that would no-op (toolbar:false / custom items / gated). */
  _syncLinkVisibility() {
    if (!this._linkBtn) return;
    this._linkBtn.hidden = !findLinkButton(this._editor);
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
