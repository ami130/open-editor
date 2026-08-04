/**
 * image-resize-anchor.js — the "pin the opposite edge" math for image resize
 * (issue #2). Extracted from image-resize.js to keep it under 300 lines.
 *
 * Problem: resizing writes img width/height with the top-left pinned, so dragging
 * the WEST/NORTH handle grew the box from the RIGHT/BOTTOM — the edge you grabbed
 * stayed put and the far edge moved ("stretch from right to left"). These helpers
 * translate the image during the drag so the grabbed edge tracks the cursor, then
 * bake the horizontal shift into margin-left on commit (no snap on release).
 */

/**
 * The box the resize frame / action bar hugs: the <img>/<picture>, NOT the
 * figure (which also holds the figcaption + padding — measuring it drew the
 * border around the caption strip and, for a width:100% figure, the whole
 * column instead of the image). Returns the figure itself as a last resort.
 */
export function targetOf(figure) {
  if (!figure || typeof figure.querySelector !== 'function') return figure || null;
  return figure.querySelector('picture') || figure.querySelector('img') || figure;
}

/** Position + size the overlay over `target`, relative to `wrapper`; sync SVG rect. */
export function placeOverlay(overlay, target, wrapper, svgRect) {
  if (!overlay || !target || !wrapper) return;
  try {
    const r = target.getBoundingClientRect();
    const w = wrapper.getBoundingClientRect();
    overlay.style.top    = `${r.top  - w.top  + wrapper.scrollTop}px`;
    overlay.style.left   = `${r.left - w.left + wrapper.scrollLeft}px`;
    overlay.style.width  = `${r.width}px`;
    overlay.style.height = `${r.height}px`;
    if (svgRect) {  // percent size on foreignObject is unreliable
      svgRect.setAttribute('width',  Math.max(0, r.width  - 2));
      svgRect.setAttribute('height', Math.max(0, r.height - 2));
    }
  } catch { /* safe in jsdom */ }
}

/** Which edges are anchored for a handle position. */
export function anchorFlags(pos) {
  return {
    anchorX: pos === 'nw' || pos === 'sw' || pos === 'w',
    anchorY: pos === 'nw' || pos === 'ne' || pos === 'n',
  };
}

/** Read the image's current computed left margin (px), 0 if unavailable. */
export function readMarginLeft(img) {
  try {
    const win = (img.ownerDocument && img.ownerDocument.defaultView) || window;
    return parseFloat(win.getComputedStyle(img).marginLeft) || 0;
  } catch { return 0; }
}

/**
 * Px of free space the image may grow LEFT into. For a left-anchored/default
 * block image that's the gap to the editor's content edge (0 when flush-left).
 * For center/right/inline figures the layout owns horizontal placement (auto
 * margins / float already pin the right edge natively), so return 0 and let them
 * grow per their alignment — a margin-left bake would fight that.
 */
export function leftRoom(editorEl, figure, img) {
  try {
    if (figure && (figure.classList.contains('oe-figure--center')
      || figure.classList.contains('oe-figure--right')
      || figure.classList.contains('oe-figure--inline'))) return 0;
    if (!editorEl || !img) return 0;
    const win = (editorEl.ownerDocument && editorEl.ownerDocument.defaultView) || window;
    const padL = parseFloat(win.getComputedStyle(editorEl).paddingLeft) || 0;
    const room = img.getBoundingClientRect().left - (editorEl.getBoundingClientRect().left + padL);
    return Math.max(0, Math.round(room));
  } catch { return 0; }
}

/**
 * How far the image may move LEFT for a west-anchored drag: the growth, capped
 * at the free space to the left (`maxLeftGrow`). When there is NO left room
 * (maxLeftGrow = 0) the image can't move horizontally at all — this covers both
 * the flush-left block (grows right, no overshoot) AND center/right/inline
 * figures whose horizontal placement the LAYOUT owns (auto margins / float).
 * Writing a margin there would fight the stylesheet (e.g. de-center the image),
 * so clamp BOTH directions to 0 — grow and shrink alike.
 */
function leftShift(drag, newW) {
  const room = drag.maxLeftGrow || 0;
  if (room <= 0) return 0;                          // layout owns placement
  const grow = newW - drag.startW;                 // >0 when the box got wider
  if (grow <= 0) return Math.max(grow, -room);      // shrink: move left, capped
  return Math.min(grow, room);
}

/**
 * Live anchor: translate the image so the grabbed west/north edge tracks the
 * cursor (opposite edge pinned), clamped so the left edge can't cross the
 * content boundary. No-op when neither axis is anchored.
 */
export function applyAnchorTransform(img, drag, r) {
  if (!drag || (!drag.anchorX && !drag.anchorY)) return;
  const newW = r.width  == null ? (r.derivedWidth  || drag.startW) : r.width;
  const newH = r.height == null ? (r.derivedHeight || drag.startH) : r.height;
  const tx = drag.anchorX ? -leftShift(drag, newW) : 0;
  const ty = drag.anchorY ? -(newH - drag.startH) : 0;  // vertical: page has room below
  img.style.transform = (tx || ty) ? `translate(${tx}px, ${ty}px)` : '';
}

/**
 * Commit the horizontal anchor into margin-left so the image stays exactly where
 * the (clamped) drag left it — no snap — then drop the transient transform.
 * Vertical growth flows down naturally, so no Y bake is needed.
 */
export function commitAnchor(img, drag, finalW) {
  img.style.transform = '';
  // Only bake a margin when there was real left room to anchor into. For
  // flush-left / center / right / inline (maxLeftGrow = 0) the layout owns
  // horizontal placement — writing margin-left would override margin:auto and
  // de-center the image (and persist that through save). Leave it untouched.
  if (!drag || !drag.anchorX || (drag.maxLeftGrow || 0) <= 0) return;
  const margin = Math.max(0, (drag.startMarginLeft || 0) - leftShift(drag, finalW));
  img.style.marginLeft = margin > 0 ? `${margin}px` : '';
}
