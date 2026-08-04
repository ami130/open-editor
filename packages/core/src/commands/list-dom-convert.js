/**
 * list-dom-convert.js — list TYPE conversion (ul↔ol) and adjacent-list merging.
 * Split out of list-dom.js to keep it within the 300-line limit.
 */

import { isList } from './list-dom.js';

// list-style-type values valid only on <ol> (numeric/alpha/roman) vs the bullet
// markers valid only on <ul>. Used to drop an incompatible marker on convert.
const OL_ONLY_MARKERS = new Set([
  'decimal', 'decimal-leading-zero', 'lower-roman', 'upper-roman',
  'lower-alpha', 'upper-alpha', 'lower-latin', 'upper-latin', 'lower-greek',
]);
const UL_ONLY_MARKERS = new Set(['disc', 'circle', 'square']);

/**
 * Convert a list's tag in-place (ul↔ol). Returns the new list element.
 * L6: a list-style-type that is invalid for the TARGET tag (a bullet marker on
 * an <ol>, or a numeric marker on a <ul>) is dropped, so an ordered list never
 * renders bullets (and vice-versa). Other attributes (id/class/start/data-*)
 * are preserved.
 */
export function convertListType(doc, list, newTag) {
  if (list.tagName.toLowerCase() === newTag) return list;
  const newList = doc.createElement(newTag);
  for (const attr of Array.from(list.attributes)) {
    newList.setAttribute(attr.name, attr.value);
  }
  // Strip a now-incompatible inline marker for the new list type.
  const marker = (newList.style.listStyleType || '').toLowerCase();
  if (marker) {
    const invalid = newTag === 'ol' ? UL_ONLY_MARKERS.has(marker)
      : newTag === 'ul' ? OL_ONLY_MARKERS.has(marker)
      : false;
    if (invalid) {
      newList.style.listStyleType = '';
      if (!newList.getAttribute('style')) newList.removeAttribute('style');
    }
  }
  while (list.firstChild) newList.appendChild(list.firstChild);
  list.parentNode.replaceChild(newList, list);
  return newList;
}

/**
 * L9: merge `list` with an immediately-adjacent sibling list of the SAME tag so
 * a new list next to an existing one collapses into a single list (rather than
 * two sibling <ul>s). To avoid silently destroying distinct styling, only merge
 * siblings that share the same inline list-style-type (both unset counts as
 * same). Returns the surviving (merged) list — always `list` itself.
 */
export function coalesceAdjacentLists(list) {
  if (!isList(list)) return list;
  const tag = list.tagName.toLowerCase();
  const sameKind = (other) =>
    isList(other) && other.tagName.toLowerCase() === tag &&
    (other.style.listStyleType || '') === (list.style.listStyleType || '');

  // Absorb a matching PREVIOUS sibling (prepend its items).
  const prev = list.previousElementSibling;
  if (prev && sameKind(prev)) {
    while (prev.lastChild) list.insertBefore(prev.lastChild, list.firstChild);
    prev.parentNode.removeChild(prev);
  }
  // Absorb a matching NEXT sibling (append its items).
  const next = list.nextElementSibling;
  if (next && sameKind(next)) {
    while (next.firstChild) list.appendChild(next.firstChild);
    next.parentNode.removeChild(next);
  }
  return list;
}
