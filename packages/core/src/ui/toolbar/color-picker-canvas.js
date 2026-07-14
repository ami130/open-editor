/**
 * Canvas painting and drag helpers for the advanced color picker.
 *
 * Exports:
 *   paintGradient(canvas, hue)          — paints the SV square for a given hue
 *   paintHueSlider(canvas)              — paints the rainbow hue bar (once)
 *   paintOpacitySlider(canvas, hex)     — paints the opacity bar for current color
 *   readCanvasColor(canvas, x, y)       — returns {r,g,b} from canvas pixel
 *   makeDraggable(el, onMove, onEnd)    — attaches mouse + touch drag listeners
 *   svFromXY(x, y, w, h)               — converts pixel pos to {s:0-1, v:0-1}
 *   xyFromSV(s, v, w, h)               — converts {s,v} to pixel {x,y}
 *   hueFromX(x, w)                     — converts x pos to hue 0-360
 *   xFromHue(hue, w)                   — converts hue to x pos
 *   alphaFromX(x, w)                   — converts x pos to alpha 0-100
 *   xFromAlpha(alpha, w)               — converts alpha to x pos
 */

import { clamp } from './color-picker-convert.js';

// ─── Gradient canvas (Saturation × Value square) ─────────────────────────────

export function paintGradient(canvas, hue) {
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  // Base: solid hue
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
  ctx.fillRect(0, 0, w, h);
  // White overlay (left = white, right = hue)
  const white = ctx.createLinearGradient(0, 0, w, 0);
  white.addColorStop(0, 'rgba(255,255,255,1)');
  white.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = white;
  ctx.fillRect(0, 0, w, h);
  // Black overlay (top = full brightness, bottom = black)
  const black = ctx.createLinearGradient(0, 0, 0, h);
  black.addColorStop(0, 'rgba(0,0,0,0)');
  black.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.fillStyle = black;
  ctx.fillRect(0, 0, w, h);
}

// ─── Hue slider ───────────────────────────────────────────────────────────────

export function paintHueSlider(canvas) {
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  const grad = ctx.createLinearGradient(0, 0, w, 0);
  const stops = [0, 60, 120, 180, 240, 300, 360];
  stops.forEach((deg) => grad.addColorStop(deg / 360, `hsl(${deg},100%,50%)`));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

// ─── Opacity slider ───────────────────────────────────────────────────────────

export function paintOpacitySlider(canvas, hex) {
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  // Checkerboard background (8px squares)
  const sq = 8;
  for (let row = 0; row < Math.ceil(h / sq); row++) {
    for (let col = 0; col < Math.ceil(w / sq); col++) {
      ctx.fillStyle = (row + col) % 2 === 0 ? '#ccc' : '#fff';
      ctx.fillRect(col * sq, row * sq, sq, sq);
    }
  }
  // Color → transparent overlay
  const grad = ctx.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, hex || '#000000');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

// ─── Pixel read ────────────────────────────────────────────────────────────────

export function readCanvasColor(canvas, x, y) {
  if (!canvas || !canvas.getContext) return { r: 0, g: 0, b: 0 };
  const ctx = canvas.getContext('2d');
  if (!ctx) return { r: 0, g: 0, b: 0 };
  const w = canvas.width;
  const h = canvas.height;
  const px = clamp(Math.round(x), 0, w - 1);
  const py = clamp(Math.round(y), 0, h - 1);
  const d = ctx.getImageData(px, py, 1, 1).data;
  return { r: d[0], g: d[1], b: d[2] };
}

// ─── Coordinate math ──────────────────────────────────────────────────────────

export function svFromXY(x, y, w, h) {
  return {
    s: clamp(x / w, 0, 1),
    v: clamp(1 - y / h, 0, 1),
  };
}

export function xyFromSV(s, v, w, h) {
  return { x: s * w, y: (1 - v) * h };
}

export function hueFromX(x, w) {
  return clamp((x / w) * 360, 0, 360);
}

export function xFromHue(hue, w) {
  return (hue / 360) * w;
}

export function alphaFromX(x, w) {
  return Math.round(clamp((x / w) * 100, 0, 100));
}

export function xFromAlpha(alpha, w) {
  return (alpha / 100) * w;
}

// ─── Drag helper ──────────────────────────────────────────────────────────────

/**
 * Attaches mouse + touch drag to `el`. `onMove(x, y, rect)` receives the
 * position relative to `el`'s bounding rect. `onEnd()` fires on release.
 * Returns a cleanup function that removes all listeners.
 */
export function makeDraggable(el, onMove, onEnd) {
  let active = false;

  function getPos(e) {
    const rect = el.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top, rect };
  }

  function onStart(e) {
    active = true;
    e.preventDefault();
    const pos = getPos(e);
    onMove(pos.x, pos.y, pos.rect);
  }

  function onMoveDoc(e) {
    if (!active) return;
    e.preventDefault();
    const rect = el.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    onMove(clientX - rect.left, clientY - rect.top, rect);
  }

  function onEndDoc() {
    if (!active) return;
    active = false;
    if (onEnd) onEnd();
  }

  el.addEventListener('mousedown', onStart);
  el.addEventListener('touchstart', onStart, { passive: false });
  document.addEventListener('mousemove', onMoveDoc);
  document.addEventListener('touchmove', onMoveDoc, { passive: false });
  document.addEventListener('mouseup', onEndDoc);
  document.addEventListener('touchend', onEndDoc);

  return function cleanup() {
    el.removeEventListener('mousedown', onStart);
    el.removeEventListener('touchstart', onStart);
    document.removeEventListener('mousemove', onMoveDoc);
    document.removeEventListener('touchmove', onMoveDoc);
    document.removeEventListener('mouseup', onEndDoc);
    document.removeEventListener('touchend', onEndDoc);
  };
}
