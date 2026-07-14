/**
 * block-reorder.js — Phase 16.6.4: pure DOM primitives for reordering a
 * TOP-LEVEL block (a direct child of the editable root) relative to a sibling.
 *
 * Deliberately narrower than range-utils.js's BLOCK_TAGS (which includes
 * table cells/rows/figcaptions for selection purposes) — only direct children
 * of the editable are reorderable here; dragging never reaches inside a table
 * or figure.
 */
const REORDERABLE_TAGS = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'pre', 'ul', 'ol', 'table', 'figure', 'hr', 'div',
]);

/** Is `node` a direct child of `root` that qualifies as a reorderable block? */
export function isReorderableBlock(node, root) {
  return !!(node && node.nodeType === 1 && node.parentNode === root &&
    REORDERABLE_TAGS.has(node.tagName.toLowerCase()));
}

/** All direct-child reorderable blocks of `root`, in document order. */
export function getReorderableBlocks(root) {
  if (!root) return [];
  return Array.from(root.children).filter((el) => REORDERABLE_TAGS.has(el.tagName.toLowerCase()));
}

/**
 * Move `block` to just before `target` (or to the end if target is null).
 * No-op if block === target or target is block's own next sibling already
 * (already in the requested position). Returns true if a move happened.
 */
export function moveBlockBefore(root, block, target) {
  if (!root || !block || block === target) return false;
  if (block.nextSibling === target) return false; // already in place
  if (target) root.insertBefore(block, target);
  else root.appendChild(block);
  return true;
}
