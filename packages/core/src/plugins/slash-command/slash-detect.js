/**
 * slash-detect.js — Phase 16.6.1: pure trigger-detection logic, kept separate
 * from the plugin/DOM wiring so it is directly unit-testable.
 *
 * detectSlashTrigger(block, node, offset) → { query } | null
 *   `block` is the current block element (from getParentBlock).
 *   `node`/`offset` are the caret's text container + offset within it.
 * Returns null when the caret is not in "slash mode": a slash-triggered
 * sequence must start at the very beginning of the block's text (so `/` mid-
 * sentence never opens the palette), contain no whitespace after the `/`
 * (a space cancels slash mode, matching Notion/CKEditor), and the caret must
 * still be inside that same run of text (not after a later element).
 */
export function detectSlashTrigger(block, node, offset) {
  if (!block || !node || node.nodeType !== 3) return null;
  // The text node holding the slash sequence must be the block's FIRST child
  // (or the block's only child) — i.e. nothing else precedes it in the block.
  if (node.parentNode !== block || block.firstChild !== node) return null;
  const text = node.nodeValue.slice(0, offset);
  if (!text.startsWith('/')) return null;
  const query = text.slice(1);
  if (/\s/.test(query)) return null; // any whitespace after '/' cancels slash mode
  return { query };
}
