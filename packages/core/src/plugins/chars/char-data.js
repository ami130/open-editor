/**
 * char-data.js — Phase 13.3: the default Special Characters set.
 *
 * A curated set covering the categories users actually reach for: punctuation &
 * typography, currency, math/logic, arrows, and accented Latin + Greek letters.
 * Integrators can replace it wholesale via config `specialCharacters` (an array
 * of single-character strings), mirroring Jodit's `specialCharacters` option.
 *
 * Each entry is { ch, label } where `ch` is inserted verbatim and `label` is
 * the tooltip / search text. Characters are written as \u escapes where they
 * are non-ASCII so the source stays free of literal exotic glyphs.
 */
const U = String.fromCharCode;

export const DEFAULT_SPECIAL_CHARS = [
  // Punctuation & typography
  { ch: U(0x2013), label: 'En dash' },
  { ch: U(0x2014), label: 'Em dash' },
  { ch: U(0x2018), label: 'Left single quote' },
  { ch: U(0x2019), label: 'Right single quote' },
  { ch: U(0x201C), label: 'Left double quote' },
  { ch: U(0x201D), label: 'Right double quote' },
  { ch: U(0x2026), label: 'Ellipsis' },
  { ch: U(0x2022), label: 'Bullet' },
  { ch: U(0x00B7), label: 'Middle dot' },
  { ch: U(0x2020), label: 'Dagger' },
  { ch: U(0x2021), label: 'Double dagger' },
  { ch: U(0x00A7), label: 'Section' },
  { ch: U(0x00B6), label: 'Pilcrow' },
  { ch: U(0x2032), label: 'Prime' },
  { ch: U(0x2033), label: 'Double prime' },
  // Currency
  { ch: U(0x20AC), label: 'Euro' },
  { ch: U(0x00A3), label: 'Pound' },
  { ch: U(0x00A5), label: 'Yen' },
  { ch: U(0x00A2), label: 'Cent' },
  { ch: U(0x20B9), label: 'Rupee' },
  { ch: U(0x20BD), label: 'Ruble' },
  { ch: U(0x00A4), label: 'Currency sign' },
  // Legal / symbols
  { ch: U(0x00A9), label: 'Copyright' },
  { ch: U(0x00AE), label: 'Registered' },
  { ch: U(0x2122), label: 'Trademark' },
  { ch: U(0x2117), label: 'Sound recording copyright' },
  { ch: U(0x00B0), label: 'Degree' },
  // Math / logic
  { ch: U(0x00D7), label: 'Multiplication' },
  { ch: U(0x00F7), label: 'Division' },
  { ch: U(0x00B1), label: 'Plus-minus' },
  { ch: U(0x2260), label: 'Not equal' },
  { ch: U(0x2264), label: 'Less than or equal' },
  { ch: U(0x2265), label: 'Greater than or equal' },
  { ch: U(0x2248), label: 'Approximately equal' },
  { ch: U(0x221E), label: 'Infinity' },
  { ch: U(0x221A), label: 'Square root' },
  { ch: U(0x2211), label: 'Summation' },
  { ch: U(0x220F), label: 'Product' },
  { ch: U(0x222B), label: 'Integral' },
  { ch: U(0x2202), label: 'Partial differential' },
  { ch: U(0x2206), label: 'Delta' },
  { ch: U(0x03C0), label: 'Pi' },
  { ch: U(0x00BC), label: 'One quarter' },
  { ch: U(0x00BD), label: 'One half' },
  { ch: U(0x00BE), label: 'Three quarters' },
  // Arrows
  { ch: U(0x2190), label: 'Left arrow' },
  { ch: U(0x2191), label: 'Up arrow' },
  { ch: U(0x2192), label: 'Right arrow' },
  { ch: U(0x2193), label: 'Down arrow' },
  { ch: U(0x2194), label: 'Left-right arrow' },
  { ch: U(0x21D0), label: 'Left double arrow' },
  { ch: U(0x21D2), label: 'Right double arrow' },
  { ch: U(0x21D4), label: 'Left-right double arrow' },
  // Accented Latin (common)
  { ch: U(0x00E9), label: 'e acute' },
  { ch: U(0x00E8), label: 'e grave' },
  { ch: U(0x00EA), label: 'e circumflex' },
  { ch: U(0x00E7), label: 'c cedilla' },
  { ch: U(0x00F1), label: 'n tilde' },
  { ch: U(0x00FC), label: 'u umlaut' },
  { ch: U(0x00F6), label: 'o umlaut' },
  { ch: U(0x00E4), label: 'a umlaut' },
  { ch: U(0x00E5), label: 'a ring' },
  { ch: U(0x00DF), label: 'sharp s' },
  { ch: U(0x00E0), label: 'a grave' },
  { ch: U(0x00E1), label: 'a acute' },
  { ch: U(0x00BF), label: 'Inverted question mark' },
  { ch: U(0x00A1), label: 'Inverted exclamation mark' },
  // Greek (common)
  { ch: U(0x03B1), label: 'alpha' },
  { ch: U(0x03B2), label: 'beta' },
  { ch: U(0x03B3), label: 'gamma' },
  { ch: U(0x03B4), label: 'delta' },
  { ch: U(0x03BB), label: 'lambda' },
  { ch: U(0x03BC), label: 'mu' },
  { ch: U(0x03A9), label: 'Omega' },
  { ch: U(0x03A3), label: 'Sigma' },
];

/**
 * Resolve the character set from config. Accepts either the plugin's rich
 * [{ch,label}] entries or a plain array of single-char strings (Jodit-style),
 * which we wrap into {ch,label:ch}.
 */
export function resolveSpecialChars(configValue) {
  if (!Array.isArray(configValue) || configValue.length === 0) return DEFAULT_SPECIAL_CHARS;
  return configValue.map((entry) =>
    (typeof entry === 'string') ? { ch: entry, label: entry } : entry);
}
