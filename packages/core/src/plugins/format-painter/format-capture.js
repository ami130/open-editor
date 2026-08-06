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
import { featureForCommand } from '../../entitlements/feature-catalog.js';

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

// Inline CSS properties Format Painter copies (color/size/font/highlight/…) via
// a <span style>. Read from the COMPUTED style at the caret so a value inherited
// from an ancestor <span style> is captured even without a tag. Deliberately
// EXCLUDES font-weight / font-style / text-decoration — those are the bold /
// italic / underline / strike the TAG path (PAINTABLE) already copies; capturing
// them as styles too would double-wrap (<strong><span style=font-weight>). Kept
// to text presentation only — no layout/box props — so paint can't distort layout.
const PAINTABLE_STYLES = [
  'color', 'background-color', 'font-family', 'font-size',
  'letter-spacing', 'text-transform',
];

/** Read the paintable inline styles active at the caret, as a {prop:value} map. */
function captureStyles(editor) {
  const info = selInfo(editor);
  const startEl = info && info.startNode
    ? (info.startNode.nodeType === 1 ? info.startNode : info.startNode.parentElement) : null;
  const root = editor.getEditorElement && editor.getEditorElement();
  if (!startEl || !root || !root.contains(startEl)) return {};
  const win = (startEl.ownerDocument && startEl.ownerDocument.defaultView) || (typeof window !== 'undefined' ? window : null);
  // The editable's OWN computed style is the "unformatted" baseline — only copy a
  // property when the caret's value differs from it (else we'd bake the default
  // color/font onto every paint).
  let base;
  try { base = win && win.getComputedStyle(root); } catch { base = null; }
  let cs;
  try { cs = win && win.getComputedStyle(startEl); } catch { cs = null; }
  if (!cs) return {};
  const out = {};
  for (const prop of PAINTABLE_STYLES) {
    const v = cs.getPropertyValue(prop);
    if (!v) continue;
    if (base && base.getPropertyValue(prop) === v) continue; // same as default → skip
    out[prop] = v;
  }
  return out;
}

/**
 * Capture the inline formats active at the current caret.
 * @returns {{ tags: string[], styles: object }} active paintable tags + styles.
 */
export function captureFormat(editor) {
  const tags = [];
  for (const { tag } of PAINTABLE) {
    if (activeTag(editor, tag)) tags.push(tag);
  }
  return { tags, styles: captureStyles(editor) };
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
  for (const { tag, command } of PAINTABLE) {
    if (!captured.tags.includes(tag)) continue; // source didn't have it
    // Feature gating (Phase 2 leak-fix): format-painter wraps tags via direct
    // DOM (not commands.execute), so it must gate per-tag itself. Skip painting
    // a format whose command's feature isn't granted (e.g. paint bold when
    // text.bold is withheld even though the painter plugin is licensed).
    const featureId = featureForCommand(command);
    if (featureId && editor.isFeatureGranted && !editor.isFeatureGranted(featureId)) continue;
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

  // FP1: paint captured inline STYLES (color/font/size/highlight/…) by wrapping
  // each selected text node in a <span style>. Gated on the color/font features
  // so an unlicensed color can't be painted. Existing spans get the props merged.
  const styles = captured.styles && typeof captured.styles === 'object' ? captured.styles : {};
  const styleProps = Object.keys(styles);
  if (styleProps.length && styleAllowed(editor)) {
    for (const textNode of targets) {
      let host = textNode.parentNode;
      // Reuse a wrapping <span> if the text node is its only child; else make one.
      if (!(host && host.tagName && host.tagName.toLowerCase() === 'span'
            && host.childNodes.length === 1)) {
        const span = doc.createElement('span');
        textNode.parentNode.insertBefore(span, textNode);
        span.appendChild(textNode);
        host = span;
      }
      for (const p of styleProps) host.style.setProperty(p, styles[p]);
    }
    applied++;
  }
  return applied;
}

// FP1 gating: painting color/background needs text.color; font props need
// text.font. Allow when either is granted (or gating unavailable). Conservative:
// if neither is granted, skip all style painting.
function styleAllowed(editor) {
  if (!editor.isFeatureGranted) return true;
  const color = featureForCommand('foreColor') || 'text.color';
  const font = featureForCommand('fontName') || 'text.font';
  return editor.isFeatureGranted(color) || editor.isFeatureGranted(font);
}

/** True when a captured format carries at least one paintable tag OR style. */
export function hasFormat(captured) {
  if (!captured) return false;
  const hasTags = Array.isArray(captured.tags) && captured.tags.length > 0;
  const hasStyles = captured.styles && Object.keys(captured.styles).length > 0;
  return !!(hasTags || hasStyles);
}
