/**
 * inline-block-wrap.js — helpers for applying an inline format across a
 * selection that spans MULTIPLE block elements. Extracted from text-commands.js
 * (300-line limit). An inline tag must never wrap block elements
 * (<strong><p>…</p></strong> is invalid); when a selection crosses a block
 * boundary we format the content INSIDE each leaf block instead.
 */
import { walkUp } from '../selection/range-utils.js';

export const BLOCK_TAGS_SET = new Set([
  'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'pre', 'td', 'th',
]);

/**
 * True when the range must be formatted PER-BLOCK rather than wrapped in one
 * inline tag (which would nest blocks inside <strong> etc). Two cases:
 *   1. start and end sit in DIFFERENT block elements (a genuine cross-block span).
 *   2. a boundary sits directly on a block CONTAINER (the editor root or a
 *      <div>/<td>…) — e.g. Select-All gives root[0]→root[1], so the range covers
 *      whole <p> blocks even though start==end container. Wrapping that range
 *      pulls the <p> itself into the inline tag. (Regression fix: the earlier
 *      `commonAncestorContainer === root` check caught Select-All; the switch to
 *      a start!==end-block test lost it for a single selected block.)
 */
export function rangeCrossesBlocks(range, root) {
  const blockOf = (node) => walkUp(node, root, (n) =>
    n.nodeType === 1 && BLOCK_TAGS_SET.has(n.tagName.toLowerCase()));
  const sb = blockOf(range.startContainer);
  const eb = blockOf(range.endContainer);
  if (sb && eb && sb !== eb) return true;
  // Case 2: a boundary is NOT inside any leaf block (it's on the root or a block
  // container). If the selected content contains ≥1 block element, treat it as
  // block-crossing so we format inside each block instead of wrapping them.
  if (!sb || !eb) {
    const blocks = Array.from(root.querySelectorAll(Array.from(BLOCK_TAGS_SET).join(',')));
    if (blocks.some((b) => { try { return range.intersectsNode(b); } catch { return false; } })) {
      return true;
    }
  }
  return false;
}

/**
 * Apply `tag` INSIDE each leaf block the range intersects (not around them).
 * A container block (e.g. a <div> holding the selected <p>s) is skipped, so its
 * contents don't get an extra outer wrapper around the per-block wraps.
 */
export function wrapBlocksInline(root, range, tag, doc, nativeSel) {
  const all = Array.from(root.querySelectorAll(Array.from(BLOCK_TAGS_SET).join(',')))
    .filter((b) => range.intersectsNode(b));
  const blocks = all.filter((b) => !all.some((o) => o !== b && b.contains(o)));
  if (!blocks.length) return;
  let firstWrapper = null;
  let lastWrapper = null;
  for (const block of blocks) {
    const blockRange = doc.createRange();
    blockRange.selectNodeContents(block);
    const wrapper = doc.createElement(tag);
    wrapper.appendChild(blockRange.extractContents());
    blockRange.insertNode(wrapper);
    if (!firstWrapper) firstWrapper = wrapper;
    lastWrapper = wrapper;
  }
  if (firstWrapper && lastWrapper && nativeSel) {
    try {
      const r = doc.createRange();
      r.setStart(firstWrapper, 0);
      r.setEndAfter(lastWrapper.lastChild || lastWrapper);
      nativeSel.removeAllRanges();
      nativeSel.addRange(r);
    } catch { /* ignore */ }
  }
}
