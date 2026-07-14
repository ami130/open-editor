/**
 * span-split.js — split a styled <span> at a selection's boundaries so the
 * selected slice can be treated independently of the surrounding text.
 *
 * Shared by:
 *  - color-commands.js  (removeTextColor/removeBackgroundColor partial clear)
 *  - style-commands.js  (partial re-color inside a same-property span)
 *
 * Given an ancestor `span` that the selection only PARTIALLY covers, split it
 * into up to three sibling parts — before / slice / after — and hand the slice
 * to `onSlice(spanClone)`. The `before`/`after` parts keep the original span's
 * styles; the slice's span is a fresh clone the caller mutates (set or clear a
 * property). Empty parts are omitted. Returns true if the split happened.
 */

// Clamp `range` to the intersection with `span`'s own content and return the
// three cloned fragments (before, mid, after). Null on failure.
function sliceFragments(doc, span, range) {
  const RangeCtor = doc.defaultView ? doc.defaultView.Range : Range;
  const mid = doc.createRange();
  mid.selectNodeContents(span);
  try {
    if (range.compareBoundaryPoints(RangeCtor.START_TO_START, mid) > 0) {
      mid.setStart(range.startContainer, range.startOffset);
    }
    if (range.compareBoundaryPoints(RangeCtor.END_TO_END, mid) < 0) {
      mid.setEnd(range.endContainer, range.endOffset);
    }
  } catch { return null; }
  const before = doc.createRange();
  before.selectNodeContents(span);
  const after = doc.createRange();
  after.selectNodeContents(span);
  try {
    before.setEnd(mid.startContainer, mid.startOffset);
    after.setStart(mid.endContainer, mid.endOffset);
    return {
      before: before.cloneContents(),
      mid: mid.cloneContents(),
      after: after.cloneContents(),
    };
  } catch { return null; }
}

/**
 * Split `span` around the part of it covered by `range`. `mutateSlice(clone)`
 * receives a shallow clone of the span for the selected slice and should set or
 * clear the relevant style property on it. Returns the slice span (or its bare
 * children, when its style becomes empty) — or null if nothing was split.
 */
export function splitStyledSpan(doc, span, range, mutateSlice) {
  const parent = span.parentNode;
  if (!parent) return null;
  const frags = sliceFragments(doc, span, range);
  if (!frags) return null;
  const nodes = [];
  if (frags.before.textContent) {
    const s = span.cloneNode(false); s.appendChild(frags.before); nodes.push(s);
  }
  let sliceEl = null;
  if (frags.mid.textContent) {
    const s = span.cloneNode(false);
    mutateSlice(s);
    const styleVal = s.getAttribute('style');
    if (!styleVal || !styleVal.trim()) {
      // Style emptied → bare content, no orphan span. Detach children as we go.
      let child;
      while ((child = frags.mid.firstChild)) { frags.mid.removeChild(child); nodes.push(child); }
    } else { s.appendChild(frags.mid); nodes.push(s); sliceEl = s; }
  }
  if (frags.after.textContent) {
    const s = span.cloneNode(false); s.appendChild(frags.after); nodes.push(s);
  }
  for (const n of nodes) parent.insertBefore(n, span);
  parent.removeChild(span);
  if (parent.normalize) parent.normalize();
  return sliceEl;
}

// A pure-style <span> carrying `styleProp` (no id/class): the shape wrapInSpan
// updates in place. Kept local so span-split has no dependency on style-commands.
function isStyledSpan(n, styleProp) {
  return n && n.nodeType === 1 && n.tagName.toLowerCase() === 'span' && n.style[styleProp];
}

/**
 * H1 fix for wrapInSpan: when `info.range` sits PARTIALLY inside a span that
 * already carries `styleProp`, split that span so the selected slice becomes a
 * sibling with `styleValue` — instead of nesting a fresh span inside the old
 * one. Returns true when it handled the case; false to fall through.
 *
 * `walkUp` is passed in to avoid a range-utils import here (keeps the module
 * dependency-light and the 300-line budgets happy).
 */
export function recolorPartialSpan(doc, root, info, styleProp, styleValue, walkUp) {
  const enclosing = walkUp(info.startNode, root, (n) => isStyledSpan(n, styleProp));
  if (!enclosing) return false;
  if (!enclosing.contains(info.range.startContainer) ||
      !enclosing.contains(info.range.endContainer) ||
      info.range.toString() === enclosing.textContent) return false;
  return !!splitStyledSpan(doc, enclosing, info.range, (s) => { s.style[styleProp] = styleValue; });
}
