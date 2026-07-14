const BLOCK_TAGS = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'pre', 'li', 'td', 'th', 'div',
  'figure', 'figcaption', 'dl', 'dt', 'dd',
  'table', 'thead', 'tbody', 'tfoot', 'tr',
  'ul', 'ol',
]);

/**
 * Walks node up to (but not including) root.
 * Returns first node (starting from node itself) where predicate returns true, or null.
 */
export function walkUp(node, root, predicate) {
  if (!node || !root) return null;
  let current = node;
  while (current && current !== root) {
    if (predicate(current)) return current;
    current = current.parentNode;
  }
  return null;
}

/**
 * Returns the nearest ancestor element (including node itself) with the given tag name, or null.
 */
export function getClosestTag(node, tag, root) {
  if (!node || !tag || !root) return null;
  const lower = tag.toLowerCase();
  return walkUp(node, root, (n) => n.nodeType === 1 && n.tagName.toLowerCase() === lower);
}

/**
 * Returns the nearest ancestor that is a block element (including node itself), or null.
 */
export function getParentBlock(node, root) {
  if (!node || !root) return null;
  return walkUp(node, root, (n) => n.nodeType === 1 && BLOCK_TAGS.has(n.tagName.toLowerCase()));
}

/**
 * Returns true if node is inside (or is) an element with the given tag name.
 */
export function isInsideTag(node, tag, root) {
  return getClosestTag(node, tag, root) !== null;
}

/**
 * Descends from `node` to its deepest leaf, following the chosen edge.
 *   edge 'first' (default) → first-child chain (start of the subtree)
 *   edge 'last'            → last-child chain  (end of the subtree)
 * Returns the leaf (a text node, void element, or childless element). Returns
 * `node` itself when it has no children. Used by selection/commands/plugins to
 * place a caret at the true start or end of a block rather than on the wrapper.
 */
export function getDeepestNode(node, edge = 'first') {
  if (!node) return null;
  let current = node;
  const next = edge === 'last' ? 'lastChild' : 'firstChild';
  while (current[next]) current = current[next];
  return current;
}
