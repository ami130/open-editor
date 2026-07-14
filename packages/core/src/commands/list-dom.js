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

/**
 * Jodit-style "section" detection: when cursor is collapsed inside a paragraph
 * that belongs to a run of consecutive plain-block siblings (no lists, no hr,
 * no tables, no media between them), return ALL of those siblings as a group.
 *
 * This is why Jodit wraps every adjacent paragraph when you click UL with just
 * a cursor — it treats the whole run as one logical section.
 *
 * Rules:
 *  - Start from `anchorBlock` (the block the cursor is in).
 *  - Expand UP (previous siblings) while they are "plain" blocks.
 *  - Expand DOWN (next siblings) while they are "plain" blocks.
 *  - "Plain" = <p>, <div>, <h1>-<h6>, <pre>, <blockquote> that are NOT lists,
 *    NOT <hr>, NOT <table>, NOT <figure>, NOT <video>/<audio>/<img> wrappers.
 *
 * Returns an array of sibling blocks in DOM order.
 */
export function getAdjacentBlocks(anchorBlock, root) {
  if (!anchorBlock || !root) return [];

  const PLAIN = new Set(['p','div','h1','h2','h3','h4','h5','h6','pre','blockquote']);
  const BREAK = new Set(['hr','table','figure','video','audio','iframe','ul','ol','dl']);

  function isPlain(node) {
    if (!node || node.nodeType !== 1) return false;
    const t = node.tagName.toLowerCase();
    if (BREAK.has(t)) return false;
    return PLAIN.has(t);
  }

  if (!isPlain(anchorBlock)) return [anchorBlock];

  // Walk backwards from anchorBlock
  const before = [];
  let cur = anchorBlock.previousElementSibling;
  while (cur && isPlain(cur)) {
    before.unshift(cur);
    cur = cur.previousElementSibling;
  }

  // Walk forwards from anchorBlock
  const after = [];
  cur = anchorBlock.nextElementSibling;
  while (cur && isPlain(cur)) {
    after.push(cur);
    cur = cur.nextElementSibling;
  }

  return [...before, anchorBlock, ...after];
}

// ─── List wrapping ────────────────────────────────────────────────────────────

/**
 * Wrap multiple top-level blocks into a single new <ul>/<ol>.
 * Each block becomes one <li>. All blocks are removed and replaced by the list.
 * Returns the new list element.
 */
export function wrapBlocksInList(doc, blocks, tag) {
  if (!blocks || blocks.length === 0) return null;

  const list = doc.createElement(tag);
  const KEEP = ['h1','h2','h3','h4','h5','h6','pre','blockquote'];

  for (const block of blocks) {
    const li = doc.createElement('li');
    const bt = block.nodeType === 1 ? block.tagName.toLowerCase() : '';

    if (bt && KEEP.includes(bt)) {
      // Preserve semantic elements (headings, pre, blockquote) by cloning them
      li.appendChild(block.cloneNode(true));
    } else {
      // For paragraphs, divs, and everything else: move children directly
      while (block.firstChild) li.appendChild(block.firstChild);
    }
    list.appendChild(li);
  }

  const first = blocks[0];
  first.parentNode.insertBefore(list, first);
  for (const block of blocks) {
    if (block.parentNode) block.parentNode.removeChild(block);
  }

  return list;
}

/**
 * Unwrap a <ul>/<ol>: turn every <li> back into a <p> (or restore heading/pre).
 * Nested sub-lists inside an <li> are preserved as siblings after the paragraph.
 * Returns ALL restored top-level blocks (array).
 */
export function unwrapListToBlocksAll(doc, list) {
  const parent = list.parentNode;
  if (!parent) return [];
  const fragment = doc.createDocumentFragment();
  const restored = [];
  const KEEP = ['h1','h2','h3','h4','h5','h6','pre','blockquote'];

  for (const li of Array.from(list.children)) {
    const firstEl = li.children[0];
    // Restore semantic block if li wrapped exactly one heading/pre/blockquote
    if (li.childNodes.length === 1 && firstEl && KEEP.includes(firstEl.tagName.toLowerCase())) {
      const block = firstEl.cloneNode(true);
      fragment.appendChild(block);
      restored.push(block);
      continue;
    }
    // Build a <p> from inline/text content; collect nested lists separately
    const block = doc.createElement('p');
    const nestedLists = [];
    for (const child of Array.from(li.childNodes)) {
      if (isList(child)) {
        nestedLists.push(child.cloneNode(true));
      } else {
        block.appendChild(child.cloneNode(true));
      }
    }
    if (!block.firstChild) block.appendChild(doc.createElement('br'));
    fragment.appendChild(block);
    restored.push(block);
    // Nested sub-lists follow the paragraph so their content is not lost
    for (const nl of nestedLists) {
      fragment.appendChild(nl);
      restored.push(nl);
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

/**
 * Convert a list's tag in-place (ul↔ol). Returns the new list element.
 */
export function convertListType(doc, list, newTag) {
  if (list.tagName.toLowerCase() === newTag) return list;
  const newList = doc.createElement(newTag);
  // Copy ALL attributes including style (preserves listStyleType, classes, data-*)
  for (const attr of Array.from(list.attributes)) {
    newList.setAttribute(attr.name, attr.value);
  }
  while (list.firstChild) newList.appendChild(list.firstChild);
  list.parentNode.replaceChild(newList, list);
  return newList;
}
