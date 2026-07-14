/**
 * color-picker-keys.js — swatch-grid keyboard navigation for the color picker
 * (14.4 accessibility). Extracted from color-picker.js to keep it ≤300 lines.
 *
 * Given the ArrowKey event and the list of swatch buttons, move focus within the
 * 8-column grid (wraps horizontally, clamps vertically). Returns true when it
 * handled the key.
 */
const COLS = 8;

export function navigateSwatchGrid(e, swatchEls, activeEl) {
  if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) return false;
  const idx = swatchEls.indexOf(activeEl);
  if (idx === -1) return false;
  e.preventDefault();
  const n = swatchEls.length;
  let next = idx;
  if (e.key === 'ArrowRight')     next = (idx + 1) % n;
  else if (e.key === 'ArrowLeft') next = (idx - 1 + n) % n;
  else if (e.key === 'ArrowDown') next = Math.min(idx + COLS, n - 1);
  else if (e.key === 'ArrowUp')   next = Math.max(idx - COLS, 0);
  if (swatchEls[next]) swatchEls[next].focus();
  return true;
}

/**
 * 14.4 — keyboard control of the SV plane / hue / alpha sliders. Returns a
 * mutation `{hsv?, alpha?}` for the given arrow key on the given slider, or null
 * if the key isn't an arrow. Pure: the caller applies the returned state + repaints.
 *   kind: 'sv' (2D: L/R = saturation, U/D = value) | 'hue' | 'alpha'
 *   hsv:  current {h,s,v}   alpha: current 0..100
 * Step is 1 unit; Shift = 10 (coarse). s/v are 0..1, h is 0..360, alpha 0..100.
 */
/**
 * Wire arrow-key control onto the three color-picker sliders. `getState()`
 * returns the current { hsv, alpha }; `onChange(next)` receives the new
 * { hsv, alpha } to apply + repaint. Keeps this wiring out of color-picker.js.
 */
export function installSliderKeys(dom, getState, onChange) {
  const wire = (el, kind) => {
    if (!el) return;
    el.addEventListener('keydown', (e) => {
      const { hsv, alpha } = getState();
      const delta = sliderKeyDelta(e, kind, hsv, alpha);
      if (!delta) return;
      e.preventDefault();
      onChange({ hsv: delta.hsv || hsv, alpha: delta.alpha != null ? delta.alpha : alpha });
    });
  };
  wire(dom.gradWrap, 'sv');
  wire(dom.hueWrap, 'hue');
  wire(dom.alphaWrap, 'alpha');
}

/** Keep slider aria-value* in sync with the current hsv/alpha (screen readers). */
export function syncSliderAria(dom, hsv, alpha) {
  if (dom.hueWrap) dom.hueWrap.setAttribute('aria-valuenow', String(Math.round(hsv.h)));
  if (dom.alphaWrap) dom.alphaWrap.setAttribute('aria-valuenow', String(alpha));
  if (dom.gradWrap) dom.gradWrap.setAttribute('aria-valuetext',
    `saturation ${Math.round(hsv.s * 100)}%, brightness ${Math.round(hsv.v * 100)}%`);
}

export function sliderKeyDelta(e, kind, hsv, alpha) {
  const arrows = ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'];
  if (!arrows.includes(e.key)) return null;
  const big = e.shiftKey;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  if (kind === 'sv') {
    const dS = (big ? 0.1 : 0.01) * (e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0);
    const dV = (big ? 0.1 : 0.01) * (e.key === 'ArrowUp' ? 1 : e.key === 'ArrowDown' ? -1 : 0);
    if (!dS && !dV) return null;
    return { hsv: { h: hsv.h, s: clamp(hsv.s + dS, 0, 1), v: clamp(hsv.v + dV, 0, 1) } };
  }
  if (kind === 'hue') {
    const step = (big ? 10 : 1) * (e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1
      : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0);
    if (!step) return null;
    return { hsv: { h: (hsv.h + step + 360) % 360, s: hsv.s, v: hsv.v } };
  }
  if (kind === 'alpha') {
    const step = (big ? 10 : 1) * (e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1
      : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0);
    if (!step) return null;
    return { alpha: clamp(alpha + step, 0, 100) };
  }
  return null;
}
