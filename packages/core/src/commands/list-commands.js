/**
 * List commands — ul, ol, indent, outdent, Tab/Shift-Tab, Enter-exit, style/start, dl.
 *
 * Jodit-exact behaviours:
 *  1. Cursor in paragraph → wraps ONLY that block (not adjacent siblings).
 *  2. Selection across paragraphs → all become <li>s in ONE list.
 *  3. Mixed selection (paragraphs + existing lists) → merged into ONE output list.
 *  4. Same-type list click → unwrap, cursor in corresponding paragraph.
 *  5. Different-type list click → convert ul↔ol, cursor in same <li>.
 *  6. Indent/Outdent → marginLeft ±10px on the block; both always enabled.
 *  7. Tab/Shift+Tab → structural nest/unnest, only fires at li start position.
 *  8. Tab on first item → passes through (does NOT swallow the key).
 *  9. Enter on empty <li> → exit list; nested exits to new <li>, top-level to <p>.
 * 10. Trailing items after empty <li> are preserved in a continuation list.
 */

import { isInsideTag } from '../selection/range-utils.js';
import { CommandManager } from './command-manager.js';
import {
  isList, nearestLi, nearestList, placeCursor, topBlock,
  getSelectionBlocks,
  wrapBlocksInList, unwrapListToBlocksAll,
  convertListType,
} from './list-dom.js';

// ─── Micro-helpers ────────────────────────────────────────────────────────────

function editorEl(editor)   { return editor.getEditorElement(); }
function getDoc(editor)     { return editor._iframeDoc || document; }
function getSelInfo(editor) { return editor.selection ? editor.selection.get() : null; }

function isInsideListType(editor, tag) {
  const info = getSelInfo(editor);
  if (!info) return false;
  return isInsideTag(info.startNode, tag, editorEl(editor));
}

// ─── Core: decide which blocks to act on ─────────────────────────────────────
//
// Jodit behaviour (verified from source):
//   • Selection spans multiple blocks → wrap all selected blocks into one list.
//   • Collapsed cursor in a plain paragraph → wrap ONLY that block.
//     Jodit does NOT expand to adjacent siblings for the list command.
//   • Collapsed cursor inside an existing list → handled by toggle-off/convert.

function resolveTargetBlocks(info, root) {
  if (!info) return [];

  // Non-collapsed selection: wrap all blocks the range spans
  if (!info.collapsed) {
    return getSelectionBlocks(info.range, root);
  }

  // Collapsed cursor — find the single top-level block under the cursor
  const anchor = topBlock(info.startNode, root);
  if (!anchor) return [];

  // Already inside a list — let the toggle-off / convert branch handle it
  if (isList(anchor) || nearestList(info.startNode, root)) return [];

  // Wrap only the single block the cursor is in (Jodit exact behaviour)
  return [anchor];
}

// ─── toggleList ───────────────────────────────────────────────────────────────
//
// Modes:
//   A) Cursor inside same-type list        → unwrap entire list back to paragraphs
//   B) Cursor inside different-type list   → convert list tag in-place
//   C) Blocks are plain paragraphs         → wrap them all into one new list

function toggleList(editor, tag) {
  const info = getSelInfo(editor);
  if (!info) return null;
  const root = editorEl(editor);
  const doc  = getDoc(editor);

  // ── Mode A / B: cursor is already inside a list ───────────────────────────
  const existingList = nearestList(info.startNode, root);
  if (existingList) {
    const existingTag = existingList.tagName.toLowerCase();

    if (existingTag === tag) {
      // Same type → unwrap back to paragraphs. Cursor lands in the paragraph
      // that corresponds to the <li> the cursor was originally in (Jodit).
      const activeLi  = nearestLi(info.startNode, root);
      const liIndex   = activeLi
        ? Array.from(existingList.children).indexOf(activeLi)
        : 0;
      const restored  = unwrapListToBlocksAll(doc, existingList);
      // restored may contain nested lists between paragraphs; skip them
      const paragraphs = restored.filter(n => n.nodeType === 1 && !isList(n));
      const target    = paragraphs[liIndex] || paragraphs[0];
      if (target) placeCursor(target, editor);
      return null;
    } else {
      // Different type → convert in-place, keep all items.
      // Cursor lands in the same <li> the user was in (Jodit).
      const activeLi = nearestLi(info.startNode, root);
      const liIndex  = activeLi
        ? Array.from(existingList.children).indexOf(activeLi)
        : 0;
      const newList  = convertListType(doc, existingList, tag);
      const allLis   = Array.from(newList.querySelectorAll(':scope > li'));
      const target   = allLis[liIndex] || allLis[0] || newList;
      placeCursor(target, editor);
      return newList;
    }
  }

  // ── Mode C: wrap plain blocks into a new list ─────────────────────────────
  const blocks = resolveTargetBlocks(info, root);

  if (blocks.length === 0) {
    // Fallback: wrap just the block under the cursor if resolveTargetBlocks
    // returned nothing (e.g. cursor in an empty editor with no paragraph)
    const anchor = topBlock(info.startNode, root);
    if (!anchor) return null;
    const list = wrapBlocksInList(doc, [anchor], tag);
    const firstLi = list && list.querySelector('li');
    if (firstLi) placeCursor(firstLi, editor);
    return list;
  }

  // When selection mixes plain blocks and existing lists, merge everything
  // into ONE output list in DOM order (Jodit collapses adjacent same-type lists).
  const mixedLis = [];
  for (const block of blocks) {
    if (isList(block)) {
      // Pull all <li> children out of the existing list
      for (const li of Array.from(block.children)) mixedLis.push(li.cloneNode(true));
    } else {
      // Wrap the block's content into a fresh <li>
      const li = doc.createElement('li');
      while (block.firstChild) li.appendChild(block.firstChild);
      if (!li.firstChild) li.appendChild(doc.createElement('br'));
      mixedLis.push(li);
    }
  }

  // Build the single output list and replace all the source blocks
  const list = doc.createElement(tag);
  for (const li of mixedLis) list.appendChild(li);
  const firstBlock = blocks[0];
  firstBlock.parentNode.insertBefore(list, firstBlock);
  for (const block of blocks) {
    if (block.parentNode) block.parentNode.removeChild(block);
  }

  const firstLi = list.querySelector('li');
  if (firstLi) placeCursor(firstLi, editor);
  return list;
}

// ─── ul / ol commands ─────────────────────────────────────────────────────────

export const ulCommand = {
  execute(editor) { toggleList(editor, 'ul'); return CommandManager.SKIP_RESTORE; },
  isActive(editor) { return isInsideListType(editor, 'ul'); },
};

export const olCommand = {
  execute(editor) { toggleList(editor, 'ol'); return CommandManager.SKIP_RESTORE; },
  isActive(editor) { return isInsideListType(editor, 'ol'); },
};

// ─── toggleListWithStyle ──────────────────────────────────────────────────────
// Atomic: create list AND apply style in one step — avoids stale-selection bug.

export function toggleListWithStyle(editor, tag, styleValue) {
  const info = getSelInfo(editor);
  if (!info) return;
  const root = editorEl(editor);
  const existingList = nearestList(info.startNode, root);
  let list;

  if (existingList && existingList.tagName.toLowerCase() === tag) {
    list = existingList;
  } else {
    list = toggleList(editor, tag);
  }
  if (list && styleValue) {
    list.style.listStyleType = styleValue;
  }
}

// ─── Indent / Outdent ─────────────────────────────────────────────────────────
//
// Jodit behaviour:
//  - LTR: marginLeft ±10px  |  RTL: marginRight ±10px  (Jodit getKey() logic)
//  - Table cells (td/th): paddingLeft / paddingRight instead of margin
//  - Never nests list items — that is Tab/Shift+Tab, not toolbar indent.
//  - Never goes negative — removes style attribute when value reaches 0.

const INDENT_STEP = 10; // px — matches Jodit's indentMargin default

function getIndentKey(block, editor) {
  const tag = block.nodeType === 1 ? block.tagName.toLowerCase() : '';
  const isCell = tag === 'td' || tag === 'th';
  const prop   = isCell ? 'padding' : 'margin';
  // Check RTL on the editor root or the block itself. Use the editor's own
  // window (iframe-safe) — the global getComputedStyle on a node from another
  // document is unreliable across browsers.
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
  const side  = dir === 'rtl' ? 'Right' : 'Left';
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
  // Inside a list item: the <li> is the block to indent
  const li = nearestLi(info.startNode, root);
  if (li) return [li];
  return [anchor];
}

export const indentCommand = {
  execute(editor) {
    const info = getSelInfo(editor);
    if (!info) return CommandManager.SKIP_RESTORE;
    const root = editorEl(editor);
    const blocks = resolveIndentBlocks(info, root);
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
    for (const block of blocks) applyMarginIndent(block, -1, editor);
    return CommandManager.SKIP_RESTORE;
  },
  isActive() { return false; },
  // No isEnabled — Jodit never disables outdent (style just removes at 0)
};

// Tab/Enter list keyboard handlers live in list-keyboard.js (kept under the
// 300-line limit). Re-exported here so existing import paths keep working.
export { handleListTab, handleListEnter } from './list-keyboard.js';
