/**
 * image-resize.js — Resize handles overlay for selected images (9.8).
 * 8 handles (4 corners + 4 edge midpoints). Marching-ants border, dimension
 * badge, aspect-lock pill, global drag cursor, min-size clamp, Shift-lock ratio.
 */

import { buildResizeOverlay, pointFromEvent, showBadgeDimensions, HANDLES } from './image-resize-overlay.js';
import { computeResize as computeResizeImpl } from './image-resize-compute.js';
import { repositionSettled, cancelSettle } from './image-settle-reposition.js';
import { anchorFlags, readMarginLeft, leftRoom, applyAnchorTransform, commitAnchor, targetOf, placeOverlay } from './image-resize-anchor.js';

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

    // STALE-FRAME FIX: align/properties move the figure via float (POSITION change
    // → ResizeObserver never fires). They emit afterCommand → refit + settle.
    this._onAfterCmd = () => { if (this._figure) this._repositionSettled(); };
    editor.on('afterCommand', this._onAfterCmd);
    this._onRepos = () => this._reposition();
    const doc = editor._wrapper && editor._wrapper.ownerDocument;
    if (doc && doc.defaultView) {
      doc.defaultView.addEventListener('scroll', this._onRepos, { passive: true });
      doc.defaultView.addEventListener('resize', this._onRepos, { passive: true });
    }
    // Editor element scrolls too (overflow-y:auto).
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
      ed.off('afterCommand',    this._onAfterCmd);
    }
    cancelSettle(this, this._editor);
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

    // IMG18: a lazy image grows after select / caption reflow — reposition on load.
    const img = this._figure.querySelector('img');
    if (img && !img.complete) {
      this._onImgLoad = () => { this._reposition(); showBadgeDimensions(this._badge, img); };
      img.addEventListener('load', this._onImgLoad, { once: true });
      this._loadImg = img;
    }
    const RO = (doc.defaultView && doc.defaultView.ResizeObserver) || (typeof ResizeObserver !== 'undefined' ? ResizeObserver : null);
    if (RO) {
      this._ro = new RO(() => this._reposition());
      // Observe the image box (frame target) AND figure (caption reflow shifts it).
      try { this._ro.observe(this._target() || this._figure); } catch { /* detached */ }
      try { this._ro.observe(this._figure); } catch { /* detached */ }
    }
  }

  _detach() {
    this._cancelDrag();
    if (this._ro) { try { this._ro.disconnect(); } catch { /* ignore */ } this._ro = null; }
    if (this._loadImg && this._onImgLoad) {
      this._loadImg.removeEventListener('load', this._onImgLoad);
      this._loadImg = null; this._onImgLoad = null;
    }
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

  // Reposition now + once after next-frame layout settle (see helper docstring).
  _repositionSettled() { repositionSettled(this, this._editor); }

  // Frame hugs the <img>/<picture>, not the figure+caption (see targetOf).
  _target() { return targetOf(this._figure); }

  _reposition() {
    if (!this._overlay || !this._figure || !this._editor || !this._editor._wrapper) return;
    placeOverlay(this._overlay, this._target(), this._editor._wrapper, this._svgRect);
  }

  // ─── Drag logic ───────────────────────────────────────────────────────────────

  _onHandleMouseDown(e, pos) {
    e.preventDefault();
    e.stopPropagation();

    // Re-entry guard: ignore a second pointerdown mid-drag (avoids stacked snapshots).
    if (this._drag) return;
    // Snapshot BEFORE resize so undo returns to pre-resize dimensions.
    if (this._editor) this._editor.history && this._editor.history.takeSnapshot();

    const img = this._figure && this._figure.querySelector('img');
    if (!img) return;

    const doc   = this._figure.ownerDocument;
    const iRect = img.getBoundingClientRect();
    const w     = iRect.width  || img.offsetWidth  || parseInt(img.style.width)  || 200;
    const h     = iRect.height || img.offsetHeight || parseInt(img.style.height) || 150;
    const pt    = pointFromEvent(e);

    // Aspect from INTRINSIC dims (else a Shift-stretch poisons later drags); fall
    // back to the box only while natural size is unknown (still loading).
    const natural = (img.naturalWidth && img.naturalHeight)
      ? img.naturalWidth / img.naturalHeight
      : w / (h || 1);

    // ANCHOR (#2): west/north handles pin the OPPOSITE edge (see image-resize-anchor).
    const { anchorX, anchorY } = anchorFlags(pos);
    this._drag = {
      pos,
      startX: pt.x,
      startY: pt.y,
      startW: w,
      startH: h,
      aspect: natural,
      anchorX, anchorY,
      startMarginLeft: readMarginLeft(img),
      // Room to grow LEFT before crossing the content edge; a west drag can't move
      // the left edge past this (avoids the misleading overshoot). See leftRoom.
      maxLeftGrow: leftRoom(this._editor && this._editor.getEditorElement
        && this._editor.getEditorElement(), this._figure, img),
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

  // Pure resize math lives in image-resize-compute.js. Static so media-resize.js's
  // ImageResizeManager.computeResize call site is unchanged (see that module).
  static computeResize(drag, clientX, clientY, shiftKey) {
    return computeResizeImpl(drag, clientX, clientY, shiftKey);
  }

  _handleDragMove(e) {
    if (!this._drag || !this._figure) return;
    const img = this._figure.querySelector('img');
    if (!img) return;

    // Stop the page scrolling under a touch-drag.
    if (e.cancelable && e.touches) e.preventDefault();
    const pt = pointFromEvent(e);

    const r = ImageResizeManager.computeResize(this._drag, pt.x, pt.y, e.shiftKey);
    // A null axis → CSS 'auto' (edge drag); browser holds ratio. Badge shows the
    // aspect-derived size (no reflow, #2).
    img.style.width  = r.width  == null ? 'auto' : `${r.width}px`;
    img.style.height = r.height == null ? 'auto' : `${r.height}px`;
    // ANCHOR (#2): grabbed west/north edge tracks the cursor (opposite edge pinned).
    applyAnchorTransform(img, this._drag, r);
    this._reposition();

    if (this._badge) {
      const shownW = r.width  == null ? r.derivedWidth  : r.width;
      const shownH = r.height == null ? r.derivedHeight : r.height;
      this._badge.textContent = `${shownW} × ${shownH}`;
      this._badge.classList.add('oe-resize-badge--visible');
    }

    const locked = r.locked;

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
      const r = ImageResizeManager.computeResize(this._drag, pt.x, pt.y, e.shiftKey);
      // Commit CONCRETE dims (width+height attrs) for a stable saved box, using
      // the aspect-derived value for the auto axis — no rect read, no reflow (#2).
      const finalW = r.width  == null ? r.derivedWidth  : r.width;
      const finalH = r.height == null ? r.derivedHeight : r.height;
      img.style.width  = `${finalW}px`;
      img.style.height = `${finalH}px`;
      img.setAttribute('width',  finalW);
      img.setAttribute('height', finalH);
      // ANCHOR (#2): bake the horizontal translate into margin-left (no snap),
      // then clear the transient transform. See image-resize-anchor.
      commitAnchor(img, this._drag, finalW);
    }

    this._cancelDrag();
    this._reposition();

    // Badge keeps showing final dims while selected; only the aspect-lock pill hides.
    if (this._lockPill) this._lockPill.classList.remove('oe-resize-lock--visible');

    if (this._editor) {
      this._editor.emit('afterCommand', { command: 'resizeImage', args: [] });
    }
  }

  _cancelDrag() {
    if (this._drag && this._figure) {
      // Drop any leftover live-anchor transform if the drag ends abnormally.
      const strayImg = this._figure.querySelector('img');
      if (strayImg && strayImg.style.transform) strayImg.style.transform = '';
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
