/**
 * Structural list-item indent/outdent helpers (Tab / Shift+Tab nesting).
 * Split out of list-dom.js to keep both within the 300-line limit. Used by
 * list-keyboard.js.
 */

import { isList, copyBlockAttrs } from './list-dom.js';
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

  // Case A: NOT a true nested list. A list is "nested" (Case B) only when it is
  // a DIRECT child of an <li> (the valid <li><ul>… structure). L12: the old
  // check walked all the way up with nearestLi, so a list inside a <td>/<div>
  // whose far ancestor happened to be an <li> was mis-treated as nested and
  // produced an <li> stranded directly under a <td>. Testing listParent
  // directly keeps the outdent inside its real container.
  const isNested = listParent && listParent.nodeType === 1 &&
    listParent.tagName.toLowerCase() === 'li';
  if (!isNested) {
    const p = doc.createElement('p');
    // I8: carry the <li>'s own formatting (align/line-height/id/class/dir) onto
    // the new <p> — alignment is stored on the <li>, so outdenting to a paragraph
    // used to silently drop it (heading→p conversion already copies style).
    copyBlockAttrs(li, p);
    // M5 fix: MOVE the li's children into the new <p> (do not clone). Cloning
    // discarded node identity — any contenteditable="false" island, image with
    // attached resize/selection state, or element referenced elsewhere became a
    // detached orphan while a dead copy lived in the DOM. Array.from snapshots
    // the live childNodes so moving during iteration is safe.
    //
    // L1 fix: nested sublists must be PRESERVED, not deleted with the li. Split
    // the li's children in DOM order: inline/text content goes into the <p>;
    // a nested sublist and everything after it is promoted to follow the <p>
    // as its own top-level list (so "outdent a parent" keeps its children).
    const promoted = [];
    let hitList = false;
    for (const child of Array.from(li.childNodes)) {
      if (isList(child)) hitList = true;   // this child + all after it are promoted
      if (hitList) promoted.push(child);
      else p.appendChild(child);
    }
    if (!p.firstChild) p.appendChild(doc.createElement('br'));

    list.parentNode.insertBefore(p, list.nextSibling);
    // Insert promoted nodes (nested sublists / trailing content) right after <p>.
    let ref = p.nextSibling;
    for (const node of promoted) {
      p.parentNode.insertBefore(node, ref);
      ref = node.nextSibling;
    }
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
    if (!existingSub) {
      li.appendChild(sub);
      // L13: match indentLi — vary the marker by depth so this regenerated
      // sublist doesn't revert to the default bullet, staying visually
      // consistent with sublists created via Tab.
      sub.style.listStyleType = markerForDepth(subTag, listDepth(sub));
    }
  }

  parentList.insertBefore(li, parentLi.nextSibling);
  if (list.children.length === 0 && list.parentNode) list.parentNode.removeChild(list);

  return { node: li, wasConverted: false };
}
