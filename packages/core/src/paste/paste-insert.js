/**
 * paste-insert.js — Phase 12.15: context-aware insertion of cleaned paste HTML.
 *
 * The problem: inserting block-level content (<p>, <ul>, <h2>, <table>…) at an
 * INLINE caret inside an existing block (e.g. mid-<p>) with a plain
 * range.insertNode() produces invalid nesting (<p> inside <p>) that browsers
 * silently mangle. This is what 12.G deferred here.
 *
 * The fix: when the cleaned HTML has top-level block nodes AND the caret is in a
 * SPLITTABLE block, split the host block at the caret and drop the pasted nodes
 * between the two halves. Special containers are respected (12.15):
 *   • <td>/<th>/<li> are NOT split (that would break the table/list) — content
 *     is inserted at the caret inside the cell/item instead.
 * Inline-only paste, or a caret not inside a block, falls back to the editor's
 * normal insertAtCursor.
 *
 * insertPasteContent(editor, html) → boolean (true when it handled insertion).
 */
import { getParentBlock, getClosestTag } from '../selection/range-utils.js';
import { HAS_MEDIA_SELECTOR } from './normalize-paste.js';

const BLOCK_RE = /^(p|div|h[1-6]|ul|ol|li|blockquote|pre|table|figure|dl|hr)$/i;
// Containers we must not split open — doing so would break the structure.
const NO_SPLIT = new Set(['td', 'th', 'li']);

function getDoc(editor) {
  return editor._iframeDoc || (typeof document !== 'undefined' ? document : null);
}

/** Does the parsed HTML contain at least one top-level block element? */
export function hasTopLevelBlock(html, doc) {
  if (typeof html !== 'string' || html === '') return false;
  const tmp = doc.createElement('div');
  tmp.innerHTML = html;
  for (const child of tmp.childNodes) {
    if (child.nodeType === 1 && BLOCK_RE.test(child.tagName)) return true;
  }
  return false;
}

/**
 * Flatten top-level block elements to inline content joined by <br>, for pasting
 * into a container (<td>/<li>) that must not gain nested blocks. Each top-level
 * block's INNER HTML is kept (so inline formatting survives); blocks are joined
 * with <br> so their visual separation is preserved without <p>-in-<td>.
 */
// A pasted <table>'s cells are not top-level blocks (they're nested inside
// <table><tbody><tr>), so the loop below would otherwise take the whole
// table's innerHTML as ONE opaque string — concatenating adjacent cells with
// no separator (e.g. "A"+"B" -> "AB"). Degrade a nested table to text instead:
// cells joined by a space (mirrors plain-text table degradation), rows by <br>.
// Only THIS table's own rows/cells are read — querySelectorAll('tr'/'td,th')
// would otherwise also match a table nested inside one of its cells, both
// double-counting that inner table's rows AND leaking its text into the outer
// cell's textContent (a real corruption: text appears twice, concatenated).
function directRows(tableEl) {
  const out = [];
  for (const section of tableEl.children) {
    const tag = section.tagName.toLowerCase();
    if (tag === 'tr') { out.push(section); continue; }
    if (tag === 'thead' || tag === 'tbody' || tag === 'tfoot') {
      for (const tr of section.children) if (tr.tagName.toLowerCase() === 'tr') out.push(tr);
    }
  }
  return out;
}
function directCells(tr) {
  return Array.from(tr.children).filter((c) => /^(td|th)$/i.test(c.tagName));
}
// A cell's own text, with any directly-nested table's rows appended as their
// own flattened lines (recursing, not dropping — data loss is worse than a
// slightly different layout). Excludes the nested table from the cell's own
// textContent first so its text isn't ALSO concatenated in-line (the original
// corruption: text appearing twice, run together with no separator).
function cellText(cell) {
  const clone = cell.cloneNode(true);
  const ownNested = Array.from(clone.querySelectorAll('table'));
  for (const nested of ownNested) nested.remove();
  const own = clone.textContent.trim();
  const nestedFlat = Array.from(cell.children)
    .filter((c) => c.tagName.toLowerCase() === 'table')
    .map(tableToInlineText)
    .filter(Boolean);
  return [own, ...nestedFlat].filter(Boolean).join(' ');
}
function tableToInlineText(tableEl) {
  const lines = directRows(tableEl).map((tr) =>
    directCells(tr).map(cellText).filter(Boolean).join(' ')
  ).filter(Boolean);
  return lines.join('<br>');
}

function flattenBlocksToInline(html, doc) {
  const tmp = doc.createElement('div');
  tmp.innerHTML = html;
  const parts = [];
  for (const child of Array.from(tmp.childNodes)) {
    if (child.nodeType === 1 && /^table$/i.test(child.tagName)) {
      const flat = tableToInlineText(child);
      if (flat) parts.push(flat);
    } else if (child.nodeType === 1 && BLOCK_RE.test(child.tagName)) {
      const inner = child.innerHTML.trim();
      if (inner) parts.push(inner);
    } else if (child.nodeType === 1) {
      parts.push(child.outerHTML);
    } else if (child.nodeType === 3 && child.nodeValue.trim()) {
      parts.push(child.nodeValue);
    }
  }
  return parts.length ? parts.join('<br>') : html;
}

/**
 * Insert cleaned paste HTML with block-awareness. Returns true if this handled
 * the insertion (caller should NOT also call insertAtCursor); false to let the
 * caller fall back to its normal path.
 */
export function insertPasteContent(editor, html) {
  const doc = getDoc(editor);
  const sel = editor.selection;
  if (!doc || !sel || typeof html !== 'string' || html === '') return false;

  const info = sel.get && sel.get();
  if (!info || !info.range) return false;

  // Inline-only content → let the normal caret insert handle it.
  if (!hasTopLevelBlock(html, doc)) return false;

  const root = editor.getEditorElement();
  const startNode = info.startNode;

  // Inside a table cell or list item → don't split the container (12.15).
  const cell = getClosestTag(startNode, 'td', root) || getClosestTag(startNode, 'th', root);
  const li = getClosestTag(startNode, 'li', root);
  if (cell || li) {
    // MEDIUM-1 fix: block HTML pasted here would inject <p>/<h2> INSIDE the
    // cell/item (invalid <p>-in-<td>/<li>, splitting the existing text). Flatten
    // top-level blocks to their inline content, joined by <br>, before inserting.
    // insertAtCursor already deletes any active selection first.
    if (typeof sel.insertAtCursor === 'function') sel.insertAtCursor(flattenBlocksToInline(html, doc));
    return true;
  }

  let block = getParentBlock(startNode, root);
  // No enclosing splittable block (caret directly in root) → normal insert is
  // fine; the pasted blocks land at top level correctly.
  if (!block || NO_SPLIT.has(block.tagName.toLowerCase())) return false;

  // HIGH-1 fix: paste-over-SELECTION must REPLACE the selection. The split logic
  // below only reads the range START, so a non-collapsed range left the selected
  // text in place (duplicated it, or orphaned a cross-block selection). Delete
  // the selection first — this collapses the range to its start — then re-derive
  // the (possibly changed) enclosing block before splitting.
  let range = info.range;
  if (!range.collapsed) {
    range = range.cloneRange();
    try { range.deleteContents(); } catch { /* fall through with original */ }
    const anchor = range.startContainer;
    block = getParentBlock(anchor, root) || block;
    if (NO_SPLIT.has(block.tagName.toLowerCase())) {
      // Deletion may have landed the caret inside a cell/list item — flatten.
      if (typeof sel.insertAtCursor === 'function') sel.insertAtCursor(flattenBlocksToInline(html, doc));
      return true;
    }
  }

  return splitBlockAndInsert(editor, doc, block, range, html);
}

/**
 * Split `block` at the caret (range), insert the pasted fragment between the
 * before/after halves, and drop either half if it is empty. Places the caret at
 * the end of the last inserted node.
 */
function splitBlockAndInsert(editor, doc, block, range, html) {
  // before = block content up to the caret; after = the rest.
  const afterRange = range.cloneRange();
  afterRange.setEndAfter(block.lastChild || block);
  const afterFrag = afterRange.extractContents(); // everything from caret → end

  const tmp = doc.createElement('div');
  tmp.innerHTML = html;
  const pasted = [];
  while (tmp.firstChild) pasted.push(tmp.firstChild), tmp.removeChild(tmp.firstChild);

  const parent = block.parentNode;
  if (!parent) return false;
  const ref = block.nextSibling;

  // Insert the pasted nodes after the (now-truncated) block.
  const win = editor.selection && editor.selection.getWindow();
  let lastInserted = null;
  for (const node of pasted) { parent.insertBefore(node, ref); lastInserted = node; }

  // Re-home the "after" content into a clone of the original block, placed after
  // the pasted nodes — preserving the tail of the split paragraph. The media
  // check uses the shared HAS_MEDIA_SELECTOR (#8) so a trailing <hr>/<video>/
  // <iframe> etc. isn't judged "empty" and silently dropped.
  const afterBlock = block.cloneNode(false);
  afterBlock.appendChild(afterFrag);
  if (afterBlock.textContent.trim() !== '' || afterBlock.querySelector(HAS_MEDIA_SELECTOR)) {
    parent.insertBefore(afterBlock, ref);
  }

  // Drop the "before" block if the caret was at its very start (now empty).
  if (block.textContent.trim() === '' && !block.querySelector(HAS_MEDIA_SELECTOR)) {
    parent.removeChild(block);
  }

  // Caret at the end of the last inserted node.
  if (lastInserted && win) {
    try {
      const r = doc.createRange();
      r.selectNodeContents(lastInserted);
      r.collapse(false);
      const s = win.getSelection();
      if (s) { s.removeAllRanges(); s.addRange(r); }
    } catch { /* non-fatal */ }
  }
  return true;
}
