/**
 * image-resize-compute.js — the pure resize math for the image/media resize
 * managers. Extracted from image-resize.js to keep that file under the 300-line
 * limit; `ImageResizeManager.computeResize` delegates here (and media reuses it
 * through that static method, so the public shape is unchanged).
 */

export const MIN_WIDTH  = 40;
export const MIN_HEIGHT = 20;
// IMG19: an upper clamp so a runaway drag can't serialize an absurd size (e.g.
// width="9000") that differs from what CSS max-width:100% actually renders.
// Generous — real images fit well under this; it only stops pathological drags.
export const MAX_WIDTH  = 8000;
export const MAX_HEIGHT = 8000;
const clampW = (w) => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, w));
const clampH = (h) => Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, h));

/**
 * Compute the new size for a drag.
 *
 * Behavior ("clean resize", 2026-07-16):
 *  - CORNER handles keep the ORIGINAL ASPECT RATIO BY DEFAULT (no distortion);
 *    Shift frees both axes for a deliberate stretch. (Inverse of the old
 *    default, which stretched by default and squished the image.)
 *  - EDGE handles (n/s/e/w) resize one axis and set the OTHER to `auto`
 *    (height === null) so the browser preserves the natural aspect — no
 *    leftover pinned dimension causing distortion.
 *
 * Returns { width, height, locked }, where `height === null` means "auto".
 */
export function computeResize(drag, clientX, clientY, shiftKey) {
  const pos = drag.pos || drag.corner; // support legacy 'corner' key
  const { startX, startY, startW, startH, aspect } = drag;

  let dx = clientX - startX;
  let dy = clientY - startY;

  // Invert for handles that pull left or up.
  const flipX = pos === 'nw' || pos === 'sw' || pos === 'w';
  const flipY = pos === 'nw' || pos === 'ne' || pos === 'n';
  if (flipX) dx = -dx;
  if (flipY) dy = -dy;

  const isHorizontalOnly = pos === 'e' || pos === 'w';
  const isVerticalOnly   = pos === 'n' || pos === 's';

  // Edge handles resize ONE axis and set the OTHER to `auto` (least surprising:
  // a side handle changes only that side; the browser keeps the ratio). We also
  // return a `derived` value computed FROM the aspect (no DOM measurement), so
  // callers can show a badge / commit a concrete dimension without a reflow (#2).
  //   height === null → CSS height:auto (horizontal drag)
  //   width  === null → CSS width:auto  (vertical drag)
  if (isHorizontalOnly) {
    const w = clampW(startW + dx);
    const derivedH = aspect ? Math.round(w / aspect) : Math.round(startH);
    return { width: Math.round(w), height: null, derivedHeight: derivedH, locked: false };
  }
  if (isVerticalOnly) {
    const h = clampH(startH + dy);
    const derivedW = aspect ? Math.round(h * aspect) : Math.round(startW);
    return { width: null, height: Math.round(h), derivedWidth: derivedW, locked: false };
  }

  // Corner handles.
  const free = shiftKey; // Shift = free-form stretch; default = keep ratio
  let newW = clampW(startW + dx);
  let newH = clampH(startH + dy);

  if (!free && aspect) {
    // Keep aspect: the larger drag axis drives, derive the other.
    const dxAbs = Math.abs(clientX - startX);
    const dyAbs = Math.abs(clientY - startY);
    if (dxAbs >= dyAbs) newH = clampH(newW / aspect);
    else                newW = clampW(newH * aspect);
  }

  return { width: Math.round(newW), height: Math.round(newH), locked: !free };
}
