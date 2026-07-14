/**
 * link-dom.js — DOM primitives for the Link plugin (Phase 10).
 *
 * Pure, UI-free operations so they can be unit-tested in isolation:
 *   findLinkAt(node, root)          → nearest ancestor <a> or null
 *   createAnchor(doc, attrs, text)  → a fresh <a> element
 *   applyLinkAttrs(a, attrs)        → set href/title/target/rel/class/aria-label
 *   wrapSelectionInLink(editor, …)  → wrap current selection (or insert new)
 *   updateLink(a, attrs, newText)   → edit an existing <a>
 *   unwrapLink(editor, a)           → remove <a>, keep its text
 *
 * href safety is enforced with isAllowedLinkHref (Phase 10.9 whitelist).
 * rel="noopener noreferrer" for target="_blank" is added by the sanitizer on
 * serialization, so applyLinkAttrs only manages the nofollow bit of rel.
 */
import { isAllowedLinkHref } from '../../sanitizer/sanitizer-utils.js';
import { getClosestTag } from '../../selection/range-utils.js';

/** Return the nearest ancestor <a> of node within root, or null. */
export function findLinkAt(node, root) {
  if (!node) return null;
  return getClosestTag(node, 'a', root);
}

/**
 * Merge the nofollow flag into an existing rel string.
 * Adds/removes 'nofollow' while preserving any other tokens (e.g. noopener).
 * Returns the new rel string, or '' when empty.
 */
/**
 * Recompute the rel token list from the desired state.
 *   nofollow → adds/removes 'nofollow'
 *   newTab   → adds 'noopener noreferrer' when opening in a new tab, and STRIPS
 *              them when new-tab is turned off (they are meaningless without
 *              target="_blank", so leaving them behind is stale output).
 * Any other author-supplied rel tokens are preserved. Returns '' when empty.
 */
function computeRel(existingRel, nofollow, newTab) {
  const tokens = (existingRel || '').split(/\s+/).filter(Boolean);
  const set = (tok, on) => {
    const has = tokens.includes(tok);
    if (on && !has) tokens.push(tok);
    if (!on && has) {
      for (let i = tokens.length - 1; i >= 0; i--) if (tokens[i] === tok) tokens.splice(i, 1);
    }
  };
  set('nofollow', !!nofollow);
  // noopener/noreferrer only make sense with target="_blank".
  set('noopener', !!newTab);
  set('noreferrer', !!newTab);
  return tokens.join(' ');
}

// M2 fix: validate the color value against a strict allowlist before it ever
// reaches the style attribute, so applyLinkAttrs is safe as a reusable
// primitive (not reliant on the sanitizer's isUnsafeStyle as the only guard).
// Accepts: #hex (3/4/6/8), rgb()/rgba(), hsl()/hsla(), and CSS named colors.
const _HEX_COLOR   = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const _FUNC_COLOR  = /^(?:rgb|rgba|hsl|hsla)\(\s*[0-9.,%\s/]+\)$/i;
const _NAMED_COLOR = /^[a-z]+$/i;

function isValidColor(c) {
  if (typeof c !== 'string') return false;
  const v = c.trim();
  if (!v) return false;
  return _HEX_COLOR.test(v) || _FUNC_COLOR.test(v) || _NAMED_COLOR.test(v);
}

/** Build a style string carrying only a validated color declaration (or ''). */
function colorStyle(color) {
  const c = (color || '').trim();
  if (!c || !isValidColor(c)) return '';
  return `color: ${c};`;
}

/**
 * Apply link attributes to an <a>. attrs:
 *   { href, title?, target?(bool _blank), nofollow?(bool), className?,
 *     ariaLabel?, color? }
 * href is validated; an invalid href is skipped (leaves any prior href intact).
 * color is applied as an inline `style="color: …"` (the sanitizer's isUnsafeStyle
 * still guards the value); clearing color removes the style attribute.
 */
export function applyLinkAttrs(a, attrs = {}) {
  if (!a) return;
  const { href, title, target, nofollow, className, ariaLabel, color } = attrs;

  if (href != null && isAllowedLinkHref(href)) a.setAttribute('href', href.trim());

  if (title != null && title !== '') a.setAttribute('title', title);
  else a.removeAttribute('title');

  if (target) a.setAttribute('target', '_blank');
  else a.removeAttribute('target');

  // rel: manage nofollow + the noopener/noreferrer pair together so unchecking
  // "new tab" removes the now-pointless noopener/noreferrer (stale-rel fix).
  const rel = computeRel(a.getAttribute('rel') || '', nofollow, target);
  if (rel) a.setAttribute('rel', rel);
  else a.removeAttribute('rel');

  if (className != null && className.trim() !== '') a.setAttribute('class', className.trim());
  else a.removeAttribute('class');

  if (ariaLabel != null && ariaLabel.trim() !== '') a.setAttribute('aria-label', ariaLabel.trim());
  else a.removeAttribute('aria-label');

  if (color != null) {
    const style = colorStyle(color);
    if (style) a.setAttribute('style', style);
    else a.removeAttribute('style');
  }
}

/** Create a fresh <a> with the given attrs and (optional) text content. */
export function createAnchor(doc, attrs = {}, text) {
  const a = doc.createElement('a');
  applyLinkAttrs(a, attrs);
  if (text != null) a.textContent = text;
  return a;
}

/**
 * Wrap the current selection in a link, or insert a new link when the selection
 * is collapsed. attrs is the same shape as applyLinkAttrs; `text` is the display
 * text used when the selection is collapsed (falls back to the href).
 * Returns the created <a>, or null if the href is not allowed.
 */
export function wrapSelectionInLink(editor, attrs = {}, text) {
  if (!attrs.href || !isAllowedLinkHref(attrs.href)) return null;
  const sel = editor.selection;
  if (!sel) return null;
  const doc = editor._iframeDoc || (typeof document !== 'undefined' ? document : null);
  if (!doc) return null;

  const info = sel.get();
  const collapsed = !info || info.collapsed;

  if (collapsed) {
    const label = (text != null && text !== '') ? text : attrs.href.trim();
    const a = createAnchor(doc, attrs, label);
    sel.insertAtCursor(a);
    return a;
  }

  // Non-collapsed: move the selected content into a new <a> (insertAtCursor's
  // element path does exactly this — extractContents → append → insert → reselect).
  const a = createAnchor(doc, attrs);
  sel.insertAtCursor(a);

  // A range that spans whole block(s) (e.g. select-all) makes insertAtCursor
  // wrap block elements: <a><p>…</p></a>. That is invalid — an inline <a> may
  // not contain a block — and the sanitizer's normalizeStructure would unwrap
  // it, silently discarding the link. Rewrite so the <a> lives *inside* the
  // block(s), wrapping only inline content: <p><a>…</a></p>. Returns the
  // effective anchor (the original when untouched, or the first inner one).
  const eff = _fixBlockWrapping(a, doc) || a;

  // If a display text was explicitly provided and differs, override the content.
  // Only meaningful for the single-anchor case; skip when the block-wrap fix
  // produced multiple anchors (each keeps its own block's text).
  if (text != null && text !== '' && eff === a && eff.textContent !== text) {
    eff.textContent = text;
  }
  return eff;
}

const _BLOCK = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'pre', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr',
  'th', 'td', 'figure', 'figcaption', 'dl', 'dt', 'dd']);

function _isBlock(node) {
  return node && node.nodeType === 1 && _BLOCK.has(node.tagName.toLowerCase());
}

/**
 * If `a` directly contains block elements (from wrapping a block-spanning
 * selection), move the <a> inside each block so it wraps only inline content.
 * Single block  → <p><a>…</a></p>.
 * Multiple blocks → one <a> inside each block (mirrors Jodit's per-block wrap).
 * The now-empty original <a> is removed.
 */
function _fixBlockWrapping(a, doc) {
  const blockChildren = Array.from(a.childNodes).filter(_isBlock);
  if (blockChildren.length === 0) return null; // pure inline content — nothing to fix
  const parent = a.parentNode;
  if (!parent) return null;

  let firstInner = null;
  for (const block of blockChildren) {
    // Wrap the block's inline content in a fresh clone of the anchor.
    const inner = doc.createElement('a');
    for (const attr of Array.from(a.attributes)) inner.setAttribute(attr.name, attr.value);
    while (block.firstChild) inner.appendChild(block.firstChild);
    block.appendChild(inner);
    parent.insertBefore(block, a);
    if (!firstInner) firstInner = inner;
  }
  // Move any stray non-block nodes (rare) out before removing the shell anchor.
  while (a.firstChild) parent.insertBefore(a.firstChild, a);
  parent.removeChild(a);
  return firstInner;
}

/**
 * Edit an existing <a>. Updates attributes, and replaces the text content only
 * when newText is provided and differs from the current text.
 */
export function updateLink(a, attrs = {}, newText) {
  if (!a) return;
  applyLinkAttrs(a, attrs);
  if (newText != null && newText !== '' && a.textContent !== newText) {
    a.textContent = newText;
  }
}

/**
 * Remove an <a>, keeping its children (text) in place. Places the cursor at the
 * end of the unwrapped content when a selection manager is available.
 */
export function unwrapLink(editor, a) {
  if (!a || !a.parentNode) return;
  const parent = a.parentNode;
  const doc = editor._iframeDoc || (typeof document !== 'undefined' ? document : null);
  let lastNode = null;
  while (a.firstChild) {
    lastNode = a.firstChild;
    parent.insertBefore(a.firstChild, a);
  }
  parent.removeChild(a);
  parent.normalize && parent.normalize();

  if (editor.selection && doc && lastNode) {
    try {
      const win = editor.selection.getWindow();
      const range = doc.createRange();
      if (lastNode.nodeType === 3) range.setStart(lastNode, lastNode.nodeValue.length);
      else range.setStartAfter(lastNode);
      range.collapse(true);
      const domSel = win && win.getSelection();
      if (domSel) { domSel.removeAllRanges(); domSel.addRange(range); }
    } catch { /* selection placement is non-fatal */ }
  }
}
