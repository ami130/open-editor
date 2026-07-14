/**
 * image-dom-list.js — List-split helper for insertFigure (Step 5).
 * Extracted from image-dom.js to keep that file under the 300-line limit.
 */

/**
 * Split a <ul>/<ol> at a given <li>, returning { before, after }.
 * Items BEFORE li go into `before` (the original list, now shortened).
 * Items FROM li onward go into `after` (a new list with the same tag).
 * If li is the first item, `before` is null.
 * If li is the last item, `after` is null.
 */
export function _splitListAtLi(list, li, doc) {
  const tag = list.tagName.toLowerCase();
  const items = Array.from(list.children);
  const idx   = items.indexOf(li);
  if (idx === -1) return { before: list, after: null };

  // Items before li — they stay in the original list
  const beforeItems = items.slice(0, idx);
  // Items from li onward — move into new list
  const afterItems  = items.slice(idx);

  let before = null;
  let after  = null;

  if (beforeItems.length > 0) {
    before = list; // original list keeps the before items
    // Remove afterItems from original list
    for (const item of afterItems) list.removeChild(item);
  }

  if (afterItems.length > 0) {
    after = doc.createElement(tag);
    for (const item of afterItems) after.appendChild(item);
  }

  return { before, after };
}
