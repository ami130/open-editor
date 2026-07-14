/**
 * inline-toggle-range.js — range-aware helpers for inline-format toggles.
 * Extracted from text-commands.js (300-line limit).
 *
 * These make bold/italic/etc. toggle correctly for selections that span
 * MULTIPLE formatted regions or MIX formatted + unformatted text:
 *  - selectionFullyFormatted: is EVERY selected character already in `tag`?
 *  - unwrapAcrossRange: remove `tag` from every formatted region the range hits.
 */
import { walkUp } from '../selection/range-utils.js';
import { unwrapInline } from './inline-unwrap.js';

// Collect the text nodes that actually fall inside `range` (partial-overlap ok).
function textNodesInRange(range, root) {
  const out = [];
  const scopeNode = range.commonAncestorContainer;
  const scope = scopeNode.nodeType === 1 ? scopeNode : scopeNode.parentNode;
  const container = (scope && root.contains(scope)) ? scope : root;
  (function walk(n) {
    if (n.nodeType === 3) {
      if (!n.nodeValue) return;
      try { if (range.intersectsNode ? range.intersectsNode(n) : true) out.push(n); }
      catch { out.push(n); }
    } else {
      for (const ch of Array.from(n.childNodes)) walk(ch);
    }
  })(container);
  return out;
}

/**
 * True when EVERY non-whitespace text node the selection touches is already
 * inside an element named `tag` (i.e. the whole selection is formatted). An
 * empty selection or one with no real text is treated as not-fully-formatted so
 * the caller takes the ADD path.
 */
export function selectionFullyFormatted(range, root, tag) {
  const nodes = textNodesInRange(range, root).filter((n) => n.nodeValue.trim() !== '');
  if (nodes.length === 0) return false;
  return nodes.every((n) => !!walkUp(n, root, (el) =>
    el.nodeType === 1 && el.tagName.toLowerCase() === tag));
}

/**
 * Flatten redundant same-tag descendants inside a freshly-wrapped element.
 * Wrapping a mixed selection (part already formatted) in a new `tag` leaves the
 * old inner `tag` nested inside the new one (e.g. <strong><strong>bc</strong>de
 * </strong>) — visually correct but messy. Lift the inner ones' children out
 * and drop the now-redundant inner elements.
 */
export function denestSameTag(wrapper, tag) {
  if (!wrapper || !wrapper.querySelectorAll) return;
  for (const inner of Array.from(wrapper.querySelectorAll(tag))) {
    const parent = inner.parentNode;
    if (!parent) continue;
    while (inner.firstChild) parent.insertBefore(inner.firstChild, inner);
    parent.removeChild(inner);
  }
  if (wrapper.normalize) wrapper.normalize();
}

/**
 * Remove `tag` from every formatted region the range intersects. Each distinct
 * `tag` ancestor is unwrapped once via the partial-aware unwrapInline, using a
 * per-element range clamped to the original selection so unselected text keeps
 * its formatting. Processes deepest/last first so earlier unwraps don't
 * invalidate the DOM positions of later ones.
 */
export function unwrapAcrossRange(range, root, tag, doc, nativeSel) {
  const nodes = textNodesInRange(range, root);
  const targets = [];
  for (const n of nodes) {
    const el = walkUp(n, root, (e) =>
      e.nodeType === 1 && e.tagName.toLowerCase() === tag);
    if (el && !targets.includes(el)) targets.push(el);
  }
  if (!targets.length) return;

  // Single target that ENCLOSES both selection endpoints → this is the ordinary
  // partial/full unwrap; hand the ORIGINAL range straight to unwrapInline so its
  // before/selected/after split is exact (preserves the mid-word/leading/
  // trailing partial-unwrap behaviour).
  if (targets.length === 1 &&
      targets[0].contains(range.startContainer) &&
      targets[0].contains(range.endContainer)) {
    unwrapInline(targets[0], range, tag, doc, nativeSel);
    return;
  }

  // Multiple targets (selection spans several formatted regions/blocks). For
  // each, clamp a per-element range to the selection so unselected text outside
  // this element keeps its formatting. A boundary inside this element uses the
  // real offset; a boundary outside it uses the element's own edge.
  const startsInside = (el) => el.contains(range.startContainer);
  const endsInside   = (el) => el.contains(range.endContainer);
  // Later-in-document first so removing one doesn't shift the others' offsets.
  targets.sort((a, b) =>
    (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) ? 1 : -1);
  for (const el of targets) {
    const r = doc.createRange();
    r.selectNodeContents(el);
    if (startsInside(el)) r.setStart(range.startContainer, range.startOffset);
    if (endsInside(el))   r.setEnd(range.endContainer, range.endOffset);
    unwrapInline(el, r, tag, doc, nativeSel);
  }
}
