/**
 * List keyboard handlers — Tab/Shift+Tab nesting and double-Enter exit.
 * Split out of list-commands.js to keep both within the 300-line limit. These
 * are NOT registered commands; they run from the keydown handler in
 * editor-events.js before the default Tab/Enter behaviour.
 */

import { nearestLi, nearestList, placeCursor } from './list-dom.js';
import { indentLi, outdentLi } from './list-dom-indent.js';

function editorEl(editor)   { return editor.getEditorElement(); }
function getDoc(editor)     { return editor._iframeDoc || document; }
function getSelInfo(editor) { return editor.selection ? editor.selection.get() : null; }

// ─── Tab / Shift+Tab inside list ─────────────────────────────────────────────
//
// Jodit: Tab only indents when cursor is at the very START of the list item
// (position 0). Otherwise Tab falls through to normal behaviour (do nothing
// special — the browser or other plugins handle it).

// Returns true if the cursor is at the visual start of the li.
// Walks leftward through the DOM tree from the cursor position up to the <li>,
// checking that nothing to the left has any visible text content.
// Correctly handles formatted starts: <li><strong>|bold</strong></li> → true
//                                      <li><strong>bold</strong>|</li> → false
function isAtLiStart(li, info) {
  if (!info || !info.range) return false;
  if (!info.collapsed) return false;

  let node = info.range.startContainer;
  const offset = info.range.startOffset;

  // Text node with characters to the left → definitely not at start
  if (node.nodeType === 3 && offset > 0) return false;

  // Walk up to li, verifying every preceding sibling (at each ancestor level)
  // has no real text content. Inline elements like <strong>/<em>/<a> are only
  // a blocker if they contain visible text — an empty inline wrapper is fine.
  while (node && node !== li) {
    let sib = node.previousSibling;
    while (sib) {
      // Non-empty text node to the left → not at start
      if (sib.nodeType === 3 && sib.textContent.replace(/\u200B/g, '') !== '') return false;
      // Element to the left: only blocks if it has visible text content
      // (covers <strong>text</strong>, <em>text</em>, <a>text</a>, etc.)
      if (sib.nodeType === 1 && sib.tagName.toLowerCase() !== 'br') {
        if (sib.textContent.replace(/\u200B/g, '') !== '') return false;
      }
      sib = sib.previousSibling;
    }
    node = node.parentNode;
  }
  return true;
}

export function handleListTab(editor, shiftKey) {
  if (editor._config && editor._config.readonly) return false;
  const info = getSelInfo(editor);
  if (!info) return false;
  const root = editorEl(editor);
  const li = nearestLi(info.startNode, root);
  if (!li) return false;

  // Both Tab and Shift+Tab only fire when cursor is at the start of the li.
  // Jodit's isSameLeftCursorPosition check — mid-text Tab/Shift+Tab passes through.
  if (!isAtLiStart(li, info)) return false;

  // Tab/Shift+Tab = structural nesting (indentLi/outdentLi), not margin.
  const doc = getDoc(editor);
  if (shiftKey) {
    const result = outdentLi(doc, root, li);
    if (result) placeCursor(result.node, editor);
    else        placeCursor(li, editor);
    return true;
  } else {
    // Tab on first item (no previous sibling): let key pass through (Issue 9)
    if (!li.previousElementSibling) return false;
    const result = indentLi(doc, li);
    if (result) placeCursor(result, editor);
    else        placeCursor(li, editor);
    return true;
  }
}

// ─── Double-Enter on empty <li> exits the list ───────────────────────────────

function isEmptyLi(li) {
  if (li.querySelector('ul, ol, dl')) return false;
  const text = (li.textContent || '').replace(/[\u200B\u200C\u2060\uFEFF]/g, '').replace(/\u200D/g, '').trim();
  return text === '' || (li.childNodes.length === 1 &&
    li.firstChild.nodeType === 1 && li.firstChild.tagName.toLowerCase() === 'br');
}

export function handleListEnter(editor) {
  if (editor._config && editor._config.readonly) return false;
  const info = getSelInfo(editor);
  if (!info) return false;
  const root = editorEl(editor);
  const li   = nearestLi(info.startNode, root);
  const list = nearestList(info.startNode, root);
  if (!li || !list || !isEmptyLi(li)) return false;

  const doc = getDoc(editor);

  // Collect any siblings AFTER the empty li inside the same list —
  // they must travel with the exit so they aren't orphaned (Jodit behaviour).
  const trailingLis = [];
  let sib = li.nextElementSibling;
  while (sib) {
    const next = sib.nextElementSibling;
    trailingLis.push(sib);
    sib = next;
  }

  // Jodit: nested empty <li> → exit to new <li> at parent level.
  //        top-level empty <li> → exit to <p> after the list.
  const parentLi = nearestLi(list, root);
  const isNested = !!parentLi;

  if (isNested) {
    const newLi = doc.createElement('li');
    newLi.appendChild(doc.createElement('br'));
    const parentList = parentLi.parentNode;
    // Insert new li after the parent li
    parentList.insertBefore(newLi, parentLi.nextSibling);
    // Remove empty li
    li.parentNode.removeChild(li);
    // If there were trailing siblings, keep them in their existing sublist
    // (they stay in `list` which is still attached to parentLi)
    if (list.children.length === 0 && list.parentNode) list.parentNode.removeChild(list);
    // If trailing items existed, append them in a new sublist after newLi
    if (trailingLis.length > 0) {
      const sub = doc.createElement(list.tagName.toLowerCase());
      for (const t of trailingLis) sub.appendChild(t);
      parentList.insertBefore(sub, newLi.nextSibling);
    }
    placeCursor(newLi, editor);
  } else {
    const p = doc.createElement('p');
    p.appendChild(doc.createElement('br'));
    if (list.parentNode) list.parentNode.insertBefore(p, list.nextSibling);
    // If there were trailing items, they stay in the list (list stays in DOM)
    li.parentNode.removeChild(li);
    if (list.children.length === 0 && list.parentNode) list.parentNode.removeChild(list);
    // Trailing items that were after the empty li: keep them in a continuation list
    if (trailingLis.length > 0) {
      const cont = doc.createElement(list.tagName.toLowerCase());
      for (const t of trailingLis) cont.appendChild(t);
      if (p.parentNode) p.parentNode.insertBefore(cont, p.nextSibling);
    }
    placeCursor(p, editor);
  }
  return true;
}
