/**
 * format-capture.js — Phase 13.9: capture/apply inline formatting for the
 * Format Painter. Built ON TOP of the existing inline-format commands so it
 * reuses their proven DOM wrapping rather than reimplementing it.
 *
 * The set of "paintable" inline formats maps a semantic tag to the command that
 * toggles it. captureFormat() reads which of these are active at the caret;
 * applyFormat() adds the missing ones to the current (target) selection.
 *
 * CORRECTNESS: the built-in bold/italic/… commands TOGGLE based on the
 * selection START, so on a selection that CROSSES a formatting boundary they
 * either nest (start plain → wraps the whole range, doubling the already-bold
 * part) or no-op (start formatted → unwraps). Format Painter therefore does NOT
 * use those commands to apply. Instead applyFormat wraps each selected TEXT
 * NODE that is not already inside `tag` in its own fresh `tag` — this can never
 * nest (already-wrapped nodes are skipped) and never misses (every unformatted
 * node is wrapped). Adjacent identical wrappers are cosmetically redundant but
 * valid; getHTML's normalizer/merge coalesces them.
 *
 * It intentionally does NOT remove formats the target has but the source
 * lacked — Format Painter adds the source's formatting (Word/Jodit behavior).
 *
 * Pure functions of (editor); no plugin state, no UI.
 */
import { walkUp } from '../../selection/range-utils.js';

// tag → command name. Order is the apply order (outer-ish first is irrelevant
// since each is an independent wrap, but kept stable for deterministic output).
export const PAINTABLE = [
  { tag: 'strong', command: 'bold' },
  { tag: 'em', command: 'italic' },
  { tag: 'u', command: 'underline' },
  { tag: 's', command: 'strikethrough' },
  { tag: 'sup', command: 'superscript' },
  { tag: 'sub', command: 'subscript' },
  { tag: 'code', command: 'inlineCode' },
];

function selInfo(editor) {
  return editor && editor.selection && editor.selection.get ? editor.selection.get() : null;
}

/** Is the caret/selection start inside an element with `tag`? */
function activeTag(editor, tag) {
  const info = selInfo(editor);
  if (!info || !info.startNode) return false;
  const root = editor.getEditorElement();
  return !!walkUp(info.startNode, root, (n) =>
    n.nodeType === 1 && n.tagName.toLowerCase() === tag);
}

/**
 * Capture the inline formats active at the current caret.
 * @returns {{ tags: string[] }} the set of paintable tags that are active.
 */
export function captureFormat(editor) {
  const tags = [];
  for (const { tag } of PAINTABLE) {
    if (activeTag(editor, tag)) tags.push(tag);
  }
  return { tags };
}

/**
 * Split the range's boundary text nodes at the selection offsets so a partial
 * selection wraps ONLY the selected characters (audit#4: previously the whole
 * text node was wrapped, so selecting "llo w" in "hello world" bolded it all).
 * Mutates the DOM (splitText) and returns a NEW range spanning the split nodes.
 */
function splitBoundaries(range) {
  const r = range.cloneRange();
  // Split the END first — splitting START would shift the end offset otherwise.
  if (r.endContainer.nodeType === 3 && r.endOffset > 0 && r.endOffset < r.endContainer.nodeValue.length) {
    r.endContainer.splitText(r.endOffset); // r still ends at the same boundary
  }
  if (r.startContainer.nodeType === 3 && r.startOffset > 0 && r.startOffset < r.startContainer.nodeValue.length) {
    const after = r.startContainer.splitText(r.startOffset);
    r.setStart(after, 0);
  }
  return r;
}

/** The text nodes fully within a range (non-empty; whitespace-only skipped). */
function selectedTextNodes(range, doc) {
  const nodes = [];
  const scope = range.commonAncestorContainer.nodeType === 1
    ? range.commonAncestorContainer : range.commonAncestorContainer.parentNode;
  if (!scope) return nodes;
  const walker = doc.createTreeWalker(scope, 4 /* SHOW_TEXT */);
  let n;
  while ((n = walker.nextNode())) {
    if (!n.nodeValue || !n.nodeValue.trim()) continue;
    // isPointInRange on the node's midpoint → true only when the node is inside
    // the (post-split) range, so boundary halves outside the selection are excluded.
    if (rangeContainsNode(range, n)) nodes.push(n);
  }
  return nodes;
}

/** True when `node` lies within `range` (both endpoints covered). */
function rangeContainsNode(range, node) {
  try {
    // node fully inside: range.start <= node.start AND node.end <= range.end
    const startsAfter = range.comparePoint ? range.comparePoint(node, 0) >= 0 : true;
    const endsBefore = range.comparePoint ? range.comparePoint(node, node.nodeValue.length) <= 0 : true;
    return startsAfter && endsBefore;
  } catch {
    return range.intersectsNode ? range.intersectsNode(node) : true;
  }
}

/** Is `node` already inside an element named `tag` (within the editor)? */
function insideTagNode(node, tag, root) {
  return !!walkUp(node, root, (n) => n.nodeType === 1 && n.tagName.toLowerCase() === tag);
}

/**
 * Apply a captured format to the CURRENT selection by wrapping each selected
 * text node that is NOT already inside the tag. Never nests, never misses on a
 * boundary-crossing selection (the toggle-command hazard). Returns the number
 * of (tag) wraps performed. Add-only: never removes a format the source lacked.
 */
export function applyFormat(editor, captured) {
  if (!captured || !Array.isArray(captured.tags) || !editor) return 0;
  const info = editor.selection && editor.selection.get();
  if (!info || info.collapsed || !info.range) return 0; // nothing to paint onto
  const doc = editor._iframeDoc || (typeof document !== 'undefined' ? document : null);
  if (!doc) return 0;
  const root = editor.getEditorElement();

  // Split boundary text nodes at the selection offsets so only the SELECTED
  // characters are wrapped (partial-selection fix), then snapshot the fully-
  // selected text nodes ONCE. Each stays a live reference even after being moved
  // into a wrapper, so every captured tag wraps the same set (wrapping for
  // `strong` can't hide nodes from `em`).
  const splitRange = splitBoundaries(info.range);
  const targets = selectedTextNodes(splitRange, doc);
  if (!targets.length) return 0;

  let applied = 0;
  for (const { tag } of PAINTABLE) {
    if (!captured.tags.includes(tag)) continue; // source didn't have it
    let wrappedAny = false;
    for (const textNode of targets) {
      if (insideTagNode(textNode, tag, root)) continue; // already formatted → skip (no nesting)
      const wrap = doc.createElement(tag);
      textNode.parentNode.insertBefore(wrap, textNode);
      wrap.appendChild(textNode);
      wrappedAny = true;
    }
    if (wrappedAny) applied++;
  }
  return applied;
}

/** True when a captured format carries at least one paintable tag. */
export function hasFormat(captured) {
  return !!captured && Array.isArray(captured.tags) && captured.tags.length > 0;
}
