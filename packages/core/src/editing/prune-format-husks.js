/**
 * prune-format-husks.js — remove leftover "pending format" husks (LOW audit fix).
 *
 * Toggling an inline format (bold/italic/color…) at a COLLAPSED caret inserts an
 * empty wrapper holding a single zero-width space, so the next typed character is
 * formatted (Word/Jodit behaviour). If the user moves the caret away without
 * typing, that ZWSP-only wrapper is left behind in the live DOM. It serializes
 * away (getHTML strips ZWSP) but accumulates across a session, bloating the DOM.
 *
 * On each selection change we drop every such husk EXCEPT the one the caret is
 * currently inside — that one is the active pending-format wrapper.
 */

const FMT_TAGS = new Set([
  'strong', 'b', 'em', 'i', 'u', 's', 'del', 'strike', 'sup', 'sub',
  'code', 'span', 'mark', 'abbr', 'cite', 'q', 'small', 'ins', 'font',
]);
const ZWSP_ONLY = /^[\u200B\u200C\u2060\uFEFF]+$/;

// True when el is an inline-format element whose entire text content is nothing
// but zero-width characters (a husk with no real content).
function isHusk(el) {
  if (!el || el.nodeType !== 1) return false;
  if (!FMT_TAGS.has(el.tagName.toLowerCase())) return false;
  const text = el.textContent || '';
  return text.length > 0 && ZWSP_ONLY.test(text);
}

/**
 * Remove all format husks under `root` except any that contains `keepNode`
 * (the caret's current container — that husk is still in use).
 */
export function pruneFormatHusks(root, keepNode) {
  if (!root || !root.querySelectorAll) return;
  const candidates = [];
  for (const tag of FMT_TAGS) {
    for (const el of root.querySelectorAll(tag)) {
      if (isHusk(el) && !(keepNode && el.contains(keepNode))) candidates.push(el);
    }
  }
  // Remove deepest-first (by ancestor depth) so removing an outer husk doesn't
  // orphan an inner one still in the list before we reach it.
  const depth = (el) => { let d = 0, n = el; while ((n = n.parentNode)) d++; return d; };
  candidates.sort((a, b) => depth(b) - depth(a));
  for (const el of candidates) {
    if (el.parentNode) el.parentNode.removeChild(el);
  }
}
