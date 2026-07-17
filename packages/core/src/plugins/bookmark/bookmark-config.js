/**
 * bookmark-config.js — resolve the bookmark icon/color configuration from the
 * editor config, with safe built-in defaults. All feature-gated: if the host
 * configures nothing, bookmarks behave exactly as the classic single-flag
 * marker (no icon/color pickers rendered) — zero breaking change.
 *
 * Config keys (all optional):
 *   bookmarkIcons: [{ value, label }]  | null   → icon choices (null = just 'flag')
 *   bookmarkColors:[{ value, label, css }] | null → color choices (null = none)
 *   bookmarkDefaultIcon:  string  (default 'flag')
 *   bookmarkDefaultColor: string  (default first color, or null)
 *
 * `value`/color keys must match SAFE_KEY_RE (validated in bookmark-core); a
 * built-in icon renders via CSS `a.oe-bookmark[data-oe-icon="x"]::before`.
 */
import { SAFE_KEY_RE } from './bookmark-core.js';

// Built-in icon set (15) — each has a CSS ::before glyph in bookmark-styles.js.
// `glyph` mirrors that codepoint so the dialog swatch can preview it via
// data-glyph (one CSS rule, no per-icon swatch styling).
export const BUILTIN_ICONS = [
  { value: 'flag', label: 'Flag', glyph: '⚑' },
  { value: 'star', label: 'Star', glyph: '★' },
  { value: 'bookmark', label: 'Bookmark', glyph: '🔖' },
  { value: 'pin', label: 'Pin', glyph: '📍' },
  { value: 'tag', label: 'Tag', glyph: '🏷' },
  { value: 'heart', label: 'Heart', glyph: '♥' },
  { value: 'diamond', label: 'Diamond', glyph: '◆' },
  { value: 'triangle', label: 'Triangle', glyph: '▶' },
  { value: 'check', label: 'Check', glyph: '✔' },
  { value: 'arrow', label: 'Arrow', glyph: '➤' },
  { value: 'anchor', label: 'Anchor', glyph: '⚓' },
  { value: 'asterisk', label: 'Asterisk', glyph: '✱' },
  { value: 'lightning', label: 'Lightning', glyph: '⚡' },
  { value: 'square', label: 'Square', glyph: '■' },
  { value: 'dot', label: 'Dot', glyph: '●' },
];

// Built-in color set — keys map to CSS custom properties in the stylesheet.
export const BUILTIN_COLORS = [
  { value: 'accent', label: 'Accent', css: 'var(--oe-primary)' },
  { value: 'red', label: 'Red', css: '#e5484d' },
  { value: 'amber', label: 'Amber', css: '#f5a623' },
  { value: 'green', label: 'Green', css: '#30a46c' },
  { value: 'blue', label: 'Blue', css: '#3b82f6' },
  { value: 'violet', label: 'Violet', css: '#8b5cf6' },
];

function sanitizeList(list, fallback) {
  if (list === undefined) return fallback;      // not configured → built-ins
  if (list === null) return null;               // explicitly disabled
  if (!Array.isArray(list)) return fallback;
  const out = list
    .map((o) => (typeof o === 'string' ? { value: o, label: o } : o))
    .filter((o) => o && typeof o.value === 'string' && SAFE_KEY_RE.test(o.value));
  return out.length ? out : fallback;
}

/** Safe CSS length for the dynamic marker size (px/em/rem/%; no url/expr). */
const SIZE_RE = /^\d+(\.\d+)?(px|em|rem|%)$/;

export function resolveBookmarkConfig(config = {}) {
  // Icons AND colors both default to the built-in sets, so the pickers are
  // useful out of the box (2026-07-16: colors were originally opt-in — owner
  // feedback: "I can't give color" — the palette is the point, default it on).
  // Pass `null` or `false` for either to disable that picker entirely.
  const icons = (config.bookmarkIcons === false)
    ? null : sanitizeList(config.bookmarkIcons, BUILTIN_ICONS);
  const colors = (config.bookmarkColors === false || config.bookmarkColors === true)
    ? (config.bookmarkColors === true ? BUILTIN_COLORS : null)
    : sanitizeList(config.bookmarkColors, BUILTIN_COLORS);

  const defaultIcon = (typeof config.bookmarkDefaultIcon === 'string'
    && SAFE_KEY_RE.test(config.bookmarkDefaultIcon))
    ? config.bookmarkDefaultIcon
    : (icons && icons[0] ? icons[0].value : 'flag');

  const defaultColor = (typeof config.bookmarkDefaultColor === 'string'
    && SAFE_KEY_RE.test(config.bookmarkDefaultColor))
    ? config.bookmarkDefaultColor
    : null;

  // Dynamic marker size (config: bookmarkIconSize). Number → px; validated
  // CSS length string accepted as-is; anything else → null (CSS default 1em,
  // which tracks the surrounding text size).
  let iconSize = null;
  const raw = config.bookmarkIconSize;
  if (typeof raw === 'number' && raw > 0 && raw <= 128) iconSize = `${raw}px`;
  else if (typeof raw === 'string' && SIZE_RE.test(raw)) iconSize = raw;

  // Navigator panel (jump-to dropdown): OFF by default — a second always-
  // visible toolbar button confused more than it helped (owner feedback,
  // 2026-07-16). Long-document users opt in with `bookmarkPanel: true`.
  const panel = config.bookmarkPanel === true;

  return { icons, colors, defaultIcon, defaultColor, iconSize, panel };
}
