/**
 * autoformat-patterns.js — Phase 16.6.2: pure pattern-matching, no DOM.
 *
 * Two pattern families, because they trigger differently:
 *   - BLOCK patterns match at the very start of a block's text, right after the
 *     user types a trailing space (e.g. "# " -> heading). Checked on `input`.
 *   - INLINE patterns match a marker pair that just closed (e.g. the second
 *     "**" of "**bold**"). Checked on `input` against the text up to the caret.
 */

// { re, command } — re must match the WHOLE text-before-caret in the block
// (so "# " only fires when nothing precedes it), capturing nothing extra.
export const BLOCK_PATTERNS = [
  { re: /^#{1}\s$/, command: 'h1' },
  { re: /^#{2}\s$/, command: 'h2' },
  { re: /^#{3}\s$/, command: 'h3' },
  // 16.7.3 — checked BEFORE the plain "- "/"* " bullet-list pattern below, so
  // "[x] " (or "[ ] ") is read as one whole token, not "[" as literal text
  // followed by a bullet trigger on "x] ".
  { re: /^\[ \]\s$/, command: 'todoList' },
  { re: /^\[[xX]\]\s$/, command: 'todoListChecked' },
  { re: /^[-*]\s$/, command: 'ul' },
  { re: /^1\.\s$/, command: 'ol' },
  { re: /^>\s$/, command: 'blockquote' },
  { re: /^```$/, command: 'pre' },
];

/** Match text-before-caret against BLOCK_PATTERNS; returns { command, matchLength } | null. */
export function matchBlockPattern(textBeforeCaret) {
  for (const { re, command } of BLOCK_PATTERNS) {
    if (re.test(textBeforeCaret)) return { command, matchLength: textBeforeCaret.length };
  }
  return null;
}

// Inline marker pairs. `marker` is what must immediately precede the caret
// (the just-typed closing marker); the OPENING instance of the same marker
// earlier in the text starts the formatted span. `minInner` guards against
// "****" (empty bold) triggering on nothing.
const INLINE_MARKERS = [
  { marker: '**', command: 'bold' },
  { marker: '__', command: 'bold' },
  { marker: '`', command: 'inlineCode' },
  // Single "*"/"_" (italic) checked AFTER the double-char markers above so
  // "**bold**" is not misread as two adjacent italic matches.
  { marker: '*', command: 'italic' },
  { marker: '_', command: 'italic' },
];

/**
 * Look for a just-closed inline marker pair ending at `textBeforeCaret`'s end.
 * Returns { command, start, end, contentStart, contentEnd } where start/end are
 * offsets of the FULL matched span (markers included) and contentStart/End are
 * the offsets of the text BETWEEN the markers — or null if nothing matches.
 */
export function matchInlinePattern(textBeforeCaret) {
  for (const { marker, command } of INLINE_MARKERS) {
    if (!textBeforeCaret.endsWith(marker)) continue;
    const beforeClose = textBeforeCaret.slice(0, -marker.length);
    const openIdx = beforeClose.lastIndexOf(marker);
    if (openIdx === -1) continue;
    const contentStart = openIdx + marker.length;
    const contentEnd = beforeClose.length;
    if (contentEnd <= contentStart) continue; // no content between markers
    if (marker === '*' || marker === '_') {
      // Single-char markers only: the content must not itself start/end with
      // the same marker char (that's the double-char bold case, handled by
      // its own earlier entry). CRITICALLY, also reject when the character
      // immediately BEFORE the found opening marker is the same marker — that
      // means what we matched as "the opening *" is really the second half of
      // an in-progress "**" pair (typing "**bold*" char-by-char hits exactly
      // this: 7 chars in, a naive scan finds "*bold*" and fires italic FIRST,
      // stranding the outer "**"). Live-typing bug, only reproducible in a
      // real browser — jsdom's single-shot `input` event never triggers it.
      const inner = beforeClose.slice(contentStart, contentEnd);
      if (inner.startsWith(marker) || inner.endsWith(marker)) continue;
      if (openIdx > 0 && beforeClose[openIdx - 1] === marker) continue;
    }
    return { command, start: openIdx, end: textBeforeCaret.length, contentStart, contentEnd };
  }
  return null;
}
