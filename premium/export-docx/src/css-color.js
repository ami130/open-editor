/**
 * css-color.js — parse a CSS color value into an OOXML 6-hex string (no '#').
 * Pure. Handles the forms the editor actually emits: #rgb, #rrggbb,
 * rgb()/rgba(), and a small set of common named colors. Returns null when it
 * can't parse (caller then omits the color rather than emitting garbage).
 *
 * OOXML wants uppercase RRGGBB with no leading '#' (e.g. <w:shd w:fill="FFEB3B"/>).
 */

const NAMED = {
  black: '000000', white: 'FFFFFF', red: 'FF0000', green: '008000', blue: '0000FF',
  yellow: 'FFFF00', orange: 'FFA500', purple: '800080', gray: '808080', grey: '808080',
  silver: 'C0C0C0', maroon: '800000', navy: '000080', teal: '008080', olive: '808000',
  lime: '00FF00', aqua: '00FFFF', cyan: '00FFFF', magenta: 'FF00FF', fuchsia: 'FF00FF',
  transparent: null,
};

function clamp255(n) { return Math.max(0, Math.min(255, Math.round(n))); }
function hex2(n) { return clamp255(n).toString(16).padStart(2, '0'); }

/** @returns {string|null} 6-hex uppercase, or null if unparseable/transparent. */
export function cssColorToHex(value) {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  if (!v) return null;

  if (Object.prototype.hasOwnProperty.call(NAMED, v)) return NAMED[v];

  // #rgb / #rrggbb
  let m = v.match(/^#([0-9a-f]{3})$/);
  if (m) {
    const [r, g, b] = m[1].split('');
    return (r + r + g + g + b + b).toUpperCase();
  }
  m = v.match(/^#([0-9a-f]{6})$/);
  if (m) return m[1].toUpperCase();

  // rgb()/rgba() — ignore alpha (OOXML shading has no alpha; fully transparent
  // is treated as "no fill" by returning null only for alpha 0).
  m = v.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?\s*\)$/);
  if (m) {
    const a = m[4] != null ? Number(m[4]) : 1;
    if (a === 0) return null; // fully transparent → no fill
    return (hex2(Number(m[1])) + hex2(Number(m[2])) + hex2(Number(m[3]))).toUpperCase();
  }
  return null;
}

/**
 * Parse a CSS `border` shorthand (e.g. "1px solid #000" / "2px dotted red")
 * into { sz, val, color } for OOXML (sz = eighths of a point; val = line style).
 * Returns null if there's no usable border (e.g. "0" / "none").
 */
export function cssBorderToOoxml(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const v = value.trim().toLowerCase();
  if (v === '0' || v === 'none' || /\bnone\b/.test(v) || /^0(px)?\b/.test(v)) return null;
  const widthPx = (v.match(/([\d.]+)px/) || [])[1];
  const styleWord = (v.match(/\b(solid|dashed|dotted|double)\b/) || [])[1] || 'single';
  // Color: try hex/rgb first, else the first bare word that ISN'T a
  // width/style keyword (so "2px dotted red" resolves to red, not dotted).
  let color = null;
  const hexRgb = v.match(/#[0-9a-f]{3,6}|rgba?\([^)]*\)/);
  if (hexRgb) color = cssColorToHex(hexRgb[0]);
  else {
    const STYLE_WORDS = new Set(['solid', 'dashed', 'dotted', 'double', 'none', 'hidden', 'groove', 'ridge', 'inset', 'outset']);
    for (const word of v.match(/\b[a-z]+\b/g) || []) {
      if (STYLE_WORDS.has(word)) continue;
      const c = cssColorToHex(word);
      if (c) { color = c; break; }
    }
  }
  const val = ({ solid: 'single', dashed: 'dashed', dotted: 'dotted', double: 'double' })[styleWord] || 'single';
  const sz = widthPx ? Math.max(2, Math.round(Number(widthPx) * 8)) : 4; // px → eighths-of-pt (approx)
  return { sz, val, color: color || '000000' };
}

/** Parse a `style` attribute string into a lowercase-keyed property map. */
export function parseStyle(styleAttr) {
  const out = {};
  if (typeof styleAttr !== 'string') return out;
  for (const decl of styleAttr.split(';')) {
    const i = decl.indexOf(':');
    if (i < 0) continue;
    const k = decl.slice(0, i).trim().toLowerCase();
    const val = decl.slice(i + 1).trim();
    if (k) out[k] = val;
  }
  return out;
}
