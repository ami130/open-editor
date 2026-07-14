/**
 * media-resize.js — 8-handle resize overlay for a selected video embed.
 * Adapted from image-resize.js: identical drag math (ImageResizeManager's
 * static computeResize, reused directly) and the same shared overlay markup
 * (image-resize-overlay.js's buildResizeOverlay/pointFromEvent — generic,
 * not img-specific). The one real difference: an <img> resizes itself
 * directly, but .oe-embed's aspect ratio comes from CSS `aspect-ratio: 16/9`
 * (media-styles.js) — not the legacy padding-bottom-percent trick, which
 * resolves its percentage against the PARENT's width and so never responds
 * to the figure's own width changing. Resizing sets the figure's width (the
 * aspect-ratio box follows automatically) and, for vertical-only edge drags,
 * overrides aspect-ratio with an explicit pixel height instead.
 */
import { buildResizeOverlay, pointFromEvent, HANDLES } from '../image/image-resize-overlay.js';
import { ImageResizeManager } from '../image/image-resize.js';

// Deliberately larger than image's MIN_WIDTH=40/MIN_HEIGHT=20: a video's
// embedded UI chrome (YouTube/Vimeo controls, title bar) becomes unusable
// well before an image would at the same size, so the floor is set at a size
// where the provider's own controls stay legible and clickable.
const MIN_WIDTH = 160;
const MIN_HEIGHT = 90;

export class MediaResizeManager {
  constructor() {
    this._editor             = null;
    this._overlay            = null;
    this._badge              = null;
    this._lockPill           = null;
    this._svgRect             = null;
    this._figure              = null;
    this._drag                = null;
    this._onRepos             = null;
    this._onMouseMove         = null;
    this._onMouseUp           = null;
    this._onMediaSel          = null;
    this._onMediaDesel        = null;
    this._editorScrollTarget  = null;
  }

  install(editor) {
    this._editor = editor;

    this._onMediaSel   = ({ figure }) => this._attachTo(figure);
    this._onMediaDesel = () => this._detach();
    editor.on('mediaSelected', this._onMediaSel);
    editor.on('mediaDeselected', this._onMediaDesel);

    this._onRepos = () => this._reposition();
    const doc = editor._wrapper && editor._wrapper.ownerDocument;
    if (doc && doc.defaultView) {
      doc.defaultView.addEventListener('scroll', this._onRepos, { passive: true });
      doc.defaultView.addEventListener('resize', this._onRepos, { passive: true });
    }
    const edEl = editor.getEditorElement && editor.getEditorElement();
    if (edEl) {
      edEl.addEventListener('scroll', this._onRepos, { passive: true });
      this._editorScrollTarget = edEl;
    }
  }

  destroy() {
    this._detach();
    const ed = this._editor;
    if (ed) {
      ed.off('mediaSelected', this._onMediaSel);
      ed.off('mediaDeselected', this._onMediaDesel);
    }
    const doc = ed && ed._wrapper && ed._wrapper.ownerDocument;
    if (doc && doc.defaultView) {
      doc.defaultView.removeEventListener('scroll', this._onRepos);
      doc.defaultView.removeEventListener('resize', this._onRepos);
    }
    if (this._editorScrollTarget) {
      this._editorScrollTarget.removeEventListener('scroll', this._onRepos);
      this._editorScrollTarget = null;
    }
    this._editor = null;
  }

  _attachTo(figure) {
    this._detach();
    this._figure = figure;
    const ed = this._editor;
    if (!ed || !ed._wrapper) return;
    const doc = ed._wrapper.ownerDocument;

    const { overlay, rect, badge, lock } =
      buildResizeOverlay(doc, (e, pos) => this._onHandleMouseDown(e, pos));
    this._svgRect  = rect;
    this._badge    = badge;
    this._lockPill = lock;

    ed._wrapper.appendChild(overlay);
    this._overlay = overlay;
    this._reposition();
    this._showBadgeDimensions();
  }

  _detach() {
    this._cancelDrag();
    if (this._overlay && this._overlay.parentNode) this._overlay.parentNode.removeChild(this._overlay);
    this._overlay  = null;
    this._figure   = null;
    this._badge    = null;
    this._lockPill = null;
    this._svgRect  = null;
  }

  /** Mirrors image-resize-overlay.js's showBadgeDimensions fallback chain
   *  (rect → offsetWidth/Height → inline style) rather than trusting
   *  getBoundingClientRect() alone, which can read 0 in edge cases (e.g. a
   *  figure not yet laid out, or hidden by an ancestor mid-transition). */
  _showBadgeDimensions() {
    if (!this._badge || !this._figure) return;
    const fig = this._figure;
    const r = fig.getBoundingClientRect();
    const w = Math.round(r.width  || fig.offsetWidth  || parseInt(fig.style.width)  || 0);
    const h = Math.round(r.height || fig.offsetHeight || parseInt(fig.style.height) || 0);
    if (!w || !h) return;
    this._badge.textContent = `${w} × ${h}`;
    this._badge.classList.add('oe-resize-badge--visible');
  }

  _reposition() {
    if (!this._overlay || !this._figure || !this._editor || !this._editor._wrapper) return;
    const fig = this._figure;
    const wrapper = this._editor._wrapper;
    try {
      const fRect = fig.getBoundingClientRect();
      const wRect = wrapper.getBoundingClientRect();
      const top  = fRect.top  - wRect.top  + wrapper.scrollTop;
      const left = fRect.left - wRect.left + wrapper.scrollLeft;
      this._overlay.style.top    = `${top}px`;
      this._overlay.style.left   = `${left}px`;
      this._overlay.style.width  = `${fRect.width}px`;
      this._overlay.style.height = `${fRect.height}px`;
      if (this._svgRect) {
        this._svgRect.setAttribute('width',  Math.max(0, fRect.width  - 2));
        this._svgRect.setAttribute('height', Math.max(0, fRect.height - 2));
      }
    } catch { /* safe in jsdom */ }
  }

  _onHandleMouseDown(e, pos) {
    e.preventDefault();
    e.stopPropagation();
    if (this._drag) return;
    if (this._editor) this._editor.history && this._editor.history.takeSnapshot();

    const fig = this._figure;
    if (!fig) return;
    const doc = fig.ownerDocument;
    const fRect = fig.getBoundingClientRect();
    const w = fRect.width  || fig.offsetWidth  || 480;
    const h = fRect.height || fig.offsetHeight || 270;
    const pt = pointFromEvent(e);

    this._drag = { pos, startX: pt.x, startY: pt.y, startW: w, startH: h, aspect: w / (h || 1) };

    const html = doc.documentElement;
    html.classList.add(`oe-resizing-${pos}`);
    this._dragHtml = html;

    this._onMouseMove = (mv) => this._handleDragMove(mv);
    this._onMouseUp   = (mu) => this._handleDragEnd(mu);
    doc.addEventListener('mousemove', this._onMouseMove);
    doc.addEventListener('mouseup',   this._onMouseUp);
    doc.addEventListener('touchmove', this._onMouseMove, { passive: false });
    doc.addEventListener('touchend',  this._onMouseUp);
    doc.addEventListener('touchcancel', this._onMouseUp);
  }

  /** Apply a computed size to the figure: width always; height only overrides
   *  the default aspect-ratio for vertical-only (n/s) edge drags (otherwise
   *  the figure's own aspect-ratio CSS keeps height in sync with width). */
  _applySize(width, height, pos) {
    const fig = this._figure;
    fig.style.width = `${width}px`;
    if (pos === 'n' || pos === 's') {
      fig.style.aspectRatio = 'auto';
      fig.style.height = `${height}px`;
    } else {
      fig.style.aspectRatio = '';
      fig.style.height = '';
    }
  }

  _handleDragMove(e) {
    if (!this._drag || !this._figure) return;
    if (e.cancelable && e.touches) e.preventDefault();
    const pt = pointFromEvent(e);
    const { width, height, locked } = ImageResizeManager.computeResize(
      this._drag, pt.x, pt.y, e.shiftKey
    );
    const clampedW = Math.max(MIN_WIDTH, width);
    const clampedH = Math.max(MIN_HEIGHT, height);
    this._applySize(clampedW, clampedH, this._drag.pos);
    this._reposition();

    if (this._badge) {
      this._badge.textContent = `${clampedW} × ${clampedH}`;
      this._badge.classList.add('oe-resize-badge--visible');
    }
    if (this._lockPill) {
      this._lockPill.classList.toggle('oe-resize-lock--visible', locked);
      this._lockPill.textContent = locked ? '⇔ ratio locked' : '';
    }
  }

  _handleDragEnd(e) {
    if (!this._drag || !this._figure) { this._cancelDrag(); return; }
    const pt = pointFromEvent(e);
    const { width, height } = ImageResizeManager.computeResize(
      this._drag, pt.x, pt.y, e.shiftKey
    );
    this._applySize(Math.max(MIN_WIDTH, width), Math.max(MIN_HEIGHT, height), this._drag.pos);

    this._cancelDrag();
    this._reposition();
    if (this._lockPill) this._lockPill.classList.remove('oe-resize-lock--visible');

    if (this._editor) this._editor.emit('afterCommand', { command: 'resizeMedia', args: [] });
  }

  _cancelDrag() {
    if (this._drag && this._figure) {
      const doc = this._figure.ownerDocument;
      if (doc && this._onMouseMove) {
        doc.removeEventListener('mousemove', this._onMouseMove);
        doc.removeEventListener('touchmove', this._onMouseMove);
      }
      if (doc && this._onMouseUp) {
        doc.removeEventListener('mouseup',     this._onMouseUp);
        doc.removeEventListener('touchend',    this._onMouseUp);
        doc.removeEventListener('touchcancel', this._onMouseUp);
      }
    }
    if (this._dragHtml) {
      for (const pos of HANDLES) this._dragHtml.classList.remove(`oe-resizing-${pos}`);
      this._dragHtml = null;
    }
    this._drag = null;
    this._onMouseMove = null;
    this._onMouseUp = null;
  }
}
