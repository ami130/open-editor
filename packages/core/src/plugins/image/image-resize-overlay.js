/**
 * image-resize-overlay.js — Overlay DOM construction for the resize manager.
 *
 * Split out of image-resize.js to keep both files under the 300-line limit.
 * buildResizeOverlay() creates the marching-ants border, dimension badge,
 * aspect-lock pill, and 8 drag handles, wiring each handle to onHandleDown.
 *
 * Handles listen for BOTH mousedown and touchstart so resize works on
 * touch devices (pointerdown would also work, but explicit touch keeps the
 * passive/preventDefault semantics predictable across browsers).
 */

const CORNERS = ['nw', 'ne', 'sw', 'se'];
const EDGES   = ['n', 'e', 's', 'w'];
export const HANDLES = [...CORNERS, ...EDGES];

/**
 * Build the resize overlay.
 * @param {Document} doc
 * @param {(e: Event, pos: string) => void} onHandleDown  invoked on mousedown/touchstart of a handle
 * @returns {{ overlay, svg, rect, badge, lock }}
 */
export function buildResizeOverlay(doc, onHandleDown) {
  const overlay = doc.createElement('div');
  overlay.className = 'oe-resize-overlay';
  overlay.setAttribute('aria-hidden', 'true');

  // Marching-ants SVG border
  const svg  = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const rect = doc.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('x', '1');
  rect.setAttribute('y', '1');
  rect.setAttribute('width',  'calc(100% - 2px)');
  rect.setAttribute('height', 'calc(100% - 2px)');
  rect.setAttribute('rx', '3');
  svg.appendChild(rect);
  overlay.appendChild(svg);

  // Dimension badge (top-center)
  const badge = doc.createElement('div');
  badge.className = 'oe-resize-badge';
  overlay.appendChild(badge);

  // Aspect-lock indicator (bottom-center)
  const lock = doc.createElement('div');
  lock.className = 'oe-resize-lock';
  lock.textContent = '⇔ locked';
  overlay.appendChild(lock);

  // 8 handles — mouse + touch
  for (const pos of HANDLES) {
    const handle = doc.createElement('div');
    handle.className = `oe-resize-handle oe-resize-handle--${pos}`;
    handle.setAttribute('data-handle', pos);
    handle.addEventListener('mousedown',  (e) => onHandleDown(e, pos));
    handle.addEventListener('touchstart', (e) => onHandleDown(e, pos), { passive: false });
    overlay.appendChild(handle);
  }

  return { overlay, svg, rect, badge, lock };
}

/**
 * Populate + reveal the dimension badge with an image's current rendered size,
 * so the dimensions of a selected image are visible without starting a drag.
 */
export function showBadgeDimensions(badge, img) {
  if (!badge || !img) return;
  const r = img.getBoundingClientRect();
  const w = Math.round(r.width  || img.offsetWidth  || parseInt(img.style.width)  || 0);
  const h = Math.round(r.height || img.offsetHeight || parseInt(img.style.height) || 0);
  if (!w || !h) return;
  badge.textContent = `${w} × ${h}`;
  badge.classList.add('oe-resize-badge--visible');
}

/** Extract clientX/clientY from a mouse OR touch event. */
export function pointFromEvent(e) {
  if (e.touches && e.touches.length)            return { x: e.touches[0].clientX,        y: e.touches[0].clientY };
  if (e.changedTouches && e.changedTouches.length) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
  return { x: e.clientX, y: e.clientY };
}
