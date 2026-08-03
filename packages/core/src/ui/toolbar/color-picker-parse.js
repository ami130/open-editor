/**
 * color-picker-parse.js — turn ANY CSS color string the DOM might hand back
 * (hex, rgb()/rgba(), hsl()/hsla(), a named color, or `transparent`) into a
 * canonical { hex:'#rrggbb', alpha:0..1 }. Pure, no DOM — so it behaves the
 * same in jsdom (which does NOT normalize style.color) and in browsers.
 *
 * Returns null when the string can't be understood (caller falls back to the
 * picker's default). Fixes C2: seeding from named / hsl() colors used to fail
 * because only numeric rgb() values were parsed.
 */
import { rgbToHex, hslToHsv, hsvToRgb, clamp } from './color-picker-convert.js';

// The 16 CSS "basic" names + the handful that show up most in pasted content.
// Kept compact on purpose; anything outside this set falls through to null,
// which is no worse than the previous behaviour (picker opens at default).
const NAMED = {
  black: '#000000', silver: '#c0c0c0', gray: '#808080', grey: '#808080',
  white: '#ffffff', maroon: '#800000', red: '#ff0000', purple: '#800080',
  fuchsia: '#ff00ff', magenta: '#ff00ff', green: '#008000', lime: '#00ff00',
  olive: '#808000', yellow: '#ffff00', navy: '#000080', blue: '#0000ff',
  teal: '#008080', aqua: '#00ffff', cyan: '#00ffff', orange: '#ffa500',
  pink: '#ffc0cb', brown: '#a52a2a', gold: '#ffd700', indigo: '#4b0082',
  violet: '#ee82ee', rebeccapurple: '#663399',
};

function normHex(h) {
  const s = h.replace(/^#/, '');
  if (s.length === 3) return { hex: '#' + s.split('').map((c) => c + c).join(''), alpha: 1 };
  if (s.length === 4) {
    const rgb = s.slice(0, 3).split('').map((c) => c + c).join('');
    return { hex: '#' + rgb, alpha: parseInt(s[3] + s[3], 16) / 255 };
  }
  if (s.length === 6) return { hex: '#' + s, alpha: 1 };
  if (s.length === 8) return { hex: '#' + s.slice(0, 6), alpha: parseInt(s.slice(6, 8), 16) / 255 };
  return null;
}

export function parseCssColor(input) {
  if (!input || typeof input !== 'string') return null;
  const str = input.trim().toLowerCase();
  if (str === 'transparent') return { hex: '#000000', alpha: 0 };
  if (str[0] === '#') return normHex(str);
  if (NAMED[str]) return { hex: NAMED[str], alpha: 1 };

  const isHsl = str.startsWith('hsl');
  if (str.startsWith('rgb') || isHsl) {
    const nums = str.match(/[\d.]+/g);
    if (!nums || nums.length < 3) return null;
    const alpha = nums.length >= 4 ? clamp(+nums[3], 0, 1) : 1;
    if (isHsl) {
      const rgb = hsvToRgb(hslToHsv({ h: +nums[0], s: +nums[1], l: +nums[2] }));
      return { hex: rgbToHex(rgb), alpha };
    }
    return { hex: rgbToHex({ r: +nums[0], g: +nums[1], b: +nums[2] }), alpha };
  }
  return null;
}
