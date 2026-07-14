import { trapFocus } from './focus-trap.js';
import { injectStyleOnce } from '../utils/inject-style.js';
import { MODAL_CSS, A11Y_HELP_CSS } from './ui-styles.js';

const STYLE_ID = 'oe-modal-styles';
let _modalIdCounter = 0;

function injectStyles(doc) {
  injectStyleOnce(doc, STYLE_ID, MODAL_CSS + A11Y_HELP_CSS);
}

/**
 * ModalManager — 6.1 to 6.4, 6.8, 6.9
 *
 * Usage:
 *   const result = await editor.ui.modal.open({
 *     title: 'Confirm',
 *     body: 'Are you sure?',
 *     buttons: [
 *       { label: 'Cancel', value: null },
 *       { label: 'OK', value: 'ok', variant: 'primary' },
 *     ],
 *   });
 */
export class ModalManager {
  constructor(wrapper, doc) {
    this._wrapper = wrapper;
    this._doc     = doc || (typeof document !== 'undefined' ? document : null);
    this._stack   = [];  // [{ backdropEl, modalEl, resolve, cleanupFocusTrap }]
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Open a modal. Returns a Promise that resolves with the button value
   * (or null for Escape / backdrop close).
   *
   * config: {
   *   title?: string,
   *   body?: string | HTMLElement,
   *   buttons?: Array<{ label, value, variant? }>,
   *   closeOnBackdrop?: boolean,   // default true
   *   closeOnEscape?: boolean,     // default true
   * }
   */
  open(config = {}) {
    const doc = this._doc;
    if (!doc || !this._wrapper) return Promise.resolve(null);
    injectStyles(doc);

    return new Promise((resolve) => {
      const closeOnBackdrop = config.closeOnBackdrop !== false;
      const closeOnEscape   = config.closeOnEscape   !== false;

      // ── Backdrop ────────────────────────────────────────────────────────────
      const backdrop = doc.createElement('div');
      backdrop.className = 'oe-backdrop';

      if (closeOnBackdrop) {
        backdrop.addEventListener('click', (e) => {
          if (e.target === backdrop) this._resolveTop(null);
        });
      }

      // ── Dialog ──────────────────────────────────────────────────────────────
      const dialog = doc.createElement('div');
      dialog.className = 'oe-modal';
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true');
      dialog.setAttribute('tabindex', '-1');

      // Title
      if (config.title) {
        const titleId = `oe-modal-title-${++_modalIdCounter}`;
        const header  = doc.createElement('div');
        header.className = 'oe-modal__header';
        header.id = titleId;
        header.textContent = config.title;
        dialog.setAttribute('aria-labelledby', titleId);
        dialog.appendChild(header);
      }

      // Body
      const body = doc.createElement('div');
      body.className = 'oe-modal__body';
      // 17.5.5 — the body can scroll (long content, e.g. the Alt+0 shortcut
      // table); a scrollable region must be keyboard-reachable to be
      // keyboard-scrollable (axe: scrollable-region-focusable, serious).
      body.setAttribute('tabindex', '0');
      if (config.body instanceof Node) {
        body.appendChild(config.body);
      } else if (typeof config.body === 'string') {
        // SECURITY: a string body is injected as raw HTML (trusted-input
        // contract). For untrusted content, callers should sanitize first or
        // pass a Node. Documented here so the sink is explicit.
        body.innerHTML = config.body;
      }
      dialog.appendChild(body);

      // Footer buttons
      if (Array.isArray(config.buttons) && config.buttons.length > 0) {
        const footer = doc.createElement('div');
        footer.className = 'oe-modal__footer';
        for (const btn of config.buttons) {
          const el = doc.createElement('button');
          el.type = 'button';
          el.className = 'oe-modal__btn';
          if (btn.variant) el.classList.add(`oe-modal__btn--${btn.variant}`);
          el.textContent = btn.label || '';
          el.addEventListener('click', () => this._resolveTop(btn.value));
          footer.appendChild(el);
        }
        dialog.appendChild(footer);
      }

      // LOW a11y fix: aria-modal isn't reliably honored by older screen readers
      // in browse mode, so also hide the background siblings (toolbar, editor,
      // status bar) from the a11y tree while any modal is open. Done on the FIRST
      // open; restored when the LAST modal closes.
      if (this._stack.length === 0) this._setBackgroundHidden(true, backdrop);

      // Escape key handler. (The dialog's role="dialog" + aria-modal="true"
      // provide AT scoping; the backdrop itself isn't aria-hidden because it
      // contains the dialog — we hide its SIBLINGS instead, see above.)
      if (closeOnEscape) {
        dialog.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') { e.stopPropagation(); this._resolveTop(null); }
        });
      }

      // Capture the element that had focus when the modal opened, so focus can
      // be returned to it when the last modal closes (WCAG 2.4.3).
      const trigger = doc.activeElement;

      backdrop.appendChild(dialog);
      this._wrapper.appendChild(backdrop);

      const cleanupFocusTrap = trapFocus(dialog);

      this._stack.push({ backdropEl: backdrop, modalEl: dialog, resolve, cleanupFocusTrap, trigger });
    });
  }

  /** Close the topmost modal, resolving its Promise with value. */
  close(value = null) {
    this._resolveTop(value);
  }

  /** Close all open modals, resolving each with null. */
  closeAll() {
    while (this._stack.length > 0) this._resolveTop(null);
  }

  destroy() {
    this.closeAll();
    this._wrapper = null;
    this._doc     = null;
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  _resolveTop(value) {
    const entry = this._stack.pop();
    if (!entry) return;
    entry.cleanupFocusTrap();
    if (entry.backdropEl.parentNode) entry.backdropEl.parentNode.removeChild(entry.backdropEl);
    // Restore focus: to the modal below if one remains, otherwise to the
    // element that triggered this (the last) modal.
    if (this._stack.length > 0) {
      this._stack[this._stack.length - 1].modalEl.focus();
    } else {
      // Last modal closed — restore the background to the a11y tree.
      this._setBackgroundHidden(false, null);
      if (entry.trigger && typeof entry.trigger.focus === 'function') entry.trigger.focus();
    }
    entry.resolve(value);
  }

  // Toggle aria-hidden on every wrapper child except `keep` (the backdrop). We
  // remember which nodes WE hid so we don't clobber a pre-existing aria-hidden.
  _setBackgroundHidden(hidden, keep) {
    if (!this._wrapper) return;
    if (hidden) {
      this._hiddenBg = [];
      for (const child of Array.from(this._wrapper.children)) {
        if (child === keep) continue;
        if (child.getAttribute('aria-hidden') === 'true') continue; // already hidden
        child.setAttribute('aria-hidden', 'true');
        this._hiddenBg.push(child);
      }
    } else if (this._hiddenBg) {
      for (const child of this._hiddenBg) child.removeAttribute('aria-hidden');
      this._hiddenBg = null;
    }
  }
}
