/**
 * Pure color-space conversion helpers for the advanced color picker.
 * No DOM, no side effects — only math. All inputs/outputs are plain objects or strings.
 *
 * Exposed:
 *   hexToRgb(hex)             → {r,g,b} or null
 *   rgbToHex({r,g,b})         → '#rrggbb'
 *   rgbToHsv({r,g,b})         → {h:0-360, s:0-1, v:0-1}
 *   hsvToRgb({h,s,v})         → {r,g,b}  (0-255 integers)
 *   hsvToHsl({h,s,v})         → {h:0-360, s:0-100, l:0-100}
 *   hslToHsv({h,s,l})         → {h:0-360, s:0-1, v:0-1}
 *   clamp(v,lo,hi)            → number
 */

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function hexToRgb(hex) {
  if (!hex || typeof hex !== 'string') return null;
  const h = hex.replace(/^#/, '');
  if (h.length === 3) {
    return {
      r: parseInt(h[0] + h[0], 16),
      g: parseInt(h[1] + h[1], 16),
      b: parseInt(h[2] + h[2], 16),
    };
  }
  if (h.length === 6) {
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    };
  }
  return null;
}

export function rgbToHex({ r, g, b }) {
  return '#' + [r, g, b].map((v) => {
    const c = Math.round(clamp(v, 0, 255)).toString(16);
    return c.length === 1 ? '0' + c : c;
  }).join('');
}

export function rgbToHsv({ r, g, b }) {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === rn)      h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else                 h = (rn - gn) / delta + 4;
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : delta / max;
  return { h, s, v: max };
}

export function hsvToRgb({ h, s, v }) {
  const c = v * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = v - c;
  let r, g, b;
  if      (h < 60)  { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else              { r = c; g = 0; b = x; }
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

export function hsvToHsl({ h, s, v }) {
  const l = v * (1 - s / 2);
  const sl = (l === 0 || l === 1) ? 0 : (v - l) / Math.min(l, 1 - l);
  return { h, s: Math.round(sl * 100), l: Math.round(l * 100) };
}

export function hslToHsv({ h, s, l }) {
  const sn = s / 100, ln = l / 100;
  const v = ln + sn * Math.min(ln, 1 - ln);
  const sv = v === 0 ? 0 : 2 * (1 - ln / v);
  return { h, s: sv, v };
}
