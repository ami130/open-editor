/**
 * Pure-DOM list manipulation helpers — no execCommand, no browser quirks.
 * Jodit-inspired: every function takes explicit (doc, root), returns the
 * element it created/modified, never touches selection.
 */

const LIST_TAGS = new Set(['ul', 'ol']);

/** True if el is a <ul> or <ol>. */
export function isList(el) {
  return el && el.nodeType === 1 && LIST_TAGS.has(el.tagName.toLowerCase());
}

/** Walk up from node (inclusive) to root (exclusive), return first match or null. */
export function nearest(node, root, pred) {
  let n = node;
  while (n && n !== root) {
    if (pred(n)) return n;
    n = n.parentNode;
  }
  return null;
}

/** Nearest <li> ancestor (or self) within root. */
export function nearestLi(node, root) {
  return nearest(node, root, (n) => n.nodeType === 1 && n.tagName.toLowerCase() === 'li');
}

/** Nearest <ul> or <ol> ancestor (or self) within root. */
export function nearestList(node, root) {
  return nearest(node, root, (n) => isList(n));
}

/** Deepest first child — used to place cursor inside a newly created element. */
export function deepFirst(node) {
  let n = node;
  while (n && n.nodeType === 1 && n.firstChild) n = n.firstChild;
  return n || node;
}

/**
 * Place collapsed cursor at start of `node` (iframe-safe, never throws).
 */
export function placeCursor(node, editor) {
  if (!editor.selection || typeof editor.selection.getWindow !== 'function') return;
  const win = editor.selection.getWindow();
  if (!win) return;
  const doc = editor._iframeDoc || document;
  try {
    const target = deepFirst(node);
    const range = doc.createRange();
    if (target.nodeType === 3) {
      range.setStart(target, 0);
    } else {
      range.setStartBefore(target);
    }
    range.collapse(true);
    const sel = win.getSelection();
    if (sel) { sel.removeAllRanges(); sel.addRange(range); }
  } catch { /* stale node — ignore */ }
}

/**
 * Return the direct child of root that contains `node`, or null.
 */
export function topBlock(node, root) {
  if (!node || !root) return null;
  let n = node.nodeType === 3 ? node.parentNode : node;
  while (n && n.parentNode !== root) n = n.parentNode;
  return (n && n !== root) ? n : null;
}

// ─── Block collection ─────────────────────────────────────────────────────────

/**
 * Given a Range and the editor root, return every direct-child block of root
 * that the range overlaps (startBlock … endBlock inclusive).
 *
 * Handles three cases:
 *  1. Collapsed range  — returns the single block under the cursor.
 *  2. Range within root children — walks between startBlock and endBlock.
 *  3. range.startContainer === root — resolves by child index (selectNodeContents).
 */
export function getSelectionBlocks(range, root) {
  if (!range || !root) return [];

  function resolveBlock(container, offset) {
    if (container === root) {
      const child = root.childNodes[Math.min(offset, root.childNodes.length - 1)];
      return child || null;
    }
    return topBlock(container, root);
  }

  const startBlock = resolveBlock(range.startContainer, range.startOffset);

  let endBlock;
  if (range.endContainer === root && range.endOffset > 0) {
    endBlock = root.childNodes[range.endOffset - 1] ||
               resolveBlock(range.endContainer, range.endOffset);
  } else {
    endBlock = resolveBlock(range.endContainer, range.endOffset);
  }

  if (!startBlock) return [];
  if (!endBlock || startBlock === endBlock) return [startBlock];

  const blocks = [];
  let inside = false;
  for (const child of Array.from(root.childNodes)) {
    if (child === startBlock) inside = true;
    if (inside) blocks.push(child);
    if (child === endBlock) break;
  }
  return blocks.length > 0 ? blocks : [startBlock];
}

// ─── List wrapping ────────────────────────────────────────────────────────────

// Carry a block's own formatting attributes onto the element that replaces it
// (I7/I8) so alignment/line-height/id/class/dir survive a structural conversion.
// Merges style declarations rather than overwriting, in case `to` already has some.
export function copyBlockAttrs(from, to) {
  if (!from || from.nodeType !== 1 || !to || to.nodeType !== 1) return;
  const style = from.getAttribute && from.getAttribute('style');
  if (style) {
    const existing = to.getAttribute('style');
    to.setAttribute('style', existing ? `${existing};${style}` : style);
  }
  for (const attr of ['class', 'id', 'dir']) {
    const v = from.getAttribute && from.getAttribute(attr);
    if (v && !to.getAttribute(attr)) to.setAttribute(attr, v);
  }
}

/**
 * Wrap multiple top-level blocks into a single new <ul>/<ol>.
 * Each block becomes one <li>. All blocks are removed and replaced by the list.
 * Returns the new list element.
 */
export function wrapBlocksInList(doc, blocks, tag) {
  if (!blocks || blocks.length === 0) return null;

  const list = doc.createElement(tag);
  const KEEP = ['h1','h2','h3','h4','h5','h6','pre','blockquote'];

  // Drop a placeholder at the first block's position BEFORE any mutation, so the
  // list lands exactly there regardless of how blocks are moved out. Reading
  // blocks[0].parentNode afterwards is unsafe once a KEEP block is moved.
  const first = blocks[0];
  const anchorParent = first.parentNode;
  if (!anchorParent) return null;
  const marker = doc.createComment('oe-list-anchor');
  anchorParent.insertBefore(marker, first);

  for (const block of blocks) {
    const li = doc.createElement('li');
    const bt = block.nodeType === 1 ? block.tagName.toLowerCase() : '';

    if (block.nodeType !== 1) {
      // L8: a bare text node (stray text directly under root) is a valid "block"
      // here — MOVE the node itself into the <li> so its text isn't destroyed
      // (the old code produced an empty <li> and then removed the text node).
      li.appendChild(block);
    } else if (KEEP.includes(bt)) {
      // Preserve semantic elements (headings, pre, blockquote) as <li><h2>…</h2>.
      // MOVE the element (not clone) so node identity / attached widget state
      // survives — a clone detaches the live node (same class of bug as L2).
      li.appendChild(block);
    } else {
      // For paragraphs, divs, and everything else: move children directly, then
      // remove the now-empty original block in the cleanup pass below.
      // I7: carry the source block's own formatting (align/line-height/id/class/
      // dir) onto the <li> so wrapping a styled paragraph into a list doesn't
      // silently drop its alignment/line-height (KEEP blocks kept it by being
      // moved whole — plain <p>/<div> lost it).
      copyBlockAttrs(block, li);
      while (block.firstChild) li.appendChild(block.firstChild);
    }
    list.appendChild(li);
  }

  marker.parentNode.replaceChild(list, marker);
  // Remove any originals still left in the DOM (the emptied non-KEEP blocks).
  // KEEP blocks were MOVED into the list, so their parentNode is now an <li>.
  for (const block of blocks) {
    if (block.parentNode && block.parentNode !== list && !list.contains(block)) {
      block.parentNode.removeChild(block);
    }
  }

  return list;
}

const KEEP_BLOCKS = ['h1','h2','h3','h4','h5','h6','pre','blockquote'];

/** True for a text node that is only whitespace / zero-width filler. */
function isBlankText(node) {
  return node.nodeType === 3 &&
    node.nodeValue.replace(/[\u200B\uFEFF]/g, '').trim() === '';
}
function isKeepBlock(node) {
  return node.nodeType === 1 && KEEP_BLOCKS.includes(node.tagName.toLowerCase());
}

/**
 * Unwrap a <ul>/<ol>: turn every <li> back into block(s). Nested sub-lists and
 * any heading/pre/blockquote inside an <li> are preserved as their OWN blocks.
 * Returns ALL restored top-level blocks (array).
 *
 * L2: children are MOVED, never cloned — cloning discarded node identity
 * (contenteditable=false islands, images with attached state, referenced nodes).
 * L5: a heading/pre/blockquote is emitted as a real block, never wrapped in a
 * <p> (which produced invalid <p><h2>…</h2></p>); inline runs around it become
 * their own <p>. Whitespace-only text nodes no longer defeat the restore.
 */
export function unwrapListToBlocksAll(doc, list) {
  const parent = list.parentNode;
  if (!parent) return [];
  const fragment = doc.createDocumentFragment();
  const restored = [];

  const flushInline = (buf) => {
    if (buf.length === 0) return;
    const p = doc.createElement('p');
    for (const n of buf) p.appendChild(n);          // MOVE, not clone
    fragment.appendChild(p);
    restored.push(p);
    buf.length = 0;
  };

  for (const li of Array.from(list.children)) {
    if (li.nodeType !== 1) continue;
    const inlineBuf = [];
    let emittedAny = false;

    for (const child of Array.from(li.childNodes)) {
      if (isList(child) || isKeepBlock(child)) {
        // A block boundary: flush any pending inline run first, then move the
        // block out as its own top-level element (no <p> wrapper around it).
        flushInline(inlineBuf);
        fragment.appendChild(child);                // MOVE
        restored.push(child);
        emittedAny = true;
      } else if (isBlankText(child)) {
        // Drop whitespace-only text between blocks so it can't defeat the
        // heading-restore or leave stray empty paragraphs.
        if (inlineBuf.length > 0) inlineBuf.push(child);
      } else {
        inlineBuf.push(child);
      }
    }
    // Trailing inline content (or a genuinely empty li) → a <p>.
    if (inlineBuf.length > 0) { flushInline(inlineBuf); emittedAny = true; }
    if (!emittedAny) {
      const p = doc.createElement('p');
      p.appendChild(doc.createElement('br'));
      fragment.appendChild(p);
      restored.push(p);
    }
  }

  parent.replaceChild(fragment, list);
  return restored;
}

/**
 * Unwrap a <ul>/<ol> — returns only the first restored block (backward compat).
 */
export function unwrapListToBlocks(doc, list) {
  return unwrapListToBlocksAll(doc, list)[0] || null;
}

// convertListType + coalesceAdjacentLists live in list-dom-convert.js (kept
// under the 300-line limit). Re-exported so existing import paths keep working.
export { convertListType, coalesceAdjacentLists } from './list-dom-convert.js';
