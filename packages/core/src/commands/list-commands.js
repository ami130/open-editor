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
import { featureForCommand } from '../entitlements/feature-catalog.js';
import {
  isList, nearestLi, nearestList, placeCursor, topBlock,
  getSelectionBlocks,
  wrapBlocksInList, unwrapListToBlocksAll,
  convertListType, coalesceAdjacentLists, copyBlockAttrs,
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
    let list = wrapBlocksInList(doc, [anchor], tag);
    const firstLi = list && list.querySelector('li');
    if (firstLi) placeCursor(firstLi, editor);
    if (list) list = coalesceAdjacentLists(list);   // L9: merge with an adjacent same-type list
    return list;
  }

  // When selection mixes plain blocks and existing lists, merge everything
  // into ONE output list in DOM order (Jodit collapses adjacent same-type lists).
  const list = doc.createElement(tag);

  // L7: carry over the attributes of the FIRST same-type source list so its
  // start/list-style-type/id/class survive the merge (was: silently dropped).
  const donor = blocks.find((b) => isList(b) && b.tagName.toLowerCase() === tag);
  if (donor) {
    for (const attr of Array.from(donor.attributes)) list.setAttribute(attr.name, attr.value);
  }

  // Drop a placeholder at the first block's position BEFORE moving anything —
  // moving <li>s out of a source list can empty it, so reading blocks[0] later
  // is unsafe.
  const firstBlock = blocks[0];
  const anchorParent = firstBlock.parentNode;
  const marker = doc.createComment('oe-list-merge');
  if (anchorParent) anchorParent.insertBefore(marker, firstBlock);

  for (const block of blocks) {
    if (isList(block)) {
      // MOVE each <li> out of the existing list (identity preserved, not cloned).
      for (const li of Array.from(block.children)) list.appendChild(li);
    } else {
      // Wrap the block's content into a fresh <li>.
      const li = doc.createElement('li');
      if (block.nodeType !== 1) {
        li.appendChild(block);          // L8: bare text node — move it, don't drop it
      } else {
        copyBlockAttrs(block, li);      // I7: keep the paragraph's align/line-height/id/class
        while (block.firstChild) li.appendChild(block.firstChild);
      }
      if (!li.firstChild) li.appendChild(doc.createElement('br'));
      list.appendChild(li);
    }
  }

  if (marker.parentNode) marker.parentNode.replaceChild(list, marker);
  else if (anchorParent) anchorParent.appendChild(list);
  // Remove the now-empty source blocks/lists (their content was moved out).
  for (const block of blocks) {
    if (block.parentNode && block !== list && !list.contains(block)) {
      block.parentNode.removeChild(block);
    }
  }

  const merged = coalesceAdjacentLists(list);   // L9: fold in an adjacent same-type list
  const firstLi = merged.querySelector('li');
  if (firstLi) placeCursor(firstLi, editor);
  return merged;
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
  // Feature gating (Phase 2 leak-fix): this path formats via direct DOM, NOT
  // through commands.execute(), so it must consult the gate itself or it bypasses
  // list gating. `tag` is 'ul'/'ol' → list.bullet/list.ordered; the style value
  // is the list.style feature. If the list feature isn't granted, do nothing; if
  // list is granted but list.style isn't, create the list without the style.
  // I4: this path bypasses CommandManager, which is the ONLY place readonly is
  // enforced — so it must reject a readonly editor itself, or the list-style
  // split-button mutates a non-editable document.
  if (editor.isReadOnly && editor.isReadOnly()) return;
  const granted = (feature) => !feature || !editor.isFeatureGranted || editor.isFeatureGranted(feature);
  if (!granted(featureForCommand(tag))) return;

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
  if (list && styleValue && granted('list.style')) {
    list.style.listStyleType = styleValue;
  }
  // I4: direct-DOM mutation → notify onChange (CommandManager would have).
  if (list && typeof editor._onChangeFn === 'function') editor._onChangeFn();
}

// Indent/Outdent commands live in list-indent-commands.js (kept under the
// 300-line limit). Tab/Enter keyboard handlers live in list-keyboard.js. Both
// re-exported here so existing import paths keep working.
export { indentCommand, outdentCommand } from './list-indent-commands.js';
export { handleListTab, handleListEnter } from './list-keyboard.js';
