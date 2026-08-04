/**
 * Toolbar Indent / Outdent commands. Split out of list-commands.js to stay
 * within the 300-line limit.
 *
 * Model:
 *  - List items nest STRUCTURALLY (indentLi/outdentLi) — the SAME model as
 *    Tab/Shift+Tab, so Outdent can undo a Tab-nest (L4). No margin on <li>.
 *  - Other blocks use margin/padding indent: LTR marginLeft ±10px, RTL
 *    marginRight, table cells paddingLeft/Right; never negative.
 */

import { CommandManager } from './command-manager.js';
import { getSelectionBlocks, topBlock, nearestLi, placeCursor } from './list-dom.js';
import { indentLi, outdentLi } from './list-dom-indent.js';

function editorEl(editor)   { return editor.getEditorElement(); }
function getDoc(editor)     { return editor._iframeDoc || document; }
function getSelInfo(editor) { return editor.selection ? editor.selection.get() : null; }

const INDENT_STEP = 10; // px — matches Jodit's indentMargin default

function getIndentKey(block, editor) {
  const tag = block.nodeType === 1 ? block.tagName.toLowerCase() : '';
  const isCell = tag === 'td' || tag === 'th';
  const prop   = isCell ? 'padding' : 'margin';
  // Check RTL on the editor root. Use the editor's own window (iframe-safe) —
  // getComputedStyle on a node from another document is unreliable across
  // browsers.
  const root = editor && editor.getEditorElement ? editor.getEditorElement() : null;
  let computedDir = '';
  if (root) {
    const win = (editor.selection && typeof editor.selection.getWindow === 'function')
      ? editor.selection.getWindow()
      : (typeof window !== 'undefined' ? window : null);
    try {
      if (win && win.getComputedStyle) computedDir = win.getComputedStyle(root).direction || '';
    } catch { /* headless / cross-doc */ }
  }
  const dir  = (root && root.getAttribute('dir')) || computedDir || 'ltr';
  const side = dir === 'rtl' ? 'Right' : 'Left';
  return prop + side; // e.g. "marginLeft", "marginRight", "paddingLeft"
}

function applyMarginIndent(block, direction, editor) {
  if (!block || block.nodeType !== 1) return;
  const key = getIndentKey(block, editor);
  const cur  = parseInt(block.style[key] || '0', 10) || 0;
  const next = cur + direction * INDENT_STEP;
  if (next <= 0) {
    block.style[key] = '';
    if (!block.getAttribute('style')) block.removeAttribute('style');
  } else {
    block.style[key] = next + 'px';
  }
}

function resolveIndentBlocks(info, root) {
  if (!info) return [];
  if (!info.collapsed) return getSelectionBlocks(info.range, root);
  const anchor = topBlock(info.startNode, root);
  if (!anchor) return [];
  const li = nearestLi(info.startNode, root);   // inside a list item → the <li>
  if (li) return [li];
  return [anchor];
}

// L4: list items nest structurally (shared model with Tab); returns true when it
// handled a list item so the caller skips margin indent for it.
function structuralListIndent(editor, blocks, direction) {
  const root = editorEl(editor);
  const doc  = getDoc(editor);
  let handledAny = false;
  for (const block of blocks) {
    if (!block || block.nodeType !== 1 || block.tagName.toLowerCase() !== 'li') continue;
    handledAny = true;
    if (direction > 0) {
      const moved = indentLi(doc, block);      // no-op on the first item (no prev sibling)
      if (moved) placeCursor(moved, editor);
    } else {
      const res = outdentLi(doc, root, block);
      if (res) placeCursor(res.node, editor);
    }
  }
  return handledAny;
}

export const indentCommand = {
  execute(editor) {
    const info = getSelInfo(editor);
    if (!info) return CommandManager.SKIP_RESTORE;
    const root = editorEl(editor);
    const blocks = resolveIndentBlocks(info, root);
    if (structuralListIndent(editor, blocks, 1)) return CommandManager.SKIP_RESTORE;
    for (const block of blocks) applyMarginIndent(block, 1, editor);
    return CommandManager.SKIP_RESTORE;
  },
  isActive() { return false; },
};

export const outdentCommand = {
  execute(editor) {
    const info = getSelInfo(editor);
    if (!info) return CommandManager.SKIP_RESTORE;
    const root = editorEl(editor);
    const blocks = resolveIndentBlocks(info, root);
    if (structuralListIndent(editor, blocks, -1)) return CommandManager.SKIP_RESTORE;
    for (const block of blocks) applyMarginIndent(block, -1, editor);
    return CommandManager.SKIP_RESTORE;
  },
  isActive() { return false; },
  // No isEnabled — Jodit never disables outdent (style just removes at 0)
};
