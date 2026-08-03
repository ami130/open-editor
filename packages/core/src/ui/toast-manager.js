/**
 * toast-manager.js — a small, shared, accessible feedback surface.
 *
 * Generalises the one-off `role="status"` chip the speech plugin grew (see
 * speech-plugin.js `_notify`) into a single service every feature can use, so
 * user-facing actions (export to PDF/DOCX, image load errors, copy, etc.) can
 * always tell the user what happened instead of failing silently.
 *
 * Exposed as `editor.ui.toast`:
 *   editor.ui.toast.success('Exported to Word')
 *   editor.ui.toast.error('Export failed — popup blocked')
 *   editor.ui.toast.info('Fetching images…')
 *   const p = editor.ui.toast.progress('Exporting…')  // sticky, no auto-dismiss
 *   p.success('Done')  /  p.error('Failed')  /  p.close()
 *
 * Design decisions:
 *  - NOT a new editor EVENT (the event list is frozen); it's a UI manager,
 *    wired the same way as modal/tooltip/contextMenu in editor.js.
 *  - Toasts live in the WRAPPER (outer document, positioned), never in the
 *    editable — so they can't pollute getHTML() or overlap the caret target.
 *  - Accessibility: errors use role="alert"/aria-live="assertive" so they
 *    interrupt; success/info use role="status"/aria-live="polite". A progress
 *    toast is polite and sticky until resolved.
 *  - No-ops safely when there is no DOM (SSR/tests) — every method still returns
 *    a handle so callers never crash.
 *  - Styling is injected once via injectStyleOnce (constructable-sheet/CSP-safe),
 *    theme-aware through the same --oe-* tokens the rest of the chrome uses.
 */
import { injectStyleOnce } from '../utils/inject-style.js';

const STYLE_ID = 'oe-toast-styles';
const DEFAULT_MS = 3600;

const TOAST_CSS = `
  .oe-toast-region {
    position: absolute;
    left: 50%;
    bottom: 12px;
    transform: translateX(-50%);
    /* Above the modal layer (backdrop 1000) — a toast fired while a dialog is
       open (e.g. an export error) must be VISIBLE, not hidden behind the dimmed
       backdrop. This is the whole point of the feedback surface. Only the slash
       caret-popup (99999) sits higher, which is fine (it's transient + focused). */
    z-index: var(--oe-z-toast, 1100);
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: center;
    width: max-content;
    max-width: min(92%, 480px);
    pointer-events: none;
  }
  .oe-toast {
    display: flex;
    align-items: center;
    gap: 8px;
    box-sizing: border-box;
    max-width: 100%;
    padding: 8px 12px;
    border-radius: 8px;
    font-size: 13px;
    line-height: 1.35;
    color: #fff;
    background: #2a2f36;
    box-shadow: 0 4px 16px rgba(0,0,0,.22);
    opacity: 0;
    transform: translateY(6px);
    transition: opacity .16s ease, transform .16s ease;
    pointer-events: auto;
  }
  .oe-toast--in { opacity: 1; transform: translateY(0); }
  .oe-toast--success { background: var(--oe-toast-success, #157347); }
  .oe-toast--error   { background: var(--oe-toast-error, #b02a37); }
  .oe-toast--info    { background: var(--oe-toast-info, #2a2f36); }
  .oe-toast--progress { background: var(--oe-toast-info, #2a2f36); }
  .oe-toast__icon { flex: 0 0 auto; width: 15px; height: 15px; }
  .oe-toast__spinner {
    flex: 0 0 auto; width: 14px; height: 14px;
    border: 2px solid rgba(255,255,255,.35);
    border-top-color: #fff; border-radius: 50%;
    animation: oe-toast-spin .7s linear infinite;
  }
  @keyframes oe-toast-spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) {
    .oe-toast { transition: opacity .16s ease; transform: none; }
    .oe-toast--in { transform: none; }
    .oe-toast__spinner { animation: none; }
  }
  .oe-toast__msg { flex: 1 1 auto; min-width: 0; }
  .oe-toast__close {
    flex: 0 0 auto; margin-left: 2px; padding: 0 2px;
    background: none; border: 0; color: inherit; opacity: .8;
    cursor: pointer; font-size: 15px; line-height: 1;
  }
  .oe-toast__close:hover { opacity: 1; }
`;

const ICONS = {
  success: '<svg class="oe-toast__icon" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M6.2 11.3 3 8.1l1.1-1.1 2.1 2.1 5.6-5.6L13 4.6z"/></svg>',
  error: '<svg class="oe-toast__icon" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1Zm.9 10.5H7.1V10h1.8v1.5Zm0-3H7.1V4h1.8v4.5Z"/></svg>',
  info: '<svg class="oe-toast__icon" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1Zm.9 10.5H7.1V7h1.8v4.5Zm0-6H7.1V4h1.8v1.5Z"/></svg>',
};

export class ToastManager {
  /** @param {HTMLElement} wrapper positioned editor wrapper. @param {Document} doc host document. */
  constructor(wrapper, doc) {
    this._wrapper = wrapper || null;
    this._doc = doc || (wrapper && wrapper.ownerDocument) || (typeof document !== 'undefined' ? document : null);
    this._region = null;
    if (this._doc) injectStyleOnce(this._doc, STYLE_ID, TOAST_CSS);
  }

  /** Lazily create the aria-live region container inside the wrapper. */
  _ensureRegion() {
    if (this._region && this._region.parentNode) return this._region;
    if (!this._wrapper || !this._doc) return null;
    const region = this._doc.createElement('div');
    region.className = 'oe-toast-region';
    this._wrapper.appendChild(region);
    this._region = region;
    return region;
  }

  /**
   * Low-level: show a toast. Returns a handle { update, close } even when there
   * is no DOM, so callers can always chain safely.
   * @param {string} message
   * @param {{variant?: 'success'|'error'|'info'|'progress', duration?: number, dismissible?: boolean}} [opts]
   */
  show(message, opts = {}) {
    const variant = opts.variant || 'info';
    const region = this._ensureRegion();
    if (!region) return this._noopHandle();

    const doc = this._doc;
    const el = doc.createElement('div');
    el.className = `oe-toast oe-toast--${variant}`;
    // Errors interrupt (assertive); progress + status are polite.
    el.setAttribute('role', variant === 'error' ? 'alert' : 'status');
    el.setAttribute('aria-live', variant === 'error' ? 'assertive' : 'polite');

    const lead = variant === 'progress'
      ? '<span class="oe-toast__spinner" aria-hidden="true"></span>'
      : (ICONS[variant] || '');
    const msgEl = doc.createElement('span');
    msgEl.className = 'oe-toast__msg';
    msgEl.textContent = message == null ? '' : String(message);

    if (lead) el.insertAdjacentHTML('afterbegin', lead);
    el.appendChild(msgEl);

    // Progress toasts and explicit dismissible toasts get a close button.
    const dismissible = opts.dismissible !== false && variant !== 'success' ? true : opts.dismissible === true;
    let closeBtn = null;
    if (dismissible || variant === 'progress') {
      closeBtn = doc.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'oe-toast__close';
      closeBtn.setAttribute('aria-label', 'Dismiss');
      closeBtn.textContent = '×';
      el.appendChild(closeBtn);
    }

    region.appendChild(el);
    const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (fn) => setTimeout(fn, 0);
    raf(() => el.classList.add('oe-toast--in'));

    let timer = null;
    const close = () => {
      if (timer) { clearTimeout(timer); timer = null; }
      el.classList.remove('oe-toast--in');
      setTimeout(() => {
        if (el.parentNode) el.parentNode.removeChild(el);
        if (this._region && !this._region.childNodes.length && this._region.parentNode) {
          this._region.parentNode.removeChild(this._region);
          this._region = null;
        }
      }, 200);
    };
    if (closeBtn) closeBtn.addEventListener('click', close);

    // Auto-dismiss unless it's a sticky progress toast.
    const duration = opts.duration != null ? opts.duration : DEFAULT_MS;
    if (variant !== 'progress' && duration > 0) timer = setTimeout(close, duration);

    /** Turn a progress toast into a terminal success/error, or change its text. */
    const update = (nextMessage, nextOpts = {}) => {
      const nextVariant = nextOpts.variant || 'info';
      msgEl.textContent = nextMessage == null ? '' : String(nextMessage);
      el.className = `oe-toast oe-toast--${nextVariant} oe-toast--in`;
      el.setAttribute('role', nextVariant === 'error' ? 'alert' : 'status');
      el.setAttribute('aria-live', nextVariant === 'error' ? 'assertive' : 'polite');
      // Swap the leading spinner/icon.
      const oldLead = el.querySelector('.oe-toast__spinner, .oe-toast__icon');
      if (oldLead) oldLead.remove();
      const newLead = ICONS[nextVariant] || '';
      if (newLead) el.insertAdjacentHTML('afterbegin', newLead);
      if (timer) { clearTimeout(timer); timer = null; }
      const ms = nextOpts.duration != null ? nextOpts.duration : DEFAULT_MS;
      if (ms > 0) timer = setTimeout(close, ms);
    };

    return { el, close, update };
  }

  success(message, opts) { return this.show(message, { ...opts, variant: 'success' }); }
  error(message, opts)   { return this.show(message, { ...opts, variant: 'error', duration: (opts && opts.duration) != null ? opts.duration : 6000 }); }
  info(message, opts)    { return this.show(message, { ...opts, variant: 'info' }); }

  /**
   * A sticky progress toast (spinner, no auto-dismiss) for long operations.
   * Returns a handle whose success()/error() resolve it into a terminal toast,
   * and close() removes it.
   */
  progress(message, opts) {
    const handle = this.show(message, { ...opts, variant: 'progress' });
    return {
      el: handle.el,
      success: (msg, o) => handle.update(msg, { ...o, variant: 'success', duration: (o && o.duration) != null ? o.duration : DEFAULT_MS }),
      error: (msg, o) => handle.update(msg, { ...o, variant: 'error', duration: (o && o.duration) != null ? o.duration : 6000 }),
      update: (msg, o) => handle.update(msg, { ...o, variant: 'progress', duration: 0 }),
      close: handle.close,
    };
  }

  _noopHandle() {
    const noop = () => {};
    return { el: null, close: noop, update: noop, success: noop, error: noop };
  }

  destroy() {
    if (this._region && this._region.parentNode) this._region.parentNode.removeChild(this._region);
    this._region = null;
  }
}
