/**
 * selection-insert.js — insertAtCursor()/selectAll() logic for SelectionManager,
 * split out to keep selection-manager.js under the 300-line limit.
 */
import { getParentBlock } from './range-utils.js';

// Void elements can't hold children. A caret can still land with one of these
// as the range's startContainer (e.g. clicking into an empty editor puts the
// browser's caret ON the placeholder <br> in <p><br></p>). insertNode() at
// such a range inserts the new node AS A CHILD of the void element instead of
// beside it — invalid, invisible, and dropped by getHTML()'s serialization.
const VOID_TAGS = new Set(['BR', 'IMG', 'HR', 'INPUT']);

// Inline-content-only containers: a BLOCK-level node (figure/pre/table/etc.)
// must never be inserted as a CHILD of one of these — the browser silently
// repairs the invalid nesting by splitting the container, scattering the
// caller's insert across fragments (e.g. <p><br></p><figure>...</figure><br>
// <p><br></p> instead of one clean sibling insert).
const INLINE_CONTAINER_TAGS = new Set(['P', 'DIV']);

function isBlockLevelNode(node) {
  return node.nodeType === 1 && ['FIGURE', 'PRE', 'TABLE', 'BLOCKQUOTE', 'UL', 'OL', 'HR'].includes(node.tagName);
}

function normalizeInsertionRange(range, nodeToInsert, editorEl) {
  const { startContainer } = range;
  if (startContainer.nodeType === 1 && VOID_TAGS.has(startContainer.tagName)) {
    const parent = startContainer.parentNode;
    if (parent) {
      const index = Array.prototype.indexOf.call(parent.childNodes, startContainer);
      range.setStart(parent, index);
      range.setEnd(parent, index);
    }
  }
  // Re-check after the void-element hop above: a block-level insert whose
  // caret block is a plain <p>/<div> must land AFTER that block, not inside it.
  if (nodeToInsert && isBlockLevelNode(nodeToInsert) && editorEl) {
    const container = range.startContainer.nodeType === 1
      ? range.startContainer
      : range.startContainer.parentNode;
    const block = getParentBlock(container, editorEl);
    if (block && INLINE_CONTAINER_TAGS.has(block.tagName) && block.parentNode) {
      const index = Array.prototype.indexOf.call(block.parentNode.childNodes, block);
      // Empty <p><br></p>: replace it outright rather than leaving a dangling
      // empty paragraph before the block content.
      const isEmpty = block.textContent === '' && !block.querySelector('img, iframe, [data-oe-island]');
      const parent = block.parentNode;
      if (isEmpty) {
        block.remove();
        // Range boundaries pointing at the now-removed `block` would be stale;
        // rebuild the range purely in terms of `parent` + the original index.
        range.setStart(parent, index);
        range.setEnd(parent, index);
      } else {
        range.setStart(parent, index + 1);
        range.setEnd(parent, index + 1);
      }
    }
  }
}

/**
 * Deletes any selected content then inserts htmlOrNode at the caret.
 * Places the cursor immediately after the inserted content.
 */
export function insertAtCursor(manager, htmlOrNode) {
  if (!manager._editorEl) return;
  // An empty string must be a no-op — otherwise deleteContents() below would
  // silently delete the user's selection while inserting nothing.
  if (typeof htmlOrNode === 'string' && htmlOrNode === '') return;
  const win = manager._getWindow();
  if (!win) return;
  const sel = win.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const doc = manager._iframeDoc || (typeof document !== 'undefined' ? document : null);
  if (!doc) return;

  const range = sel.getRangeAt(0).cloneRange();
  const nodeToInsert = (htmlOrNode != null && typeof htmlOrNode === 'object' && 'nodeType' in htmlOrNode) ? htmlOrNode : null;
  normalizeInsertionRange(range, nodeToInsert, manager._editorEl);

  if (typeof htmlOrNode === 'string') {
    // String path: delete selection, insert parsed HTML.
    range.deleteContents();
    const tmp = doc.createElement('div');
    tmp.innerHTML = htmlOrNode;
    const frag = doc.createDocumentFragment();
    let lastNode = null;
    while (tmp.firstChild) {
      lastNode = tmp.firstChild;
      frag.appendChild(lastNode);
    }
    range.insertNode(frag);
    if (lastNode) {
      range.setStartAfter(lastNode);
      range.collapse(true);
    } else {
      range.collapse(true);
    }
  } else if (htmlOrNode != null && typeof htmlOrNode === 'object' && 'nodeType' in htmlOrNode) {
    // Element node path (C-1 fix): if the selection is non-collapsed and the
    // target is an element wrapper (e.g. <span>, <code>), MOVE the selected
    // content INTO the wrapper first so it is preserved, then insert the
    // now-populated wrapper in place.  The old code called deleteContents()
    // unconditionally which wiped the selection before inserting an empty node.
    if (htmlOrNode.nodeType === 1 && !range.collapsed) {
      const frag = range.extractContents(); // moves selected nodes into frag
      htmlOrNode.appendChild(frag);
      range.insertNode(htmlOrNode);
      range.selectNodeContents(htmlOrNode);
    } else {
      // Collapsed selection or non-element node: just insert at caret.
      range.deleteContents();
      range.insertNode(htmlOrNode);
      if (htmlOrNode.nodeType === 1 && htmlOrNode.childNodes.length === 0) {
        // Empty element (e.g. freshly-created <code>) — place cursor inside.
        range.setStart(htmlOrNode, 0);
        range.collapse(true);
      } else {
        range.setStartAfter(htmlOrNode);
        range.collapse(true);
      }
    }
  }

  sel.removeAllRanges();
  sel.addRange(range);
}

export function selectAll(manager) {
  if (!manager._editorEl) return;
  const win = manager._getWindow();
  if (!win) return;
  const doc = manager._iframeDoc || (typeof document !== 'undefined' ? document : null);
  if (!doc) return;
  const range = doc.createRange();
  range.selectNodeContents(manager._editorEl);
  const sel = win.getSelection();
  if (!sel) return;
  sel.removeAllRanges();
  sel.addRange(range);
}
