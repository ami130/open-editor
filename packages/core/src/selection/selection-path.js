/**
 * Index-path helpers for SelectionManager bookmarks.
 *
 * A bookmark stores selection boundaries as arrays of child-node indices from
 * the editor root down to each container node — a serializable position that
 * survives DOM mutations which don't delete the node itself. Extracted from
 * selection-manager.js to keep that file within the 300-line limit.
 */

/**
 * Returns an index path array from editorEl down to `node`, or null if node is
 * not inside the editor. Path is root→leaf order: [idx level 1, idx level 2, …].
 */
export function getPath(editorEl, node) {
  if (!node || !editorEl) return null;
  if (node === editorEl) return [];

  const indices = [];
  let current = node;
  while (current && current !== editorEl) {
    const parent = current.parentNode;
    if (!parent) return null; // escaped the editor
    const idx = Array.prototype.indexOf.call(parent.childNodes, current);
    if (idx === -1) return null;
    indices.push(idx);
    current = parent;
  }
  if (current !== editorEl) return null;
  return indices.reverse(); // root→leaf order
}

/**
 * Resolves an index path back to a node, starting from editorEl.
 * Returns null if any step is out of bounds (stale path).
 */
export function resolvePath(editorEl, path) {
  if (!path || !editorEl) return null;
  if (path.length === 0) return editorEl;
  let node = editorEl;
  for (const idx of path) {
    if (!node.childNodes || idx >= node.childNodes.length) return null;
    node = node.childNodes[idx];
  }
  return node;
}

/**
 * Returns the valid max offset for setStart/setEnd calls on a node.
 * Text nodes: nodeValue.length. Element nodes: childNodes.length.
 */
export function nodeLength(node) {
  if (node.nodeType === 3 /* TEXT_NODE */) {
    return node.nodeValue ? node.nodeValue.length : 0;
  }
  return node.childNodes ? node.childNodes.length : 0;
}

/**
 * Builds an index-path bookmark from a SelectionManager.get() info object.
 * Returns null when the start container can't be pathed (outside editor).
 */
export function saveBookmark(editorEl, info) {
  if (!info) return null;
  const { range, collapsed } = info;
  const startPath = getPath(editorEl, range.startContainer);
  if (!startPath) return null;
  const endPath = collapsed ? startPath.slice() : getPath(editorEl, range.endContainer);
  return {
    startPath,
    startOffset: range.startOffset,
    endPath: endPath || startPath.slice(),
    endOffset: collapsed ? range.startOffset : range.endOffset,
    collapsed,
    // H4 fix: keep a DIRECT reference to the boundary nodes. The index path is
    // serializable but fragile — inserting/removing a PRECEDING sibling shifts
    // the indices, so the same path resolves to a different node after a command
    // mutates the DOM before the bookmarked position. On restore we prefer the
    // live node (when still attached to the editor) and fall back to the path
    // only if it was detached. Refs are non-serializable, which is fine: a
    // bookmark only lives across a single command's execute/restore in memory.
    startNode: range.startContainer,
    endNode: collapsed ? range.startContainer : range.endContainer,
  };
}

/**
 * Restores a bookmark into the live selection. Falls back to an end-of-editor
 * caret when the path is stale. Mirrors the Safari-safe removeAllRanges+addRange
 * contract of the rest of SelectionManager.
 */
// Prefer the live boundary node when it is still attached to the editor; only
// fall back to the (fragile) index path when the node was removed. `contains`
// returns true for the element itself, so an editorEl boundary also resolves.
function resolveBoundary(editorEl, liveNode, path) {
  if (liveNode && editorEl.contains(liveNode)) return liveNode;
  return resolvePath(editorEl, path);
}

export function restoreBookmark(win, doc, editorEl, bookmark) {
  if (!bookmark || !editorEl || !win || !doc) return;
  const startNode = resolveBoundary(editorEl, bookmark.startNode, bookmark.startPath);
  const endNode = bookmark.collapsed
    ? startNode
    : resolveBoundary(editorEl, bookmark.endNode, bookmark.endPath);

  const range = doc.createRange();
  try {
    if (startNode) {
      range.setStart(startNode, Math.min(bookmark.startOffset, nodeLength(startNode)));
    } else {
      range.selectNodeContents(editorEl);
      range.collapse(false);
    }
    // Only extend to the bookmarked end when START resolved cleanly. If startNode
    // was stale we already placed the caret at end-of-editor; applying a valid
    // endNode there builds a reversed range the DOM re-collapses to the wrong spot.
    if (startNode && !bookmark.collapsed && endNode) {
      range.setEnd(endNode, Math.min(bookmark.endOffset, nodeLength(endNode)));
    } else {
      range.collapse(true);
    }
  } catch {
    try {
      range.selectNodeContents(editorEl);
      range.collapse(false);
    } catch { return; }
  }

  const sel = win.getSelection();
  if (!sel) return;
  sel.removeAllRanges();
  sel.addRange(range);
}
