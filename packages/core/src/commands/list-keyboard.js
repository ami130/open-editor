/**
 * List keyboard handlers — Tab/Shift+Tab nesting and double-Enter exit.
 * Split out of list-commands.js to keep both within the 300-line limit. These
 * are NOT registered commands; they run from the keydown handler in
 * editor-events.js before the default Tab/Enter behaviour.
 */

import { nearestLi, nearestList, placeCursor } from './list-dom.js';
import { indentLi, outdentLi } from './list-dom-indent.js';
import { featureForCommand } from '../entitlements/feature-catalog.js';

function editorEl(editor)   { return editor.getEditorElement(); }
function getDoc(editor)     { return editor._iframeDoc || document; }
function getSelInfo(editor) { return editor.selection ? editor.selection.get() : null; }
// L15: readonly can be signalled via either source — check BOTH (editor-events
// uses _state.isReadOnly; the config flag is _config.readonly) so a divergence
// between them can't let a structural edit slip through in a readonly editor.
function isReadonly(editor) {
  return !!((editor._config && editor._config.readonly) ||
    (editor._state && editor._state.isReadOnly));
}

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
  if (isReadonly(editor)) return false;
  // Feature gating (Phase 2 leak-fix): Tab/Shift+Tab list nesting runs straight
  // from keydown — it does NOT go through commands.execute, so it must gate
  // itself or it bypasses list.indent gating. When list.indent isn't granted,
  // return false so the key passes through normally (no structural nesting).
  const indentFeature = featureForCommand('indent'); // → 'list.indent'
  if (indentFeature && editor.isFeatureGranted && !editor.isFeatureGranted(indentFeature)) return false;
  const info = getSelInfo(editor);
  if (!info) return false;
  const root = editorEl(editor);
  const li = nearestLi(info.startNode, root);
  if (!li) return false;

  // Tab/Shift+Tab = structural nesting (indentLi/outdentLi), not margin.
  const doc = getDoc(editor);
  if (shiftKey) {
    // L11: Shift+Tab OUTDENTS from anywhere in the line — most editors un-nest
    // regardless of the caret column (the old li-start gate blocked mid-text
    // Shift+Tab, so users couldn't outdent without first moving to line start).
    const result = outdentLi(doc, root, li);
    if (result) placeCursor(result.node, editor);
    else        placeCursor(li, editor);
    return true;
  } else {
    // Tab INDENTS only at the very start of the item (Jodit's
    // isSameLeftCursorPosition) — mid-text Tab passes through so the browser can
    // do its default. On the first item (no previous sibling) it also passes
    // through (can't nest without a preceding item to nest under).
    if (!isAtLiStart(li, info)) return false;
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

// L10: an <li> whose OWN direct content is empty but which OWNS a sublist (an
// "outline parent" like <li>|<ul>\u2026</ul></li>). isEmptyLi rejects it (so the
// exit-to-<p> path never fires and the user is trapped). Detect it separately.
function isEmptyParentWithSublist(li) {
  const firstList = Array.from(li.children).find(
    (c) => c.tagName && (c.tagName.toLowerCase() === 'ul' || c.tagName.toLowerCase() === 'ol')
  );
  if (!firstList) return false;
  // Direct content BEFORE the sublist must be visually empty.
  let direct = '';
  for (const child of Array.from(li.childNodes)) {
    if (child === firstList) break;
    direct += child.textContent || '';
  }
  return direct.replace(/[\u200B\u200C\u2060\uFEFF]/g, '').replace(/\u200D/g, '').trim() === '';
}

// Enter on an empty outline-parent: dissolve it by lifting its sublist's items
// up to replace it, so the user escapes and no child content is lost.
function exitEmptyParent(editor, li, list) {
  const sub = Array.from(li.children).find(
    (c) => c.tagName && (c.tagName.toLowerCase() === 'ul' || c.tagName.toLowerCase() === 'ol')
  );
  if (!sub) return false;
  // Move the sublist's items up into `list` at the empty li's position.
  const ref = li;
  for (const child of Array.from(sub.children)) list.insertBefore(child, ref);
  const firstPromoted = ref.previousElementSibling;
  if (li.parentNode) li.parentNode.removeChild(li);   // removes the now-empty parent + its empty sublist
  if (firstPromoted) placeCursor(firstPromoted, editor);
  return true;
}

// NOTE (feature gating): handleListEnter is intentionally NOT gated. Enter on an
// empty <li> EXITS the list (a cleanup/escape action, like Backspace) — it never
// CREATES list structure, so it belongs with the always-on core. Gating it would
// trap a user inside a list they can't leave. (Tab-nesting IS gated above.)
export function handleListEnter(editor) {
  if (isReadonly(editor)) return false;
  const info = getSelInfo(editor);
  if (!info) return false;
  const root = editorEl(editor);
  const li   = nearestLi(info.startNode, root);
  const list = nearestList(info.startNode, root);
  if (!li || !list) return false;

  const doc = getDoc(editor);

  // L10: empty outline-parent (empty direct content + a sublist) → dissolve it,
  // promoting the sublist's items so the user isn't trapped and nothing is lost.
  // (If the caret were inside the sublist, `li` would be that inner item, which
  // owns no sublist, so this branch wouldn't fire.)
  if (!isEmptyLi(li) && isEmptyParentWithSublist(li)) {
    return exitEmptyParent(editor, li, list);
  }
  if (!isEmptyLi(li)) return false;

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

  // Build the continuation list for trailing items, mirroring the source list's
  // tag + inline marker so a numbered/styled list keeps its style after exit.
  const makeContinuation = () => {
    const cont = doc.createElement(list.tagName.toLowerCase());
    if (list.style.listStyleType) cont.style.listStyleType = list.style.listStyleType;
    for (const t of trailingLis) cont.appendChild(t);
    return cont;
  };

  // L3 fix: move trailing items OUT of `list` FIRST, then remove the empty li,
  // then drop `list` only if it is now truly empty. The old order checked
  // emptiness before the trailing items were moved, leaving a stray empty <ul>
  // whenever the empty li was the FIRST item.
  if (isNested) {
    const newLi = doc.createElement('li');
    newLi.appendChild(doc.createElement('br'));
    const parentList = parentLi.parentNode;
    parentList.insertBefore(newLi, parentLi.nextSibling);
    if (li.parentNode) li.parentNode.removeChild(li);
    if (trailingLis.length > 0) {
      parentList.insertBefore(makeContinuation(), newLi.nextSibling);
    }
    if (list.children.length === 0 && list.parentNode) list.parentNode.removeChild(list);
    placeCursor(newLi, editor);
  } else {
    const p = doc.createElement('p');
    p.appendChild(doc.createElement('br'));
    if (list.parentNode) list.parentNode.insertBefore(p, list.nextSibling);
    if (li.parentNode) li.parentNode.removeChild(li);
    if (trailingLis.length > 0 && p.parentNode) {
      p.parentNode.insertBefore(makeContinuation(), p.nextSibling);
    }
    if (list.children.length === 0 && list.parentNode) list.parentNode.removeChild(list);
    placeCursor(p, editor);
  }
  return true;
}
