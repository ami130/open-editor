/**
 * search-core.js — Phase 13.2: pure find/replace logic over the editor's text.
 *
 * All functions here are pure DOM operations with NO highlighting and NO UI, so
 * they are fully unit-testable in jsdom (which lacks the CSS Custom Highlight
 * API used for visual highlighting elsewhere).
 *
 *   findMatches(root, query, opts)   → [{ node, start, end }] across text nodes
 *   buildMatchRange(match, doc)      → a DOM Range for a match (for highlight/scroll)
 *   replaceMatch(match, replacement) → replace one match's text in place
 *   replaceAll(root, query, replacement, opts) → replace every match; returns count
 *
 * Matching is literal (not regex) and case-insensitive by default. Matches are
 * found per text node — a query spanning element boundaries is intentionally
 * NOT matched (keeps replacement safe and predictable; mirrors common editors).
 */

// Is `node` inside a hidden subtree (display:none / hidden attr / aria-hidden),
// OR inside a non-editable island (contenteditable="false", e.g. an image
// figure — nearest ancestor with an explicit contentEditable value wins, so a
// contenteditable="true" caption inside the island is correctly NOT skipped)?
// Matches in hidden/non-editable content can't be scrolled to or replaced
// safely, so search skips them (audit MEDIUM + follow-up). Code blocks (<pre>)
// are intentionally NOT skipped — searching/replacing inside code is legitimate.
function inHiddenSubtree(node, doc) {
  const win = (doc && doc.defaultView) || (typeof window !== 'undefined' ? window : null);
  let el = node.parentElement;
  // isContentEditable isn't implemented in jsdom (always undefined), so walk
  // the explicit contenteditable="true|false" attribute manually — nearest
  // ancestor with an explicit value wins, matching real browser inheritance.
  while (el) {
    if (el.hidden || el.getAttribute('aria-hidden') === 'true') return true;
    const ce = el.getAttribute && el.getAttribute('contenteditable');
    if (ce === 'false') return true;
    if (ce === 'true') break; // nearer explicit "true" re-enables — stop here
    if (win && win.getComputedStyle) {
      const cs = win.getComputedStyle(el);
      if (cs && (cs.display === 'none' || cs.visibility === 'hidden')) return true;
    }
    el = el.parentElement;
  }
  return false;
}

// Text nodes that hold real, searchable content (skip empty/whitespace-only and
// text inside hidden subtrees).
function textNodesUnder(root, doc) {
  const out = [];
  if (!root) return out;
  const d = doc || root.ownerDocument;
  const walker = d.createTreeWalker(root, 4 /* SHOW_TEXT */);
  let n;
  while ((n = walker.nextNode())) {
    if (!n.nodeValue || !n.nodeValue.length) continue;
    if (inHiddenSubtree(n, d)) continue;
    out.push(n);
  }
  return out;
}

// 16.7.4 — a "word" character for the whole-word boundary check: letters,
// digits, underscore (matches the common \w definition every other editor's
// whole-word toggle uses). A match only counts when the character immediately
// before/after it is EITHER absent (string edge) or a non-word character —
// so searching "cat" with whole-word on matches "a cat sat" but not "category".
function isWordChar(ch) {
  return !!ch && /[\p{L}\p{N}_]/u.test(ch);
}

function isWholeWordMatch(hay, start, end) {
  const before = start > 0 ? hay[start - 1] : '';
  const after = end < hay.length ? hay[end] : '';
  return !isWordChar(before) && !isWordChar(after);
}

/**
 * Find all literal occurrences of `query` within `root`, per text node.
 * opts.wholeWord (default false) additionally requires a non-word-character
 * (or string edge) on both sides of the match.
 * @returns {Array<{node: Text, start: number, end: number}>}
 */
export function findMatches(root, query, opts = {}) {
  const matches = [];
  if (!root || typeof query !== 'string' || query === '') return matches;
  const cs = !!opts.caseSensitive;
  const ww = !!opts.wholeWord;
  const doc = opts.document || root.ownerDocument;
  const needle = cs ? query : query.toLowerCase();

  for (const node of textNodesUnder(root, doc)) {
    const hay = cs ? node.nodeValue : node.nodeValue.toLowerCase();
    let from = 0;
    let idx;
    while ((idx = hay.indexOf(needle, from)) !== -1) {
      const end = idx + query.length;
      if (!ww || isWholeWordMatch(hay, idx, end)) {
        matches.push({ node, start: idx, end });
      }
      from = idx + query.length; // non-overlapping
    }
  }
  return matches;
}

/** Build a DOM Range covering a match (for highlighting / scroll-into-view). */
export function buildMatchRange(match, doc) {
  if (!match || !match.node) return null;
  const d = doc || match.node.ownerDocument;
  try {
    const r = d.createRange();
    r.setStart(match.node, match.start);
    r.setEnd(match.node, match.end);
    return r;
  } catch { return null; }
}

/**
 * Replace a single match's text in place. Splits the text node so surrounding
 * text is untouched. Returns the Text node now holding the replacement (for
 * re-search), or null.
 */
export function replaceMatch(match, replacement) {
  if (!match || !match.node || match.node.nodeType !== 3) return null;
  const node = match.node;
  const value = node.nodeValue;
  if (match.start < 0 || match.end > value.length) return null;
  node.nodeValue = value.slice(0, match.start) + String(replacement) + value.slice(match.end);
  return node;
}

/**
 * Replace EVERY occurrence of `query` with `replacement` under `root`.
 * Operates per text node, rewriting the whole node value in one pass so indices
 * never drift. opts.wholeWord (default false) applies the same boundary check
 * as findMatches. Returns the number of replacements made.
 */
export function replaceAll(root, query, replacement, opts = {}) {
  if (!root || typeof query !== 'string' || query === '') return 0;
  const cs = !!opts.caseSensitive;
  const ww = !!opts.wholeWord;
  const doc = opts.document || root.ownerDocument;
  let count = 0;

  for (const node of textNodesUnder(root, doc)) {
    const value = node.nodeValue;
    const hay = cs ? value : value.toLowerCase();
    const needle = cs ? query : query.toLowerCase();
    if (hay.indexOf(needle) === -1) continue;

    let result = '';
    let from = 0;
    let idx;
    while ((idx = hay.indexOf(needle, from)) !== -1) {
      const end = idx + query.length;
      if (ww && !isWholeWordMatch(hay, idx, end)) {
        // Not a whole-word match: keep this occurrence's text as-is and
        // continue scanning right after it (still non-overlapping).
        result += value.slice(from, end);
        from = end;
        continue;
      }
      result += value.slice(from, idx) + String(replacement);
      from = end;
      count++;
    }
    result += value.slice(from);
    node.nodeValue = result;
  }
  return count;
}
