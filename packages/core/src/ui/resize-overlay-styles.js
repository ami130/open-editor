import { injectStyleOnce } from '../utils/inject-style.js';

/**
 * resize-overlay-styles.js — shared CSS for the generic 8-handle resize
 * overlay (image-resize-overlay.js's markup shape). Extracted out of
 * image-styles.js so the media plugin can reuse the identical overlay
 * without duplicating ~150 lines of CSS or double-injecting under two
 * different style ids — both plugins call injectResizeOverlayStyles(doc)
 * and injectStyleOnce's id-based dedup means only the first call matters.
 */

const STYLE_ID = 'oe-resize-overlay-styles';

export const RESIZE_OVERLAY_CSS = `
@keyframes oe-march {
  to { stroke-dashoffset: -16; }
}
.oe-resize-overlay {
  position: absolute;
  pointer-events: none;
  z-index: 100;
  box-sizing: border-box;
  border-radius: 3px;
}
.oe-resize-overlay__border {
  position: absolute;
  inset: 0;
  border-radius: 3px;
  pointer-events: none;
}
.oe-resize-overlay svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
}
.oe-resize-overlay svg rect {
  fill: none;
  stroke: var(--oe-primary);
  stroke-width: 2;
  stroke-dasharray: 8 4;
  animation: oe-march 0.4s linear infinite;
}

.oe-resize-handle {
  position: absolute;
  width: 14px;
  height: 14px;
  background: var(--oe-bg);
  border: 2px solid var(--oe-primary);
  border-radius: 3px;
  pointer-events: all;
  box-sizing: border-box;
  box-shadow: 0 1px 4px rgba(37,99,235,0.25);
  transition: transform 0.12s, background 0.12s, box-shadow 0.12s;
  z-index: 1;
}
.oe-resize-handle:hover {
  background: var(--oe-primary);
  transform: scale(1.35);
  box-shadow: 0 2px 8px rgba(37,99,235,0.45);
}

/* corner handles */
.oe-resize-handle--nw { top: -7px;  left: -7px;  cursor: nw-resize; }
.oe-resize-handle--ne { top: -7px;  right: -7px; cursor: ne-resize; }
.oe-resize-handle--sw { bottom: -7px; left: -7px;  cursor: sw-resize; }
.oe-resize-handle--se { bottom: -7px; right: -7px; cursor: se-resize; }

/* edge handles — thinner, pill-shaped */
.oe-resize-handle--n,
.oe-resize-handle--s {
  width: 28px;
  height: 8px;
  border-radius: 4px;
  left: 50%;
  transform: translateX(-50%);
}
.oe-resize-handle--e,
.oe-resize-handle--w {
  width: 8px;
  height: 28px;
  border-radius: 4px;
  top: 50%;
  transform: translateY(-50%);
}
.oe-resize-handle--n { top: -4px;    cursor: n-resize; }
.oe-resize-handle--s { bottom: -4px; cursor: s-resize; }
.oe-resize-handle--e { right: -4px;  cursor: e-resize; }
.oe-resize-handle--w { left: -4px;   cursor: w-resize; }

.oe-resize-handle--n:hover,
.oe-resize-handle--s:hover { transform: translateX(-50%) scaleY(1.5); background: var(--oe-primary); }
.oe-resize-handle--e:hover,
.oe-resize-handle--w:hover { transform: translateY(-50%) scaleX(1.5); background: var(--oe-primary); }

/* Dimension badge shown during drag */
.oe-resize-badge {
  position: absolute;
  top: -32px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--oe-inverse-bg);
  color: var(--oe-inverse-fg);
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
  padding: 3px 8px;
  border-radius: 5px;
  white-space: nowrap;
  pointer-events: none;
  box-shadow: 0 2px 6px rgba(0,0,0,0.22);
  opacity: 0;
  transition: opacity 0.1s;
}
.oe-resize-badge::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 4px solid transparent;
  border-top-color: var(--oe-inverse-bg);
}
.oe-resize-badge--visible { opacity: 1; }

/* Aspect-ratio lock pill shown at bottom during constrained drag */
.oe-resize-lock {
  position: absolute;
  bottom: -28px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--oe-primary);
  color: var(--oe-primary-fg);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 2px 8px;
  border-radius: 10px;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.12s;
}
.oe-resize-lock--visible { opacity: 1; }

/* Body cursor override during drag — applied to <html> */
.oe-resizing-nw,
.oe-resizing-se { cursor: nw-resize !important; }
.oe-resizing-ne,
.oe-resizing-sw { cursor: ne-resize !important; }
.oe-resizing-n,
.oe-resizing-s  { cursor: n-resize  !important; }
.oe-resizing-e,
.oe-resizing-w  { cursor: e-resize  !important; }
.oe-resizing-nw *,
.oe-resizing-se *,
.oe-resizing-ne *,
.oe-resizing-sw *,
.oe-resizing-n  *,
.oe-resizing-s  *,
.oe-resizing-e  *,
.oe-resizing-w  * { cursor: inherit !important; pointer-events: none !important; }
`;

export function injectResizeOverlayStyles(doc) {
  injectStyleOnce(doc, STYLE_ID, RESIZE_OVERLAY_CSS);
}
