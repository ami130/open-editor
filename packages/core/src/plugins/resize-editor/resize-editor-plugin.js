/**
 * resize-editor-plugin.js — Phase 13.8: resize the whole editor by dragging a
 * handle on the bottom edge (Jodit's resize-handler equivalent).
 *
 * A grip is appended to the editor wrapper; dragging it vertically changes the
 * wrapper's height, clamped to [minHeight, maxHeight] from config (a sensible
 * floor/ceiling applies when those are unset). Pointer handling covers mouse
 * AND touch; listeners are torn down in destroy(). The pure clamp math
 * (clampHeight) is separated so it is unit-testable without any DOM drag.
 *
 * Disabled in fullscreen (height is viewport-driven there) and honors readonly.
 *
 * Implements { name, install, destroy }.  (No toolbar button — it's a grip.)
 */
import { injectResizeStyles } from './resize-editor-styles.js';

const MIN_FLOOR = 80;     // never let the editor collapse below this (px)
const MAX_CEILING = 5000; // absolute safety ceiling (px)

/**
 * Clamp a proposed new height into the allowed range.
 * @param {number} current  current height in px
 * @param {number} delta    drag delta in px (positive = taller)
 * @param {{min?:number|null, max?:number|null}} bounds
 * @returns {number} the clamped height
 */
export function clampHeight(current, delta, bounds = {}) {
  const min = Math.max(MIN_FLOOR, bounds.min != null ? bounds.min : MIN_FLOOR);
  const max = Math.min(MAX_CEILING, bounds.max != null ? bounds.max : MAX_CEILING);
  let next = current + delta;
  if (next < min) next = min;
  if (next > max) next = max;
  return Math.round(next);
}

export function createResizeEditorPlugin() {
  return {
    name: 'resizeEditor',
    _editor: null,
    _grip: null,
    _drag: null,
    _doc: null,
    _onDown: null, _onMove: null, _onUp: null,

    install(editor) {
      this._editor = editor;
      const wrapper = editor._wrapper;
      if (!wrapper) return;
      const doc = wrapper.ownerDocument;
      this._doc = doc;
      injectResizeStyles(doc);

      const grip = doc.createElement('div');
      grip.className = 'oe-resize-grip';
      grip.setAttribute('aria-hidden', 'true');
      this._grip = grip;

      this._onDown = (e) => this._start(e);
      grip.addEventListener('mousedown', this._onDown);
      grip.addEventListener('touchstart', this._onDown, { passive: false });
      wrapper.appendChild(grip);
    },

    destroy() {
      this._cancel();
      if (this._grip) {
        this._grip.removeEventListener('mousedown', this._onDown);
        this._grip.removeEventListener('touchstart', this._onDown);
        if (this._grip.parentNode) this._grip.parentNode.removeChild(this._grip);
      }
      this._editor = this._grip = this._doc = null;
      this._onDown = this._onMove = this._onUp = null;
    },

    _point(e) {
      if (e.touches && e.touches.length) return e.touches[0].clientY;
      return e.clientY;
    },

    _start(e) {
      const editor = this._editor;
      if (!editor) return;
      // Skip in readonly or fullscreen — height isn't user-controlled there.
      if (editor._state && editor._state.isReadOnly) return;
      if (editor._wrapper && editor._wrapper.classList.contains('oe-wrapper--fullscreen')) return;
      // A second mousedown/touchstart before the matching up would orphan the
      // prior move/up listeners (audit MEDIUM). Cancel any in-flight drag first
      // so arming is idempotent and never leaks a document-level listener.
      this._cancel();
      e.preventDefault();
      const startY = this._point(e);
      const startH = editor._wrapper.getBoundingClientRect().height;
      this._drag = { startY, startH };

      this._onMove = (mv) => this._move(mv);
      this._onUp = () => this._end();
      const doc = this._doc;
      doc.addEventListener('mousemove', this._onMove);
      doc.addEventListener('mouseup', this._onUp);
      doc.addEventListener('touchmove', this._onMove, { passive: false });
      doc.addEventListener('touchend', this._onUp);
    },

    _move(e) {
      if (!this._drag || !this._editor) return;
      if (e.cancelable && e.touches) e.preventDefault();
      const cfg = this._editor._config || {};
      const delta = this._point(e) - this._drag.startY;
      const h = clampHeight(this._drag.startH, delta, { min: cfg.minHeight, max: cfg.maxHeight });
      this._editor._wrapper.style.height = `${h}px`;
    },

    _end() {
      if (this._drag && this._editor) {
        this._editor.emit('resizeEditor', { height: this._editor._wrapper.offsetHeight });
      }
      this._cancel();
    },

    _cancel() {
      const doc = this._doc;
      if (doc && this._onMove) {
        doc.removeEventListener('mousemove', this._onMove);
        doc.removeEventListener('touchmove', this._onMove);
      }
      if (doc && this._onUp) {
        doc.removeEventListener('mouseup', this._onUp);
        doc.removeEventListener('touchend', this._onUp);
      }
      this._drag = null;
    },
  };
}

export const resizeEditorPlugin = createResizeEditorPlugin();
