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

/** Mark `li` as a to-do item with the given checked state. */
export function markAsTodoItem(li, checked) {
  li.setAttribute('data-todo', '');
  li.setAttribute('data-checked', checked ? 'true' : 'false');
  li.setAttribute('role', 'checkbox');
  li.setAttribute('aria-checked', checked ? 'true' : 'false');
  li.tabIndex = 0;
}

export function isTodoItem(li) {
  return !!(li && li.nodeType === 1 && li.tagName === 'LI' && li.hasAttribute('data-todo'));
}

export function isChecked(li) {
  return li.getAttribute('data-checked') === 'true';
}

export function setChecked(li, checked) {
  li.setAttribute('data-checked', checked ? 'true' : 'false');
  li.setAttribute('aria-checked', checked ? 'true' : 'false');
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
      li.setAttribute('aria-checked', isChecked(li) ? 'true' : 'false');
    }
  }
}
