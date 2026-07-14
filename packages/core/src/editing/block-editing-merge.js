/**
 * Phase 4.5 merge helpers — split out of block-editing.js to keep both
 * files under the 300-line limit.
 *
 * Exports: mergeWithPrevious, mergeWithNext, handleMultiBlockDelete
 */

import { getParentBlock, getDeepestNode } from '../selection/range-utils.js';
import { isList } from '../commands/list-dom.js';

function editorEl(editor)  { return editor.getEditorElement(); }
function getDoc(editor)    { return editor._iframeDoc || (typeof document !== 'undefined' ? document : null); }
function getSelInfo(editor){ return editor.selection ? editor.selection.get() : null; }

function placeCursorAt(node, editor, atEnd = false) {
  const win = editor.selection && editor.selection.getWindow();
  if (!win) return;
  const doc = getDoc(editor);
  if (!doc) return;
  const leaf = atEnd ? getDeepestNode(node, 'last') : getDeepestNode(node, 'first');
  const target = leaf || node;
  try {
    const range = doc.createRange();
    if (target.nodeType === 3) {
      const off = atEnd ? target.nodeValue.length : 0;
      range.setStart(target, off);
    } else if (atEnd) {
      range.setStartAfter(target);
    } else {
      range.setStart(target, 0);
    }
    range.collapse(true);
    const sel = win.getSelection();
    if (sel) { sel.removeAllRanges(); sel.addRange(range); }
  } catch { /* stale node */ }
}

function isMultiBlock(info, root) {
  if (!info || info.collapsed) return false;
  const sb = getParentBlock(info.startNode, root);
  const eb = getParentBlock(info.endNode,   root);
  return sb && eb && sb !== eb;
}

function closest(node, sel, root) {
  let n = node && node.nodeType === 1 ? node : (node && node.parentNode);
  while (n && n !== root) {
    if (n.matches && n.matches(sel)) return n;
    n = n.parentNode;
  }
  return null;
}

// BUG-1/BUG-2 fix: the custom multi-block delete does a raw Range.deleteContents()
// + child-hoist, which SILENTLY DESTROYS structure it shouldn't touch:
//   - a contenteditable="false" island (image figure, embed) in/adjacent to the
//     range is deleted whole (violates the 4.5.7 island contract), and
//   - a <table> whose <td> is the start/end block gets flattened into a paragraph
//     (getParentBlock treats <td> as a block, so its children get hoisted out).
// When the range would cross a table or a CE=false island we BAIL (return false)
// so the caller falls through to native/table-plugin handling instead of us
// corrupting the document. Detects: either endpoint inside a table, the range
// spanning into/out of a table, or the range intersecting any CE=false island.
function wouldCorruptStructure(info, root) {
  const sTable = closest(info.startNode, 'table', root);
  const eTable = closest(info.endNode, 'table', root);
  // Endpoint inside a table, or start/end straddle a table boundary.
  if (sTable || eTable) return true;
  // Range intersects a contenteditable="false" island (figure/embed/etc.).
  const range = info.range;
  if (range && range.intersectsNode) {
    const islands = root.querySelectorAll('[contenteditable="false"]');
    for (const el of islands) {
      try { if (range.intersectsNode(el)) return true; } catch { /* detached */ }
    }
  }
  return false;
}

// ─── 4.5.6 — Multi-block selection delete ────────────────────────────────────

export function handleMultiBlockDelete(editor) {
  const info = getSelInfo(editor);
  if (!info || info.collapsed) return false;
  const root = editorEl(editor);
  if (!isMultiBlock(info, root)) return false;

  const doc = getDoc(editor);
  if (!doc) return false;

  // Refuse to run when it would flatten a table or delete a CE=false island.
  if (wouldCorruptStructure(info, root)) return false;

  const startBlock = getParentBlock(info.startNode, root);
  const endBlock   = getParentBlock(info.endNode,   root);
  if (!startBlock || !endBlock) return false;

  // Delete selected content
  const range = info.range.cloneRange();
  range.deleteContents();

  // Merge endBlock's remaining content into startBlock
  if (endBlock.parentNode && endBlock !== startBlock) {
    while (endBlock.firstChild) startBlock.appendChild(endBlock.firstChild);
    endBlock.parentNode.removeChild(endBlock);
  }

  // Remove empty intermediate blocks left by deleteContents
  const toRemove = [];
  let sib = startBlock.nextSibling;
  while (sib) {
    const next = sib.nextSibling;
    if (sib.nodeType === 1) {
      const text = sib.textContent.replace(/[\u200B\uFEFF]/g, '').trim();
      if (text === '' && !sib.querySelector('img,video,iframe,object,canvas')) {
        toRemove.push(sib);
      }
    }
    sib = next;
  }
  toRemove.forEach(n => n.parentNode && n.parentNode.removeChild(n));

  // Ensure startBlock has at least a <br> if now empty.
  // M3 fix: `innerHTML === ''` rarely matches after Range.deleteContents(),
  // which in real browsers can leave an empty text node or stray inline
  // wrapper (firstChild is then truthy and innerHTML is non-empty), so the
  // <br> was never added and the block collapsed to zero height. Test the
  // effective emptiness instead: no non-whitespace text and no line-giving
  // element (a <br> or replaced/media element already gives the block height).
  const txt = startBlock.textContent.replace(/[\u200B\uFEFF]/g, '').trim();
  const hasLineEl = !!startBlock.querySelector('br,img,video,iframe,object,canvas,hr,table');
  if (txt === '' && !hasLineEl) {
    startBlock.innerHTML = '';
    startBlock.appendChild(doc.createElement('br'));
  }

  placeCursorAt(startBlock, editor);
  editor.emit('afterCommand', { command: 'blockEdit', args: [] });
  return true;
}

// ─── 4.5.2 — Backspace merges into previous block ────────────────────────────

export function mergeWithPrevious(editor, block) {
  const prev = block.previousElementSibling;
  if (!prev) return false;

  const doc = getDoc(editor);
  if (!doc) return false;

  // Backspace at the start of a paragraph that follows a list: merge the
  // paragraph's content into the last <li> of that list (the natural target),
  // rather than refusing and leaving an orphan paragraph.
  if (isList(prev)) {
    const lastLi = prev.lastElementChild;
    if (!lastLi || lastLi.tagName.toLowerCase() !== 'li') return false;
    const liJoin = getDeepestNode(lastLi, 'last');
    while (block.firstChild) lastLi.appendChild(block.firstChild);
    block.parentNode.removeChild(block);
    if (liJoin) {
      const win = editor.selection && editor.selection.getWindow();
      if (win) {
        try {
          const r = doc.createRange();
          if (liJoin.nodeType === 3) r.setStart(liJoin, liJoin.nodeValue.length);
          else r.setStartAfter(liJoin);
          r.collapse(true);
          const sel = win.getSelection();
          if (sel) { sel.removeAllRanges(); sel.addRange(r); }
        } catch { placeCursorAt(lastLi, editor, true); }
      }
    } else {
      placeCursorAt(lastLi, editor, true);
    }
    return true;
  }

  const joinLeaf = getDeepestNode(prev, 'last');

  while (block.firstChild) prev.appendChild(block.firstChild);
  block.parentNode.removeChild(block);

  if (joinLeaf) {
    const win = editor.selection && editor.selection.getWindow();
    if (win) {
      try {
        const range = doc.createRange();
        if (joinLeaf.nodeType === 3) {
          range.setStart(joinLeaf, joinLeaf.nodeValue.length);
        } else {
          range.setStartAfter(joinLeaf);
        }
        range.collapse(true);
        const sel = win.getSelection();
        if (sel) { sel.removeAllRanges(); sel.addRange(range); }
      } catch { placeCursorAt(prev, editor, true); }
    }
  } else {
    placeCursorAt(prev, editor, true);
  }
  return true;
}

// ─── 4.5.3 — Delete merges next block in ─────────────────────────────────────

export function mergeWithNext(editor, block) {
  const next = block.nextElementSibling;
  if (!next || isList(next)) return false;

  const joinLeaf = getDeepestNode(block, 'last');

  while (next.firstChild) block.appendChild(next.firstChild);
  next.parentNode.removeChild(next);

  if (joinLeaf) {
    const doc = getDoc(editor);
    const win = editor.selection && editor.selection.getWindow();
    if (win && doc) {
      try {
        const range = doc.createRange();
        if (joinLeaf.nodeType === 3) {
          range.setStart(joinLeaf, joinLeaf.nodeValue.length);
        } else {
          range.setStartAfter(joinLeaf);
        }
        range.collapse(true);
        const sel = win.getSelection();
        if (sel) { sel.removeAllRanges(); sel.addRange(range); }
      } catch { placeCursorAt(block, editor, true); }
    }
  } else {
    placeCursorAt(block, editor, true);
  }
  return true;
}
