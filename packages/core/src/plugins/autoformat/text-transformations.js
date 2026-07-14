/**
 * text-transformations.js — 17.5.2: pure autocorrect matching (no DOM).
 *
 * Given the text BEFORE the caret, returns { start, end, replacement } — the
 * slice of that text to replace — or null. The caller does the node surgery.
 *
 * Trigger rules (mirrors CKEditor's free "text transformation" feature):
 *  - symbols   (c)→© (r)→® (tm)→™   — immediately, when ')' completes them
 *  - fractions 1/2 1/4 3/4 → ½ ¼ ¾   — on the FOLLOWING boundary char (space/
 *                                      punctuation), so "1/25" stays typable
 *  - dashes    "-- "→"– "  "--- "→"— " — on the following space; 4+ hyphens
 *                                      (ASCII rules) are left alone
 *  - smartQuotes "→“ ” and '→‘ ’ (and letter'letter → ’) — immediately
 *
 * Each group is independently switchable via config.textTransformations.
 */

const SYMBOLS = [
  { seq: '(c)', replacement: '©' },   // ©
  { seq: '(r)', replacement: '®' },   // ®
  { seq: '(tm)', replacement: '™' },  // ™
];

const FRACTIONS = { '1/2': '½', '1/4': '¼', '3/4': '¾' };

const BOUNDARY = /[\s.,;:!?)\]}]/;
const OPENER_BEFORE = /[\s([{‘“>-]/; // context where a quote OPENS

/** Normalize the config value into per-group booleans. */
export function transformationGroups(cfg) {
  if (cfg === false) return { symbols: false, fractions: false, dashes: false, smartQuotes: false };
  const o = (cfg && typeof cfg === 'object') ? cfg : {};
  return {
    symbols: o.symbols !== false,
    fractions: o.fractions !== false,
    dashes: o.dashes !== false,
    smartQuotes: o.smartQuotes !== false,
  };
}

/**
 * Match against `text` (everything before the caret in the current text node).
 * Returns { start, end, replacement } (offsets into `text`) or null.
 */
export function matchTransformation(text, groups) {
  if (!text) return null;
  const last = text.charAt(text.length - 1);

  // ── symbols: fire the instant ')' completes the sequence ──
  if (groups.symbols && last === ')') {
    for (const { seq, replacement } of SYMBOLS) {
      if (text.toLowerCase().endsWith(seq)) {
        return { start: text.length - seq.length, end: text.length, replacement };
      }
    }
  }

  // ── boundary-triggered groups (fractions, dashes) ──
  if (BOUNDARY.test(last)) {
    const body = text.slice(0, -1);

    if (groups.dashes && body.endsWith('--')) {
      // Longest run wins; 4+ hyphens = deliberate ASCII, leave alone.
      let run = 0;
      for (let i = body.length - 1; i >= 0 && body.charAt(i) === '-'; i--) run++;
      if (run === 3) return { start: body.length - 3, end: body.length, replacement: '—' }; // —
      if (run === 2) return { start: body.length - 2, end: body.length, replacement: '–' }; // –
    }

    if (groups.fractions) {
      for (const [seq, replacement] of Object.entries(FRACTIONS)) {
        if (!body.endsWith(seq)) continue;
        const before = body.charAt(body.length - seq.length - 1);
        if (before && /\d/.test(before)) continue; // part of a larger number (11/2)
        return { start: body.length - seq.length, end: body.length, replacement };
      }
    }
  }

  // ── smart quotes: transform the just-typed quote char ──
  if (groups.smartQuotes && (last === '"' || last === "'")) {
    const prev = text.charAt(text.length - 2);
    const opens = !prev || OPENER_BEFORE.test(prev);
    let replacement;
    if (last === '"') {
      replacement = opens ? '“' : '”';
    } else {
      // letter'letter apostrophe (don't) is always ’.
      replacement = opens ? '‘' : '’';
    }
    return { start: text.length - 1, end: text.length, replacement };
  }

  return null;
}
