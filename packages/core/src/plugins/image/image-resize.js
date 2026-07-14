/**
 * image-resize.js — Resize handles overlay for selected images (9.8).
 *
 * 8-handle system: 4 corners + 4 edge midpoints.
 * Features: animated marching-ants border, dimension badge, aspect-lock pill,
 * global cursor override during drag, min-size clamp, Shift-locks aspect ratio.
 */

import { buildResizeOverlay, pointFromEvent, showBadgeDimensions, HANDLES } from './image-resize-overlay.js';

const MIN_WIDTH  = 40;
const MIN_HEIGHT = 20;

export class ImageResizeManager {
  constructor() {
    this._editor             = null;
    this._overlay            = null;
    this._badge              = null;
    this._lockPill           = null;
    this._svgEl              = null;
    this._svgRect            = null;
    this._figure             = null;
    this._drag               = null;
    this._onRepos            = null;
    this._onMouseMove        = null;
    this._onMouseUp          = null;
    this._onImgSel           = null;
    this._onImgDesel         = null;
    this._editorScrollTarget = null;
  }

  // ─── Install / Destroy ───────────────────────────────────────────────────────

  install(editor) {
    this._editor = editor;

    this._onImgSel   = ({ figure }) => this._attachTo(figure);
    this._onImgDesel = ()           => this._detach();
    editor.on('imageSelected',   this._onImgSel);
    editor.on('imageDeselected', this._onImgDesel);

    this._onRepos = () => this._reposition();
    const doc = editor._wrapper && editor._wrapper.ownerDocument;
    if (doc && doc.defaultView) {
      doc.defaultView.addEventListener('scroll', this._onRepos, { passive: true });
      doc.defaultView.addEventListener('resize', this._onRepos, { passive: true });
    }
    // Also listen for scroll on the editor element itself (it has overflow-y:auto)
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
      ed.off('imageSelected',   this._onImgSel);
      ed.off('imageDeselected', this._onImgDesel);
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

  // ─── Attach / Detach ─────────────────────────────────────────────────────────

  _attachTo(figure) {
    this._detach();
    this._figure = figure;
    const ed  = this._editor;
    if (!ed || !ed._wrapper) return;
    const doc = ed._wrapper.ownerDocument;

    const { overlay, svg, rect, badge, lock } =
      buildResizeOverlay(doc, (e, pos) => this._onHandleMouseDown(e, pos));
    this._svgEl    = svg;
    this._svgRect  = rect;
    this._badge    = badge;
    this._lockPill = lock;

    ed._wrapper.appendChild(overlay);
    this._overlay = overlay;
    this._reposition();
    // Show the current size on select, so dimensions are visible without a drag.
    showBadgeDimensions(this._badge, this._figure && this._figure.querySelector('img'));
  }

  _detach() {
    this._cancelDrag();
    if (this._overlay && this._overlay.parentNode) {
      this._overlay.parentNode.removeChild(this._overlay);
    }
    this._overlay  = null;
    this._figure   = null;
    this._badge    = null;
    this._lockPill = null;
    this._svgEl    = null;
    this._svgRect  = null;
  }

  // ─── Reposition overlay ───────────────────────────────────────────────────────

  _reposition() {
    if (!this._overlay || !this._figure || !this._editor || !this._editor._wrapper) return;
    const fig     = this._figure;
    const wrapper = this._editor._wrapper;

    try {
      const fRect = fig.getBoundingClientRect();
      const wRect = wrapper.getBoundingClientRect();
      const top    = fRect.top  - wRect.top  + wrapper.scrollTop;
      const left   = fRect.left - wRect.left + wrapper.scrollLeft;

      this._overlay.style.top    = `${top}px`;
      this._overlay.style.left   = `${left}px`;
      this._overlay.style.width  = `${fRect.width}px`;
      this._overlay.style.height = `${fRect.height}px`;

      // Keep SVG rect in sync (percent width/height on foreignObject doesn't always work)
      if (this._svgRect) {
        this._svgRect.setAttribute('width',  Math.max(0, fRect.width  - 2));
        this._svgRect.setAttribute('height', Math.max(0, fRect.height - 2));
      }
    } catch { /* safe in jsdom */ }
  }

  // ─── Drag logic ───────────────────────────────────────────────────────────────

  _onHandleMouseDown(e, pos) {
    e.preventDefault();
    e.stopPropagation();

    // Guard against re-entry: ignore a second pointerdown while a drag is live
    // (rapid multi-handle grabs would otherwise stack redundant snapshots).
    if (this._drag) return;

    // Snapshot BEFORE resize so undo returns to pre-resize dimensions
    if (this._editor) this._editor.history && this._editor.history.takeSnapshot();

    const img = this._figure && this._figure.querySelector('img');
    if (!img) return;

    const doc   = this._figure.ownerDocument;
    const iRect = img.getBoundingClientRect();
    const w     = iRect.width  || img.offsetWidth  || parseInt(img.style.width)  || 200;
    const h     = iRect.height || img.offsetHeight || parseInt(img.style.height) || 150;
    const pt    = pointFromEvent(e);

    this._drag = {
      pos,
      startX: pt.x,
      startY: pt.y,
      startW: w,
      startH: h,
      aspect: w / (h || 1),
    };

    // Lock global cursor
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

  static computeResize(drag, clientX, clientY, shiftKey) {
    const pos = drag.pos || drag.corner; // support legacy 'corner' key
    const { startX, startY, startW, startH, aspect } = drag;

    let dx = clientX - startX;
    let dy = clientY - startY;

    // Invert for handles that pull left or up
    const flipX = pos === 'nw' || pos === 'sw' || pos === 'w';
    const flipY = pos === 'nw' || pos === 'ne' || pos === 'n';
    if (flipX) dx = -dx;
    if (flipY) dy = -dy;

    // Edge handles: constrain to one axis only
    const isHorizontalOnly = pos === 'e' || pos === 'w';
    const isVerticalOnly   = pos === 'n' || pos === 's';

    let newW = isVerticalOnly   ? startW : Math.max(MIN_WIDTH,  startW + dx);
    let newH = isHorizontalOnly ? startH : Math.max(MIN_HEIGHT, startH + dy);

    if (shiftKey && aspect && !isHorizontalOnly && !isVerticalOnly) {
      const dxAbs = Math.abs(clientX - startX);
      const dyAbs = Math.abs(clientY - startY);
      if (dxAbs >= dyAbs) {
        newH = Math.max(MIN_HEIGHT, newW / aspect);
      } else {
        newW = Math.max(MIN_WIDTH, newH * aspect);
      }
    }

    return {
      width:  Math.round(newW),
      height: Math.round(newH),
      locked: shiftKey && !isHorizontalOnly && !isVerticalOnly,
    };
  }

  _handleDragMove(e) {
    if (!this._drag || !this._figure) return;
    const img = this._figure.querySelector('img');
    if (!img) return;

    // Stop the page scrolling under a touch-drag.
    if (e.cancelable && e.touches) e.preventDefault();
    const pt = pointFromEvent(e);

    const { width, height, locked } = ImageResizeManager.computeResize(
      this._drag, pt.x, pt.y, e.shiftKey
    );

    img.style.width  = `${width}px`;
    img.style.height = `${height}px`;
    this._reposition();

    // Update badge
    if (this._badge) {
      this._badge.textContent = `${width} × ${height}`;
      this._badge.classList.add('oe-resize-badge--visible');
    }

    // Aspect-lock pill
    if (this._lockPill) {
      this._lockPill.classList.toggle('oe-resize-lock--visible', locked);
      this._lockPill.textContent = locked ? '⇔ ratio locked' : '';
    }
  }

  _handleDragEnd(e) {
    if (!this._drag || !this._figure) { this._cancelDrag(); return; }
    const img = this._figure.querySelector('img');

    if (img) {
      const pt = pointFromEvent(e);
      const { width, height } = ImageResizeManager.computeResize(
        this._drag, pt.x, pt.y, e.shiftKey
      );
      img.style.width  = `${width}px`;
      img.style.height = `${height}px`;
      img.setAttribute('width',  width);
      img.setAttribute('height', height);
    }

    this._cancelDrag();
    this._reposition();

    // Keep the badge showing the final dimensions while the image stays
    // selected; only the transient aspect-lock pill is hidden on release.
    if (this._lockPill) this._lockPill.classList.remove('oe-resize-lock--visible');

    if (this._editor) {
      this._editor.emit('afterCommand', { command: 'resizeImage', args: [] });
    }
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
    this._drag        = null;
    this._onMouseMove = null;
    this._onMouseUp   = null;
  }
}
