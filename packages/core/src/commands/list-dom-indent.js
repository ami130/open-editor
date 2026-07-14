/**
 * Structural list-item indent/outdent helpers (Tab / Shift+Tab nesting).
 * Split out of list-dom.js to keep both within the 300-line limit. Used by
 * list-keyboard.js.
 */

import { isList, nearestLi } from './list-dom.js';
import { markerForDepth, listDepth } from './list-style-depth.js';

/**
 * Indent: nest `li` into a sub-list under its previous sibling.
 * Returns the moved li, or null if it cannot be indented (no previous sibling).
 */
export function indentLi(doc, li) {
  const list = li.parentNode;
  if (!list || !isList(list)) return null;
  const prev = li.previousElementSibling;
  if (!prev) return null;

  const tag = list.tagName.toLowerCase();

  let subList = null;
  for (let i = prev.childNodes.length - 1; i >= 0; i--) {
    const c = prev.childNodes[i];
    if (c.nodeType === 1 && c.tagName.toLowerCase() === tag) { subList = c; break; }
  }
  const isNewSubList = !subList;
  if (isNewSubList) {
    subList = doc.createElement(tag);
    prev.appendChild(subList);
    // 16.7.1 — auto-vary the marker per nesting depth (disc→circle→square,
    // decimal→lower-alpha→lower-roman→…) so a level-2 bullet doesn't render
    // identically to level-1. Only on a BRAND NEW sublist — reusing an
    // existing one (a later sibling indenting into it) must never clobber a
    // style the user picked via the toolbar.
    subList.style.listStyleType = markerForDepth(tag, listDepth(subList));
  }
  subList.appendChild(li);
  return li;
}

/**
 * Outdent: move `li` one level up.
 *
 * Case A — top-level list: convert li to <p>, insert after list.
 * Case B — nested list: move li after grandparent li; trailing siblings
 *           become a new sub-list nested under li.
 *
 * Returns { node, wasConverted } or null.
 */
export function outdentLi(doc, root, li) {
  const list = li.parentNode;
  if (!list || !isList(list)) return null;

  const listParent = list.parentNode;

  // Case A: top-level
  if (listParent === root || !nearestLi(listParent, root)) {
    const p = doc.createElement('p');
    // M5 fix: MOVE the li's children into the new <p> (do not clone). Cloning
    // discarded node identity — any contenteditable="false" island, image with
    // attached resize/selection state, or element referenced elsewhere became a
    // detached orphan while a dead copy lived in the DOM. Array.from snapshots
    // the live childNodes so moving during iteration is safe. Nested sublists
    // are left in place on the li (removed with it below).
    for (const child of Array.from(li.childNodes)) {
      if (!isList(child)) p.appendChild(child);
    }
    if (!p.firstChild) p.appendChild(doc.createElement('br'));

    list.parentNode.insertBefore(p, list.nextSibling);
    li.parentNode.removeChild(li);
    if (list.children.length === 0 && list.parentNode) list.parentNode.removeChild(list);
    return { node: p, wasConverted: true };
  }

  // Case B: nested
  const parentLi   = listParent;
  const parentList = parentLi.parentNode;
  if (!parentList) return null;

  const trailing = [];
  let sib = li.nextElementSibling;
  while (sib) {
    const next = sib.nextElementSibling;
    trailing.push(sib);
    sib = next;
  }
  if (trailing.length > 0) {
    const subTag = list.tagName.toLowerCase();
    let existingSub = null;
    for (let i = li.childNodes.length - 1; i >= 0; i--) {
      const c = li.childNodes[i];
      if (c.nodeType === 1 && c.tagName.toLowerCase() === subTag) { existingSub = c; break; }
    }
    const sub = existingSub || doc.createElement(subTag);
    for (const t of trailing) sub.appendChild(t);
    if (!existingSub) li.appendChild(sub);
  }

  parentList.insertBefore(li, parentLi.nextSibling);
  if (list.children.length === 0 && list.parentNode) list.parentNode.removeChild(list);

  return { node: li, wasConverted: false };
}
