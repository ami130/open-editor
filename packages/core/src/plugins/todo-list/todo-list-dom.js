/**
 * todo-list-dom.js — pure DOM helpers for to-do lists (16.7.3).
 *
 * A to-do list is a REAL <ul data-todo-list><li data-todo data-checked="…">
 * — not a raw <input type="checkbox">, which the sanitizer fully denies
 * (DENY_TAGS_FULL) as a form-injection/XSS surface with no narrow safe
 * exception like the iframe-embed allowlist has. The checkbox itself is a
 * CSS-drawn ::before on the <li> (todo-list-styles.js), toggled by click or
 * keyboard — zero new sanitizer surface, fully real ARIA via role="checkbox"
 * + aria-checked. Because it's a genuine <ul>/<li>, all of the EXISTING list
 * infrastructure (indent/outdent, Enter-exit-empty-item, native browser
 * Enter-splits-a-non-empty-li) already works on it unmodified.
 */

/**
 * Build a fresh <ul data-todo-list> with one unchecked, EMPTY <li data-todo>
 * — deliberately no placeholder <br>, so a caller transferring existing block
 * content into it (insertTodoList) doesn't have to remove one first. A
 * caller that wants a genuinely empty item (nothing to transfer) adds the
 * <br> itself.
 */
export function createTodoList(doc) {
  const ul = doc.createElement('ul');
  ul.setAttribute('data-todo-list', '');
  const li = doc.createElement('li');
  markAsTodoItem(li, false);
  ul.appendChild(li);
  return ul;
}

/**
 * Ensure the li's first child is the semantic checkbox carrier. 17.5-sweep
 * ARIA fix: role="checkbox" ON THE LI destroyed its listitem role, breaking
 * <ul> structure for AT (axe `list`, WCAG 1.3.1, found by the a11y sweep the
 * moment the sanitizer stopped stripping the role). The role now lives on an
 * inner zero-footprint <span> over the CSS-drawn glyph — the li stays a real
 * list item. Also the click target (cleaner than pixel-zone math).
 */
export function ensureCheckBox(li) {
  let box = li.querySelector(':scope > .oe-todo-check');
  if (!box) {
    box = li.ownerDocument.createElement('span');
    box.className = 'oe-todo-check';
    box.setAttribute('role', 'checkbox');
    box.setAttribute('contenteditable', 'false');
    box.setAttribute('aria-label', 'To-do');
    li.insertBefore(box, li.firstChild);
  }
  box.setAttribute('aria-checked', isChecked(li) ? 'true' : 'false');
  return box;
}

/** Mark `li` as a to-do item with the given checked state. */
export function markAsTodoItem(li, checked) {
  li.setAttribute('data-todo', '');
  li.setAttribute('data-checked', checked ? 'true' : 'false');
  // Legacy cleanup (pre-sweep builds put checkbox semantics on the li itself).
  li.removeAttribute('role');
  li.removeAttribute('aria-checked');
  li.removeAttribute('tabindex');
  ensureCheckBox(li);
}

export function isTodoItem(li) {
  return !!(li && li.nodeType === 1 && li.tagName === 'LI' && li.hasAttribute('data-todo'));
}

export function isChecked(li) {
  return li.getAttribute('data-checked') === 'true';
}

export function setChecked(li, checked) {
  li.setAttribute('data-checked', checked ? 'true' : 'false');
  ensureCheckBox(li);
}

export function toggleChecked(li) {
  setChecked(li, !isChecked(li));
}

/**
 * Call after any input inside a to-do list to normalize every item: any li
 * inside a data-todo-list that's missing data-todo (from an outdent/indent
 * moving it in, or the browser cloning attributes oddly) gets a fresh
 * unchecked marker, and every real item's aria-checked is kept in sync with
 * data-checked. Does NOT attempt to detect/reset a "freshly split from a
 * checked item" li here — that's a strictly ordering-dependent problem
 * (must know the state at the moment BEFORE the split, not after), handled
 * instead by todo-list-plugin.js's onKeyDown intercepting Enter directly.
 */
export function normalizeTodoList(ul) {
  for (const li of ul.children) {
    if (li.tagName !== 'LI') continue;
    if (!li.hasAttribute('data-todo')) {
      markAsTodoItem(li, false);
    } else {
      // Re-run the marker path: syncs the box and strips legacy li-level ARIA.
      markAsTodoItem(li, isChecked(li));
    }
    // A contenteditable=false box as the ONLY child leaves Firefox's caret
    // with no valid text anchor (post-Enter-split the new li was untypable —
    // the empty-caret-target bug class again). Guarantee a <br> line anchor
    // when the item has no real content.
    if (li.textContent === '' && !li.querySelector(':scope > :not(.oe-todo-check)')) {
      li.appendChild(li.ownerDocument.createElement('br'));
    }
  }
}
