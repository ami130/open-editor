/**
 * applyPropAcrossRange — Step 2 of the span-merge strategy.
 *
 * When a selection crosses multiple existing formatting spans (e.g. the user
 * selects "hello world" where "hello" is red and "world" is blue, then applies
 * a background color), this function sets the new property directly on each
 * intersecting formatting span instead of wrapping the whole range in a new
 * outer span. Bare text nodes inside the range are wrapped in a fresh span.
 *
 * Returns true if the range contained multiple nodes and was handled here.
 * Returns false when the range is within a single text node — callers fall
 * back to the normal wrapInSpan path in that case.
 */

// A formatting span: pure-style <span> with no id and no user class.
export function isFormattingSpan(n) {
  return n && n.nodeType === 1 && n.tagName.toLowerCase() === 'span' &&
    !n.id && !n.className && n.hasAttribute && n.hasAttribute('style');
}

export function applyPropAcrossRange(range, doc, styleProp, styleValue) {
  const ancestor = range.commonAncestorContainer;

  // If the common ancestor is a text node the selection is inside one run —
  // not a multi-span crossing. Let the caller handle it normally.
  if (!ancestor || ancestor.nodeType === 3) return false;

  // Collect direct children of the ancestor that are (partially) inside range.
  const children = Array.from(ancestor.childNodes);
  if (children.length === 0) return false;

  // Find the window of children that intersect the selection.
  const inside = children.filter((n) => {
    try { return range.intersectsNode ? range.intersectsNode(n) : true; }
    catch { return true; }
  });

  // Single child means we're not really crossing spans — let caller handle.
  if (inside.length <= 1) return false;

  let handled = false;

  for (const node of inside) {
    if (isFormattingSpan(node)) {
      // Formatting span fully or partially inside range: merge the property.
      node.style[styleProp] = styleValue;
      handled = true;

    } else if (node.nodeType === 3) {
      // Bare text node. Extract the in-range slice, wrap it.
      const text = node.nodeValue || '';
      if (!text) continue;

      // Determine the character slice that is inside the range.
      let startOff = 0;
      let endOff = text.length;

      if (node === range.startContainer) startOff = range.startOffset;
      if (node === range.endContainer)   endOff   = range.endOffset;

      if (startOff >= endOff) continue;

      // Split the text node so we only wrap the selected portion.
      // Strategy: carve out [startOff, endOff) as its own text node.
      if (endOff < text.length) node.splitText(endOff);    // tail split first — node holds [0,endOff)
      // Now split off the head (only if startOff > 0).
      let inRange = node;
      if (startOff > 0) inRange = node.splitText(startOff);
      // `inRange` now holds exactly [startOff, endOff) of the original text.

      const span = doc.createElement('span');
      span.style[styleProp] = styleValue;
      const tnParent = inRange.parentNode;
      tnParent.insertBefore(span, inRange);
      span.appendChild(inRange);
      // Merge adjacent text nodes split by splitText above.
      if (tnParent && tnParent.normalize) tnParent.normalize();
      handled = true;

    } else if (node.nodeType === 1) {
      // Non-formatting element inside the range (e.g. <strong>, <em>, <code>).
      // Only wrap text nodes that are actually within the range boundaries.
      const textNodes = [];
      (function collect(n) {
        if (n.nodeType === 3) { textNodes.push(n); return; }
        for (const ch of Array.from(n.childNodes)) collect(ch);
      })(node);
      const parents = new Set();
      for (const tn of textNodes) {
        try {
          if (range.intersectsNode && !range.intersectsNode(tn)) continue;
        } catch { /* proceed */ }
        const sp = doc.createElement('span');
        sp.style[styleProp] = styleValue;
        tn.parentNode.insertBefore(sp, tn);
        sp.appendChild(tn);
        parents.add(sp.parentNode);
      }
      if (parents.size) {
        for (const p of parents) { if (p && p.normalize) p.normalize(); }
        handled = true;
      }
    }
  }

  return handled;
}
