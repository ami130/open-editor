/**
 * Phase 7 view-mode helpers (fullscreen 7.16, print 7.17), applied as a mixin
 * to OpenEditor. Extracted to keep editor-api.js under the 300-line limit.
 */

import { buildPrintDocument } from './utils/print-document.js';

// 15.6 — validate a user-supplied CSS custom-property value before it reaches
// setProperty. Rejects declaration-breakers (; { } < >), control chars and
// newlines (which could smuggle a second declaration), and the url()/
// expression()/javascript: vectors that can trigger a network fetch or script.
const CSS_VALUE_BREAKERS = /[;{}<>]/;
// eslint-disable-next-line no-control-regex
const CSS_VALUE_CONTROLS = /[\u0000-\u001f\u007f]/;
const CSS_VALUE_VECTORS = /url\s*\(|expression\s*\(|javascript:/i;
function isSafeCSSValue(value) {
  return typeof value === 'string'
    && !CSS_VALUE_BREAKERS.test(value)
    && !CSS_VALUE_CONTROLS.test(value)
    && !CSS_VALUE_VECTORS.test(value);
}

export const editorViewMixin = {

  toggleFullscreen() {
    if (this._destroyed || !this._wrapper) return;
    const on = !this._wrapper.classList.contains('oe-wrapper--fullscreen');
    this._wrapper.classList.toggle('oe-wrapper--fullscreen', on);
    this._setFullscreenScrollLock(on);
    if (on) {
      this._fsEscHandler = (e) => { if (e.key === 'Escape') this.toggleFullscreen(); };
      const d = this._iframeDoc || (typeof document !== 'undefined' ? document : null);
      this._fsDoc = d;
      if (d) d.addEventListener('keydown', this._fsEscHandler, true);
      this.emit('fullscreenEnter', this);
    } else {
      this._removeFullscreenEscListener();
      this.emit('fullscreenExit', this);
    }
  },

  // Lock the HOST page's scroll while fullscreen (the wrapper covers the viewport
  // via position:fixed, but the body behind it would otherwise still scroll on a
  // wheel/touch gesture, and exit could leave the page at an unexpected offset).
  // Saves the prior inline overflow and restores it EXACTLY on exit/destroy.
  _setFullscreenScrollLock(on) {
    const body = this._wrapper && this._wrapper.ownerDocument
      && this._wrapper.ownerDocument.body;
    if (!body) return;
    if (on) {
      if (this._fsPrevBodyOverflow === undefined) {
        this._fsPrevBodyOverflow = body.style.overflow;   // '' when not set inline
      }
      body.style.overflow = 'hidden';
    } else if (this._fsPrevBodyOverflow !== undefined) {
      body.style.overflow = this._fsPrevBodyOverflow;
      this._fsPrevBodyOverflow = undefined;
    }
  },

  _removeFullscreenEscListener() {
    if (this._fsDoc && this._fsEscHandler) {
      this._fsDoc.removeEventListener('keydown', this._fsEscHandler, true);
    }
    this._fsEscHandler = null;
    this._fsDoc = null;
    // Restore the host body scroll if we were fullscreen (covers destroy-in-FS).
    this._setFullscreenScrollLock(false);
  },

  isFullscreen() {
    return !!(this._wrapper && this._wrapper.classList.contains('oe-wrapper--fullscreen'));
  },

  print() {
    if (this._destroyed || typeof window === 'undefined') return;
    // ALWAYS sanitize here, independent of `_config.sanitize` — getHTML() skips
    // it when a host opts out (e.g. to preserve custom in-editor markup), but
    // this document is about to be written wholesale into a fresh popup via
    // document.write(), so it must be safe regardless of that unrelated choice.
    let html = this.getHTML();
    if (this._sanitizeHTML) html = this._sanitizeHTML(html);
    // ⚠️ DO NOT PUT `noopener` BACK IN THE FEATURE STRING.
    //
    // Per spec, `window.open(..., 'noopener')` returns NULL — the whole point of
    // noopener is to hand back no handle. But this method must WRITE into the
    // window it just opened, so a null handle means printing silently does
    // nothing. It read as "popup blocked" and was indistinguishable from the
    // real thing, in every browser, for every user. Verified directly:
    //   window.open('', '_blank', 'w,h,noopener') -> null
    //   window.open('', '_blank', 'w,h')          -> Window
    //
    // The original security goal still holds — it is just achieved AFTER the
    // open, by severing `opener` on the child ourselves.
    const win = window.open('', '_blank', 'width=800,height=600');
    if (!win) return; // genuinely popup blocked — fail gracefully
    // Same blast-radius reduction noopener was reaching for: the popup only ever
    // holds content written below, so it has no legitimate use for a back
    // reference to this window.
    try { win.opener = null; } catch { /* cross-origin guard; not fatal */ }
    try {
      // H2: ship the editor's full stylesheet (theme tokens + BASE_CSS, content
      // wrapped in .oe-editor) so the printout matches the editor — previously
      // only the page-break rule travelled and everything else printed unstyled.
      // A @media print block emits the real page break and hides screen-only
      // markers (dashed page-break line, hr click-padding, selection outline).
      win.document.write(buildPrintDocument(html, 'Print'));
      win.document.close();
      win.focus();
      win.print();
    } catch {
      // Some browsers (strict CSP / sandboxed context) disallow write() on
      // the popup document even though open() succeeded. Fail silently rather
      // than surfacing an uncaught exception (M-1 fix).
    }
  },

  // 14.11 — set text direction at runtime. Updates the editable (text flow) and
  // the wrapper (so the toolbar mirrors via [dir="rtl"] CSS). Emits
  // 'directionChange' only on an actual transition.
  setDirection(dir) {
    if (this._destroyed) return;
    const next = dir === 'rtl' ? 'rtl' : 'ltr';
    const prev = this._config.direction === 'rtl' ? 'rtl' : 'ltr';
    this._config.direction = next;
    if (this._editorEl) this._editorEl.setAttribute('dir', next);
    if (this._wrapper) this._wrapper.setAttribute('dir', next);
    if (next !== prev) this.emit('directionChange', { direction: next });
  },

  getDirection() {
    return this._config && this._config.direction === 'rtl' ? 'rtl' : 'ltr';
  },

  // 15.5/15.10 — switch theme at runtime. Sets data-oe-theme on the wrapper (so
  // token overrides re-cascade — flash-free, no re-inject) AND on the editable
  // (so iframe mode themes too; the wrapper attribute can't cross the boundary).
  // 'light' clears the attribute (default cascade). Emits 'themeChange' on a real
  // transition. Valid: light | dark | minimal | auto.
  setTheme(theme) {
    if (this._destroyed) return;
    const valid = ['light', 'dark', 'minimal', 'auto'];
    const next = valid.includes(theme) ? theme : 'light';
    const prev = this.getTheme();
    this._config.theme = next;
    for (const el of [this._wrapper, this._editorEl]) {
      if (!el) continue;
      if (next === 'light') el.removeAttribute('data-oe-theme');
      else el.setAttribute('data-oe-theme', next);
    }
    if (next !== prev) this.emit('themeChange', { theme: next });
  },

  getTheme() {
    const t = this._config && this._config.theme;
    return ['dark', 'minimal', 'auto'].includes(t) ? t : 'light';
  },

  // 15.6 — per-instance CSS variable override, set on the wrapper (and editable
  // for iframe reach). Value is validated as a safe CSS token to prevent style
  // injection. name may omit the leading '--'.
  setCSSVar(name, value) {
    if (this._destroyed || typeof name !== 'string') return;
    const prop = name.startsWith('--') ? name : `--${name}`;
    if (!/^--[a-zA-Z0-9-]+$/.test(prop)) return;         // guard the property name
    if (!isSafeCSSValue(value)) return;                  // guard the value (15.6)
    if (this._wrapper) this._wrapper.style.setProperty(prop, value);
    if (this._editorEl) this._editorEl.style.setProperty(prop, value);
  },

  getCSSVar(name) {
    if (!this._wrapper || typeof name !== 'string') return '';
    const prop = name.startsWith('--') ? name : `--${name}`;
    try {
      return (this._wrapper.ownerDocument.defaultView || window)
        .getComputedStyle(this._wrapper).getPropertyValue(prop).trim();
    } catch { return ''; }
  },

};
