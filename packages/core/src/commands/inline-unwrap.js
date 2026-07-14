/**
 * Partial-aware unwrapping for inline formatting tags (strong/em/u/s/sup/sub).
 *
 * Extracted from text-commands.js to keep that file within the 300-line limit.
 * The hard problem this solves: when only PART of a formatted run is selected,
 * the formatting must be removed from exactly that part — without reordering
 * text and without leaving empty element husks behind. A naive
 * extract-and-reinsert reverses document order; this splits in place instead.
 */

// Remove empty inline element husks left behind when extractContents cuts
// through a nested element (e.g. selecting inside an <em> leaves an empty
// <em></em>). Recurses depth-first and drops any element with no text content
// and no element children. Operates on a fragment or element in place.
export function pruneEmptyInline(node) {
  if (!node) return;
  Array.from(node.childNodes).forEach((child) => {
    if (child.nodeType === 1) {
      pruneEmptyInline(child);
      const hasText = (child.textContent || '').length > 0;
      const hasEl = Array.from(child.childNodes).some((n) => n.nodeType === 1);
      // Keep void/replaced elements (br, img, hr) even though they have no text.
      const isVoid = /^(br|img|hr|wbr)$/i.test(child.tagName);
      if (!hasText && !hasEl && !isVoid) child.parentNode.removeChild(child);
    }
  });
}

// True when a DocumentFragment carries any real content (non-whitespace text
// or any element). Used to decide whether a before/after slice deserves to be
// re-wrapped, so we never leave empty <strong></strong> husks behind.
function fragHasContent(frag) {
  if (!frag || frag.childNodes.length === 0) return false;
  return (frag.textContent || '').length > 0 ||
    Array.from(frag.childNodes).some((n) => n.nodeType === 1);
}

/**
 * Unwrap the formatting tag `existing` from exactly the selected `range`.
 *
 * Splits existing into [before | selected | after], rebuilt in strict document
 * order at existing's position so text is NEVER reordered. The selected slice
 * is left unwrapped; the before/after slices are re-wrapped in fresh copies of
 * the tag — but only when they actually carry content (no empty husks). When
 * both before and after are empty the whole element is unwrapped (toggle-off).
 */
export function unwrapInline(existing, range, tag, doc, nativeSel) {
  const parent = existing.parentNode;
  if (!parent) return;

  // Capture the "before" slice (start-of-existing → selection start) first,
  // then the "after" slice (selection end → end-of-existing). extractContents
  // mutates existing, leaving exactly the selected content inside it.
  let beforeFragment, afterFragment;
  try {
    const beforeRange = doc.createRange();
    beforeRange.selectNodeContents(existing);
    beforeRange.setEnd(range.startContainer, range.startOffset);
    beforeFragment = beforeRange.extractContents();
  } catch { beforeFragment = doc.createDocumentFragment(); }
  try {
    const afterRange = doc.createRange();
    afterRange.selectNodeContents(existing);
    afterRange.setStart(range.endContainer, range.endOffset);
    afterFragment = afterRange.extractContents();
  } catch { afterFragment = doc.createDocumentFragment(); }

  // Whatever remains in existing is the selected content (to be unwrapped).
  const selectedFragment = doc.createDocumentFragment();
  while (existing.firstChild) selectedFragment.appendChild(existing.firstChild);

  const firstUnwrapped = selectedFragment.firstChild;
  const lastUnwrapped  = selectedFragment.lastChild;

  // Drop empty inline husks (e.g. an <em></em>) the split left in the slices.
  pruneEmptyInline(beforeFragment);
  pruneEmptyInline(afterFragment);

  // Rebuild left-to-right, inserting each piece BEFORE existing so order holds.
  if (fragHasContent(beforeFragment)) {
    const w = doc.createElement(tag);
    w.appendChild(beforeFragment);
    parent.insertBefore(w, existing);
  }
  parent.insertBefore(selectedFragment, existing);
  if (fragHasContent(afterFragment)) {
    const w = doc.createElement(tag);
    w.appendChild(afterFragment);
    parent.insertBefore(w, existing);
  }

  parent.removeChild(existing);

  // Re-select the unwrapped content so the toolbar active-state updates.
  try {
    if (firstUnwrapped && lastUnwrapped) {
      const r = doc.createRange();
      r.setStartBefore(firstUnwrapped);
      r.setEndAfter(lastUnwrapped);
      nativeSel.removeAllRanges();
      nativeSel.addRange(r);
    }
  } catch { /* ignore */ }
}
