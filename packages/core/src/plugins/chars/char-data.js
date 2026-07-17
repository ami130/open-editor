/**
 * char-data.js — Phase 13.3: the default Special Characters set.
 *
 * A curated set covering the categories users actually reach for: punctuation &
 * typography, currency, math/logic, arrows, and accented Latin + Greek letters.
 * Integrators can replace it wholesale via config `specialCharacters` (an array
 * of single-character strings), mirroring Jodit's `specialCharacters` option.
 *
 * Each entry is { ch, label, cat } where `ch` is inserted verbatim, `label` is
 * the tooltip / search text, and `cat` groups it under a category tab (13.3
 * UI modernization). Characters are written as \u escapes where they are
 * non-ASCII so the source stays free of literal exotic glyphs.
 */
const U = String.fromCharCode;

/** Category tabs, in display order. `id` matches each char's `cat`. */
export const SPECIAL_CHAR_CATEGORIES = [
  { id: 'punct', label: 'Punctuation' },
  { id: 'currency', label: 'Currency' },
  { id: 'symbols', label: 'Symbols' },
  { id: 'math', label: 'Math' },
  { id: 'arrows', label: 'Arrows' },
  { id: 'latin', label: 'Latin' },
  { id: 'greek', label: 'Greek' },
];

export const DEFAULT_SPECIAL_CHARS = [
  // Punctuation & typography
  { ch: U(0x2013), label: 'En dash', cat: 'punct' },
  { ch: U(0x2014), label: 'Em dash', cat: 'punct' },
  { ch: U(0x2018), label: 'Left single quote', cat: 'punct' },
  { ch: U(0x2019), label: 'Right single quote', cat: 'punct' },
  { ch: U(0x201C), label: 'Left double quote', cat: 'punct' },
  { ch: U(0x201D), label: 'Right double quote', cat: 'punct' },
  { ch: U(0x2026), label: 'Ellipsis', cat: 'punct' },
  { ch: U(0x2022), label: 'Bullet', cat: 'punct' },
  { ch: U(0x00B7), label: 'Middle dot', cat: 'punct' },
  { ch: U(0x2020), label: 'Dagger', cat: 'punct' },
  { ch: U(0x2021), label: 'Double dagger', cat: 'punct' },
  { ch: U(0x00A7), label: 'Section', cat: 'punct' },
  { ch: U(0x00B6), label: 'Pilcrow', cat: 'punct' },
  { ch: U(0x2032), label: 'Prime', cat: 'punct' },
  { ch: U(0x2033), label: 'Double prime', cat: 'punct' },
  // Currency
  { ch: U(0x20AC), label: 'Euro', cat: 'currency' },
  { ch: U(0x00A3), label: 'Pound', cat: 'currency' },
  { ch: U(0x00A5), label: 'Yen', cat: 'currency' },
  { ch: U(0x00A2), label: 'Cent', cat: 'currency' },
  { ch: U(0x20B9), label: 'Rupee', cat: 'currency' },
  { ch: U(0x20BD), label: 'Ruble', cat: 'currency' },
  { ch: U(0x00A4), label: 'Currency sign', cat: 'currency' },
  { ch: U(0x0024), label: 'Dollar', cat: 'currency' },
  { ch: U(0x20A9), label: 'Won', cat: 'currency' },
  { ch: U(0x20AA), label: 'Shekel', cat: 'currency' },
  { ch: U(0x20BA), label: 'Lira', cat: 'currency' },
  // Legal / symbols
  { ch: U(0x00A9), label: 'Copyright', cat: 'symbols' },
  { ch: U(0x00AE), label: 'Registered', cat: 'symbols' },
  { ch: U(0x2122), label: 'Trademark', cat: 'symbols' },
  { ch: U(0x2117), label: 'Sound recording copyright', cat: 'symbols' },
  { ch: U(0x00B0), label: 'Degree', cat: 'symbols' },
  { ch: U(0x2605), label: 'Star', cat: 'symbols' },
  { ch: U(0x2606), label: 'Open star', cat: 'symbols' },
  { ch: U(0x2665), label: 'Heart', cat: 'symbols' },
  { ch: U(0x2713), label: 'Check mark', cat: 'symbols' },
  { ch: U(0x2717), label: 'Cross mark', cat: 'symbols' },
  { ch: U(0x2714), label: 'Heavy check', cat: 'symbols' },
  { ch: U(0x2764), label: 'Heavy heart', cat: 'symbols' },
  // Math / logic
  { ch: U(0x00D7), label: 'Multiplication', cat: 'math' },
  { ch: U(0x00F7), label: 'Division', cat: 'math' },
  { ch: U(0x00B1), label: 'Plus-minus', cat: 'math' },
  { ch: U(0x2260), label: 'Not equal', cat: 'math' },
  { ch: U(0x2264), label: 'Less than or equal', cat: 'math' },
  { ch: U(0x2265), label: 'Greater than or equal', cat: 'math' },
  { ch: U(0x2248), label: 'Approximately equal', cat: 'math' },
  { ch: U(0x221E), label: 'Infinity', cat: 'math' },
  { ch: U(0x221A), label: 'Square root', cat: 'math' },
  { ch: U(0x2211), label: 'Summation', cat: 'math' },
  { ch: U(0x220F), label: 'Product', cat: 'math' },
  { ch: U(0x222B), label: 'Integral', cat: 'math' },
  { ch: U(0x2202), label: 'Partial differential', cat: 'math' },
  { ch: U(0x2206), label: 'Delta', cat: 'math' },
  { ch: U(0x03C0), label: 'Pi', cat: 'math' },
  { ch: U(0x00BC), label: 'One quarter', cat: 'math' },
  { ch: U(0x00BD), label: 'One half', cat: 'math' },
  { ch: U(0x00BE), label: 'Three quarters', cat: 'math' },
  { ch: U(0x2208), label: 'Element of', cat: 'math' },
  { ch: U(0x2209), label: 'Not element of', cat: 'math' },
  { ch: U(0x2229), label: 'Intersection', cat: 'math' },
  { ch: U(0x222A), label: 'Union', cat: 'math' },
  // Arrows
  { ch: U(0x2190), label: 'Left arrow', cat: 'arrows' },
  { ch: U(0x2191), label: 'Up arrow', cat: 'arrows' },
  { ch: U(0x2192), label: 'Right arrow', cat: 'arrows' },
  { ch: U(0x2193), label: 'Down arrow', cat: 'arrows' },
  { ch: U(0x2194), label: 'Left-right arrow', cat: 'arrows' },
  { ch: U(0x21D0), label: 'Left double arrow', cat: 'arrows' },
  { ch: U(0x21D2), label: 'Right double arrow', cat: 'arrows' },
  { ch: U(0x21D4), label: 'Left-right double arrow', cat: 'arrows' },
  { ch: U(0x21B5), label: 'Return arrow', cat: 'arrows' },
  { ch: U(0x21BB), label: 'Clockwise arrow', cat: 'arrows' },
  // Accented Latin (common)
  { ch: U(0x00E9), label: 'e acute', cat: 'latin' },
  { ch: U(0x00E8), label: 'e grave', cat: 'latin' },
  { ch: U(0x00EA), label: 'e circumflex', cat: 'latin' },
  { ch: U(0x00E7), label: 'c cedilla', cat: 'latin' },
  { ch: U(0x00F1), label: 'n tilde', cat: 'latin' },
  { ch: U(0x00FC), label: 'u umlaut', cat: 'latin' },
  { ch: U(0x00F6), label: 'o umlaut', cat: 'latin' },
  { ch: U(0x00E4), label: 'a umlaut', cat: 'latin' },
  { ch: U(0x00E5), label: 'a ring', cat: 'latin' },
  { ch: U(0x00DF), label: 'sharp s', cat: 'latin' },
  { ch: U(0x00E0), label: 'a grave', cat: 'latin' },
  { ch: U(0x00E1), label: 'a acute', cat: 'latin' },
  { ch: U(0x00BF), label: 'Inverted question mark', cat: 'latin' },
  { ch: U(0x00A1), label: 'Inverted exclamation mark', cat: 'latin' },
  // Greek (common)
  { ch: U(0x03B1), label: 'alpha', cat: 'greek' },
  { ch: U(0x03B2), label: 'beta', cat: 'greek' },
  { ch: U(0x03B3), label: 'gamma', cat: 'greek' },
  { ch: U(0x03B4), label: 'delta', cat: 'greek' },
  { ch: U(0x03BB), label: 'lambda', cat: 'greek' },
  { ch: U(0x03BC), label: 'mu', cat: 'greek' },
  { ch: U(0x03A9), label: 'Omega', cat: 'greek' },
  { ch: U(0x03A3), label: 'Sigma', cat: 'greek' },
  { ch: U(0x03B8), label: 'theta', cat: 'greek' },
  { ch: U(0x03C6), label: 'phi', cat: 'greek' },
  { ch: U(0x03C8), label: 'psi', cat: 'greek' },
  { ch: U(0x03C9), label: 'omega', cat: 'greek' },
];

/**
 * Resolve the character set from config. Accepts either the plugin's rich
 * [{ch,label,cat}] entries or a plain array of single-char strings (Jodit-
 * style), which we wrap into {ch,label:ch}. A custom set with no `cat` fields
 * renders as a single flat grid (no tabs) — backward compatible.
 */
export function resolveSpecialChars(configValue) {
  if (!Array.isArray(configValue) || configValue.length === 0) return DEFAULT_SPECIAL_CHARS;
  return configValue.map((entry) =>
    (typeof entry === 'string') ? { ch: entry, label: entry } : entry);
}

/** True when EVERY item carries a `cat` — only then are category tabs shown. */
export function hasCategories(items) {
  return Array.isArray(items) && items.length > 0 && items.every((it) => !!it.cat);
}
