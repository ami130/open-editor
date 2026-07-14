/**
 * text-run.js — 17.5.x shared: reading/merging the text run before the caret.
 *
 * Firefox/WebKit fragment live typing into multiple adjacent TEXT nodes, so
 * "what did the user type before the caret" must be read across the caret
 * node's contiguous preceding text siblings (a non-text sibling — inline
 * markup — still bounds the run). Used by autoformat/text-transformations and
 * the emoji autocomplete; any caret-token feature should go through this.
 */

/** Text before the caret across the contiguous text run, plus the run nodes. */
export function gatherTextBeforeCaret(node, offset) {
  let text = node.nodeValue.slice(0, offset);
  const prefixNodes = [];
  for (let prev = node.previousSibling; prev && prev.nodeType === 3; prev = prev.previousSibling) {
    prefixNodes.unshift(prev);
    text = prev.nodeValue + text;
  }
  return { text, prefixNodes };
}

/**
 * Merge the run into the caret node (prefix nodes removed) so a single-node
 * splice/caret-set works regardless of engine fragmentation. Returns the
 * caret's offset within the merged node given its old offset.
 */
export function mergeTextRun(node, prefixNodes, oldOffset) {
  if (!prefixNodes.length) return oldOffset;
  let prefixLen = 0;
  for (const n of prefixNodes) prefixLen += n.nodeValue.length;
  node.nodeValue = prefixNodes.map((n) => n.nodeValue).join('') + node.nodeValue;
  for (const n of prefixNodes) n.remove();
  return prefixLen + oldOffset;
}
