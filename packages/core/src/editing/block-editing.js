/**
 * Phase 4.5 — Block editing semantics: Enter-split, Backspace/Delete merges,
 * structural conversions, multi-block selection delete, editor floor.
 *
 * Merge helpers live in block-editing-merge.js (kept under 300-line limit).
 * All exported functions return true when they consumed the event (caller must
 * preventDefault) and false to fall through to the browser default.
 */

import { walkUp, getParentBlock, getDeepestNode } from '../selection/range-utils.js';
import { outdentLi } from '../commands/list-dom-indent.js';
import { mergeWithPrevious, mergeWithNext } from './block-editing-merge.js';

export { handleMultiBlockDelete } from './block-editing-merge.js';

function editorEl(editor)  { return editor.getEditorElement(); }
function getDoc(editor)    { return editor._iframeDoc || (typeof document !== 'undefined' ? document : null); }
function getSelInfo(editor){ return editor.selection ? editor.selection.get() : null; }

const HEADING_TAGS    = new Set(['h1','h2','h3','h4','h5','h6']);
const STRUCTURAL_TAGS = new Set(['h1','h2','h3','h4','h5','h6','pre','blockquote']);

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
      range.setStart(target, atEnd ? target.nodeValue.length : 0);
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

function isAtBlockStart(info, block) {
  if (!info || !info.collapsed) return false;
  let node = info.startNode;
  let off  = info.startOffset;
  if (node.nodeType === 3 && off > 0) return false;
  while (node && node !== block) {
    if (off !== 0) return false;
    off  = Array.from(node.parentNode.childNodes).indexOf(node);
    node = node.parentNode;
  }
  return true;
}

function isAtBlockEnd(info, block) {
  if (!info || !info.collapsed) return false;
  let node = info.startNode;
  const off  = info.startOffset;
  if (node.nodeType === 3 && off < node.nodeValue.length) return false;
  while (node && node !== block) {
    const parent = node.parentNode;
    if (!parent || node !== parent.lastChild) return false;
    node = parent;
  }
  return true;
}

// ─── 4.5.7 — contenteditable="false" island ──────────────────────────────────

function handleContentEditableFalse(editor, key) {
  const info = getSelInfo(editor);
  if (!info || !info.collapsed) return false;
  const doc = getDoc(editor);
  if (!doc) return false;

  const node = info.startNode;
  const off  = info.startOffset;
  let island = null;

  if (key === 'Backspace') {
    if (node.nodeType === 3 && off === 0 && node.previousSibling) {
      const prev = node.previousSibling;
      if (prev.nodeType === 1 && prev.getAttribute('contenteditable') === 'false') island = prev;
    } else if (node.nodeType === 1 && off > 0) {
      const prev = node.childNodes[off - 1];
      if (prev && prev.nodeType === 1 && prev.getAttribute('contenteditable') === 'false') island = prev;
    }
  } else {
    if (node.nodeType === 3 && off === node.nodeValue.length && node.nextSibling) {
      const next = node.nextSibling;
      if (next.nodeType === 1 && next.getAttribute('contenteditable') === 'false') island = next;
    } else if (node.nodeType === 1 && off < node.childNodes.length) {
      const next = node.childNodes[off];
      if (next && next.nodeType === 1 && next.getAttribute('contenteditable') === 'false') island = next;
    }
  }

  if (!island) return false;
  const range = doc.createRange();
  range.selectNode(island);
  range.deleteContents();
  return true;
}

// ─── 4.5.8 — Editor floor ────────────────────────────────────────────────────
export function ensureEditorFloor(editor) {
  const root = editorEl(editor);
  const doc  = getDoc(editor);
  if (!root || !doc) return;
  const text = root.textContent.replace(/[\u200B\uFEFF]/g, '').trim();
  const hasBlock = root.querySelector('img,video,iframe,object,canvas,table,ul,ol');
  const inner = root.innerHTML.replace(/\s/g, '');
  if (text === '' && !hasBlock && (!root.firstChild || inner === '' || inner === '<br>')) {
    root.innerHTML = '<p><br></p>';
    placeCursorAt(root.firstChild, editor);
  }
}

// ─── 4.5.4 — List item Backspace ─────────────────────────────────────────────

function handleListItemBackspace(editor, li) {
  const root = editorEl(editor);
  const doc  = getDoc(editor);
  if (!doc) return false;
  const list = li.parentNode;
  if (!list) return false;
  const result = outdentLi(doc, root, li);
  if (result) { placeCursorAt(result.node, editor); return true; }
  return false;
}

// ─── 4.5.5 — Structural block Backspace ──────────────────────────────────────

function handleStructuralBackspace(editor, block) {
  const tag = block.tagName.toLowerCase();
  const doc  = getDoc(editor);
  if (!doc) return false;

  if (tag === 'blockquote') {
    const parent = block.parentNode;
    const first  = block.firstChild;
    while (block.firstChild) parent.insertBefore(block.firstChild, block);
    parent.removeChild(block);
    if (first) placeCursorAt(first, editor);
    return true;
  }

  if (!STRUCTURAL_TAGS.has(tag)) {
    // Check if this block is the first child of a blockquote ancestor — if so,
    // treat the blockquote as the structural container to unwrap (4.5.5).
    const root = editorEl(editor);
    const bq   = walkUp(block.parentNode, root,
      (n) => n.nodeType === 1 && n.tagName.toLowerCase() === 'blockquote'
    );
    if (bq && block === bq.firstElementChild) {
      return handleStructuralBackspace(editor, bq);
    }
    return false;
  }

  const p = doc.createElement('p');
  while (block.firstChild) p.appendChild(block.firstChild);
  if (!p.firstChild) p.appendChild(doc.createElement('br'));
  block.parentNode.replaceChild(p, block);
  placeCursorAt(p, editor);
  return true;
}

// ─── 4.5.1 — Enter splits a block ────────────────────────────────────────────

export function handleEnterSplit(editor) {
  const info = getSelInfo(editor);
  if (!info || !info.collapsed) return false;
  const root = editorEl(editor);
  const doc  = getDoc(editor);
  if (!doc) return false;

  let block = getParentBlock(info.startNode, root);
  // Firefox/WebKit: keyboard.insertText() places cursor at root element offset
  // rather than inside the text node. Walk into the block at that position.
  const cursorAtRoot = !block && info.startNode === root && info.startOffset > 0;
  if (cursorAtRoot) {
    const child = root.childNodes[info.startOffset - 1];
    if (child && child.nodeType === 1) block = child;
  }
  if (!block || block === root) return false;

  const tag = block.tagName.toLowerCase();
  if (tag === 'li') return false;      // list-keyboard.js
  if (tag === 'blockquote') return false; // blockquote-enter.js

  const inBQ = walkUp(info.startNode, root,
    (n) => n.nodeType === 1 && n.tagName.toLowerCase() === 'blockquote'
  );
  if (inBQ) return false;

  const newTag   = HEADING_TAGS.has(tag) ? 'p' : tag;
  const newBlock = doc.createElement(newTag);

  const splitRange = doc.createRange();
  if (cursorAtRoot) {
    // Cursor at root element (Firefox/WebKit after insertText) — treat as end of block.
    splitRange.setStartAfter(block.lastChild || block);
  } else {
    splitRange.setStart(info.range.startContainer, info.range.startOffset);
  }
  splitRange.setEndAfter(block.lastChild || block);
  newBlock.appendChild(splitRange.extractContents());

  if (!block.firstChild || block.innerHTML.replace(/\s/g,'') === '') {
    block.innerHTML = ''; block.appendChild(doc.createElement('br'));
  }
  if (!newBlock.firstChild || newBlock.innerHTML.replace(/\s/g,'') === '') {
    newBlock.innerHTML = ''; newBlock.appendChild(doc.createElement('br'));
  }

  block.parentNode.insertBefore(newBlock, block.nextSibling);
  placeCursorAt(newBlock, editor);
  editor.emit('afterCommand', { command: 'enterSplit', args: [] });
  return true;
}

// ─── Main handlers wired from editor-events.js ──────────────────────────────
export function handleBackspace(editor) {
  if (editor._state && editor._state.isReadOnly) return false;
  const info = getSelInfo(editor);
  if (!info || !info.collapsed) return false;

  const root = editorEl(editor);
  let block  = getParentBlock(info.startNode, root);
  // Firefox/WebKit place cursor at root[N] (inter-block); treat as block-start.
  const rootBS = !block && info.startNode === root &&
    root.childNodes[info.startOffset]?.nodeType === 1;
  if (rootBS) block = root.childNodes[info.startOffset];
  if (!block || block === root) return false;

  if (handleContentEditableFalse(editor, 'Backspace')) {
    ensureEditorFloor(editor);
    editor.emit('afterCommand', { command: 'blockEdit', args: [] });
    return true;
  }

  if (!rootBS && !isAtBlockStart(info, block)) return false;

  const tag = block.tagName.toLowerCase();

  if (tag === 'li') {
    const handled = handleListItemBackspace(editor, block);
    if (handled) { ensureEditorFloor(editor); editor.emit('afterCommand', { command: 'blockEdit', args: [] }); }
    return handled;
  }

  // Try structural conversion first (covers heading/pre/blockquote, and <p>
  // that is the first child of a blockquote — both cases handled inside).
  const structural = handleStructuralBackspace(editor, block);
  if (structural) {
    ensureEditorFloor(editor);
    editor.emit('afterCommand', { command: 'blockEdit', args: [] });
    return true;
  }

  if (!block.previousElementSibling) return false;

  const handled = mergeWithPrevious(editor, block);
  if (handled) { ensureEditorFloor(editor); editor.emit('afterCommand', { command: 'blockEdit', args: [] }); }
  return handled;
}

export function handleDelete(editor) {
  if (editor._state && editor._state.isReadOnly) return false;
  const info = getSelInfo(editor);
  if (!info || !info.collapsed) return false;

  const root = editorEl(editor);
  let block  = getParentBlock(info.startNode, root);
  // Firefox/WebKit place cursor at root[N] (inter-block); treat as block-end.
  const rootDE = !block && info.startNode === root && info.startOffset > 0 &&
    root.childNodes[info.startOffset - 1]?.nodeType === 1;
  if (rootDE) block = root.childNodes[info.startOffset - 1];
  if (!block || block === root) return false;

  if (handleContentEditableFalse(editor, 'Delete')) {
    ensureEditorFloor(editor);
    editor.emit('afterCommand', { command: 'blockEdit', args: [] });
    return true;
  }

  if (!rootDE && !isAtBlockEnd(info, block)) return false;
  if (!block.nextElementSibling) return false;

  const handled = mergeWithNext(editor, block);
  if (handled) { ensureEditorFloor(editor); editor.emit('afterCommand', { command: 'blockEdit', args: [] }); }
  return handled;
}
