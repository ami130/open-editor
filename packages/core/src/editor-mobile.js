/**
 * editor-mobile.js — Phase 14 mobile / touch behaviours, split out of
 * editor-events.js to keep both files ≤300 lines.
 *
 *   14.7  — scroll the editable into view when it gains focus (virtual keyboard)
 *   14.8  — long-press (500ms) opens the context menu on touch devices
 *   14.14 — read content on touchend too (iOS fires `input` late after a tap)
 *   14.17 — after an internal text drag-drop, fire onChange (browsers often skip
 *           the `input` event on a drop, leaving isDirty/onChange stale)
 *
 * Applied to OpenEditor.prototype alongside the other mixins. Wired by
 * _attachMobileEvents(), called from _attachEvents().
 */

const LONG_PRESS_MS = 500;
const LONG_PRESS_MOVE_TOLERANCE = 10; // px — a drag past this cancels the press

export const editorMobileMixin = {

  _attachMobileEvents() {
    const el = this._editorEl;
    if (!el) return;

    const bind = (target, type, fn, opts) => {
      target.addEventListener(type, fn, opts);
      this._boundHandlers[type] = this._boundHandlers[type] || [];
      this._boundHandlers[type].push({ target, fn, opts });
    };

    // 14.7 — bring the editable into view when focused (keyboard-open reflow).
    bind(el, 'focus', () => this._scrollEditorIntoView());

    // 14.14 — iOS can deliver `input` late after touchend; schedule a change read.
    bind(el, 'touchend', () => { if (!this._isComposing) this._scheduleChange(); });

    // 14.17 — internal text drag-drop: let the browser perform the move (no
    // preventDefault), then fire onChange on the next tick since the `input`
    // event is unreliable on drop. Image-FILE drops are handled by the image
    // plugin's own `drop` bridge; we only need the change notification here.
    bind(el, 'drop', () => {
      const tid = setTimeout(() => {
        this._timers && this._timers.delete(tid);
        if (!this._destroyed) this._scheduleChange();
      }, 0);
      this._timers && this._timers.add(tid);
    });

    // 14.8 — long-press → context menu on touch devices.
    this._lpTimer = null;
    this._lpStart = null;
    bind(el, 'touchstart', (e) => this._onLongPressStart(e), { passive: true });
    bind(el, 'touchmove',  (e) => this._onLongPressMove(e),  { passive: true });
    bind(el, 'touchend',   () => this._clearLongPress());
    bind(el, 'touchcancel',() => this._clearLongPress());
  },

  _scrollEditorIntoView() {
    if (this._destroyed || !this._editorEl) return;
    try {
      if (typeof this._editorEl.scrollIntoView === 'function') {
        this._editorEl.scrollIntoView({ block: 'nearest', behavior: 'auto' });
      }
    } catch { /* non-fatal in headless / unsupported engines */ }
  },

  // Coalesce a change read through the editor's normal onChange path — but only
  // when the content actually differs from the last committed state. F11 fix: a
  // touchend from a plain caret tap, or a cancelled/no-op drop, must NOT mark a
  // pristine document dirty. (Gated here, in the mobile path only, so the core
  // input→onChange contract in editor-lifecycle is unchanged.)
  _scheduleChange() {
    if (typeof this._onChangeFn !== 'function') return;
    try {
      if (this.getHTML() === (this._state && this._state.html)) return;
    } catch { /* if we can't compare, fall through and schedule */ }
    this._onChangeFn();
  },

  _onLongPressStart(e) {
    this._clearLongPress();
    const t = (e.touches && e.touches[0]) || null;
    this._lpStart = t ? { x: t.clientX, y: t.clientY } : null;
    this._lpTimer = setTimeout(() => {
      this._lpTimer = null;
      if (this._destroyed) return;
      // F4 fix: dispatch a REAL `contextmenu` DOM event on the touched element.
      // A synthetic bus emit only reached listeners on editor.on('contextmenu')
      // (table) — the image plugin binds contextmenu on the DOM element directly
      // (contenteditable=false islands don't bubble), so it was missed. A native
      // event fires BOTH the element listener (image) and, by bubbling to the
      // editor root, editor-events' handler that re-emits on the bus (table).
      const pt = this._lpStart || { x: 0, y: 0 };
      const target = (e.target && e.target.nodeType === 1) ? e.target : this._editorEl;
      const win = (this._iframeDoc && this._iframeDoc.defaultView) ||
        (typeof window !== 'undefined' ? window : null);
      const MouseEvt = win && win.MouseEvent ? win.MouseEvent : null;
      if (MouseEvt) {
        target.dispatchEvent(new MouseEvt('contextmenu', {
          bubbles: true, cancelable: true, clientX: pt.x, clientY: pt.y,
        }));
      }
    }, LONG_PRESS_MS);
    this._timers && this._timers.add(this._lpTimer);
  },

  _onLongPressMove(e) {
    if (!this._lpTimer || !this._lpStart) return;
    const t = (e.touches && e.touches[0]) || null;
    if (!t) return;
    const dx = Math.abs(t.clientX - this._lpStart.x);
    const dy = Math.abs(t.clientY - this._lpStart.y);
    if (dx > LONG_PRESS_MOVE_TOLERANCE || dy > LONG_PRESS_MOVE_TOLERANCE) {
      this._clearLongPress();
    }
  },

  _clearLongPress() {
    if (this._lpTimer) {
      clearTimeout(this._lpTimer);
      this._timers && this._timers.delete(this._lpTimer);
      this._lpTimer = null;
    }
    this._lpStart = null;
  },

};
