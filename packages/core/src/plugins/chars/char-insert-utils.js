/**
 * char-insert-utils.js — shared insertion helper for the emoji (13.4) and
 * special-characters (13.3) plugins.
 */
import { getClosestTag } from '../../selection/range-utils.js';

/**
 * If the current selection is a COLLAPSED caret sitting inside an <a>, move it
 * to just AFTER that link before the caller inserts content. Without this, a
 * plain insertAtCursor() call would silently extend the hyperlink to swallow
 * the inserted character — inserting an emoji/special char at a bare cursor at
 * the end of a link should append after it, not grow the link.
 *
 * Deliberately a no-op when the selection is a RANGE (not collapsed): the user
 * selected text (possibly inside the link) intending to REPLACE it, and
 * insertAtCursor() already deletes a range selection before inserting — moving
 * the boundary here would silently turn "replace this text" into "insert after
 * the link, leaving the selected text untouched", which is a worse surprise
 * than the (rarer) link-extension this helper exists to prevent.
 *
 * Also a no-op when the caret is not inside a link, or on any selection failure.
 */
export function escapeLinkBoundary(editor) {
  if (!editor || !editor.selection || !editor._editorEl) return;
  const info = editor.selection.get();
  if (!info || !info.startNode || !info.collapsed) return;
  const anchor = getClosestTag(info.startNode, 'a', editor._editorEl);
  if (!anchor || !anchor.parentNode) return;
  const idx = Array.prototype.indexOf.call(anchor.parentNode.childNodes, anchor);
  editor.selection.set(anchor.parentNode, idx + 1, anchor.parentNode, idx + 1);
}
