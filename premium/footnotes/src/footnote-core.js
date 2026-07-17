/**
 * footnote-core.js — the pure DOM logic for footnotes. No editor, no history,
 * no window; operates on a passed-in root element + document, so it's fully
 * unit-testable.
 *
 * Canonical shape (verified against the sanitizer allowlist so it round-trips):
 *   reference marker (inline, atomic island):
 *     <sup class="oe-footnote-ref" contenteditable="false"
 *          data-oe-footnote-ref="N" id="fnref-N">N</sup>
 *   notes section (block, appended at document end):
 *     <ol class="oe-footnotes" data-oe-footnotes>
 *       <li id="fn-N" data-oe-footnote="N">note text…</li>
 *     </ol>
 *
 * The invariant renumber() maintains: markers are numbered 1..N in DOCUMENT
 * ORDER, and the notes section has exactly one <li> per marker, in that order,
 * preserving each note's existing text across renumbering.
 */

export const REF_SELECTOR = 'sup.oe-footnote-ref[data-oe-footnote-ref]';
export const SECTION_SELECTOR = 'ol.oe-footnotes[data-oe-footnotes]';

/** Create a fresh reference marker node (unnumbered — renumber() assigns N). */
export function createRefMarker(doc) {
  const sup = doc.createElement('sup');
  sup.className = 'oe-footnote-ref';
  sup.setAttribute('contenteditable', 'false');
  sup.setAttribute('data-oe-footnote-ref', '0'); // placeholder; renumber sets it
  sup.textContent = '0';
  return sup;
}

/** All reference markers in document order. */
export function refMarkers(root) {
  return Array.from(root.querySelectorAll(REF_SELECTOR));
}

/** The notes-section <ol>, or null. */
export function notesSection(root) {
  return root.querySelector(SECTION_SELECTOR);
}

/** Ensure the notes section exists at the END of root; return it. */
function ensureSection(root, doc) {
  let ol = notesSection(root);
  if (!ol) {
    ol = doc.createElement('ol');
    ol.className = 'oe-footnotes';
    ol.setAttribute('data-oe-footnotes', '');
    root.appendChild(ol);
  } else if (ol !== root.lastElementChild) {
    // Keep it pinned to the document end even after edits above it.
    root.appendChild(ol);
  }
  return ol;
}

/**
 * Renumber every marker 1..N in document order and rebuild the notes section
 * to match, preserving each note's existing text (keyed by the marker's
 * PREVIOUS number so text follows its footnote through renumbering).
 *
 * If there are no markers left, the notes section is removed entirely.
 * @returns {number} the number of footnotes after the pass.
 */
export function renumber(root, doc) {
  const markers = refMarkers(root);

  // Snapshot existing note bodies BEFORE we mutate anything. Old numbers are
  // NOT guaranteed unique (a pasted/duplicated marker carries the same
  // data-oe-footnote-ref, and fresh markers all share the "0" placeholder), so
  // we key by old number to a QUEUE of <li>s and consume each note body at most
  // once, in document order. This prevents one note's text from being
  // duplicated onto a sibling while another note's text is lost (data-loss fix).
  const prevQueues = new Map();
  const existing = notesSection(root);
  if (existing) {
    for (const li of existing.querySelectorAll('li[data-oe-footnote]')) {
      const key = li.getAttribute('data-oe-footnote');
      if (!prevQueues.has(key)) prevQueues.set(key, []);
      prevQueues.get(key).push(li);
    }
  }

  if (markers.length === 0) {
    if (existing) existing.remove();
    return 0;
  }

  const ol = ensureSection(root, doc);
  // Build the new <li> list in marker order, carrying text across.
  const newItems = [];
  markers.forEach((sup, i) => {
    const n = i + 1;
    const oldNum = sup.getAttribute('data-oe-footnote-ref');
    // Renumber the marker.
    sup.setAttribute('data-oe-footnote-ref', String(n));
    sup.setAttribute('id', `fnref-${n}`);
    sup.textContent = String(n);

    const li = doc.createElement('li');
    li.setAttribute('id', `fn-${n}`);
    li.setAttribute('data-oe-footnote', String(n));
    // Preserve the note body: take (and consume) the NEXT unused <li> that had
    // this marker's old number, so duplicates each map to a distinct note.
    const queue = prevQueues.get(oldNum);
    const carried = queue && queue.length ? queue.shift() : null;
    li.innerHTML = carried ? carried.innerHTML : '';
    newItems.push(li);
  });

  // Replace the section's children in one go.
  ol.textContent = '';
  for (const li of newItems) ol.appendChild(li);
  return markers.length;
}

/**
 * Insert a NEW marker node at a caret position is the plugin's job (it needs
 * the editor selection); this helper just does the post-insert renumber so the
 * new marker and its note slot get their number + the section stays in sync.
 * The caller inserts `marker` into the DOM first, then calls renumber(root).
 */
