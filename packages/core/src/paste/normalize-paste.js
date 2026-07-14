/**
 * normalize-paste.js — Phase 12.F structural + encoding normalization.
 * Bundles four milestones that all operate on the post-cleanup DOM:
 *
 *   12.7  mergeAdjacentInline — coalesce neighbouring identical inline wrappers
 *         (<strong>a</strong><strong>b</strong> -> <strong>ab</strong>), which
 *         style->semantic (12.13) and Word/GDocs cleanup tend to produce. Jodit
 *         does NOT do this on paste — a cleanliness win.
 *   12.8  removeEmptyInline — drop inline elements with no text/media content
 *         (empty <span>/<strong>/... left behind by cleanup); blocks are kept.
 *   12.3  stripInlineStyles — remove leftover style attributes when configured
 *         (pasteStripStyles, default true). Runs AFTER 12.13 so formatting was
 *         already captured as semantic tags.
 *   12.11 normalizeEncoding — smart quotes/dashes -> ASCII (EXCEEDS Jodit),
 *         strip BOM/zero-width chars (matches Jodit), nbsp -> space. Per text
 *         node, skipping <pre>/<code> so pasted code is left byte-exact (#7).
 *
 * Each is a pure `(html, ctx?) -> html`; `normalizePaste` runs them in order.
 */

function getDoc(ctx) {
  if (ctx && ctx.editor && ctx.editor._iframeDoc) return ctx.editor._iframeDoc;
  return typeof document !== 'undefined' ? document : null;
}

const INLINE = new Set(['span', 'strong', 'em', 'u', 's', 'b', 'i', 'sub', 'sup', 'a', 'font', 'mark', 'small']);
const isInline = (el) => el && el.nodeType === 1 && INLINE.has(el.tagName.toLowerCase());
// Shared "this element carries real content" media set — used by both empty-
// element removal and the block-split empty-half check (#8: keep them aligned).
export const HAS_MEDIA_SELECTOR = 'img,video,iframe,audio,canvas,object,svg,br,hr,table';

// ── 12.11 — encoding cleanup ─────────────────────────────────────────────────
// Character classes are built from code points via String.fromCharCode so the
// SOURCE contains no literal invisible/typographic glyphs — an editor or file
// round-trip cannot silently mangle e.g. a non-breaking space into a plain one
// and turn a replacement into a no-op (that exact bug bit an earlier version).
const CP = String.fromCharCode;
const ZERO_WIDTH = new RegExp('[' + CP(0xFEFF) + CP(0x200B) + CP(0x200C) + CP(0x200D) + ']', 'g');
const SINGLE_Q   = new RegExp('[' + CP(0x2018) + CP(0x2019) + CP(0x201A) + CP(0x201B) + ']', 'g');
const DOUBLE_Q   = new RegExp('[' + CP(0x201C) + CP(0x201D) + CP(0x201E) + CP(0x201F) + ']', 'g');
const EN_DASH    = new RegExp(CP(0x2013), 'g'); // en dash (em dash 0x2014 intentionally kept)
const ELLIPSIS   = new RegExp(CP(0x2026), 'g');
const NBSP       = new RegExp(CP(0x00A0), 'g');

function normalizeTextValue(s) {
  return s
    .replace(ZERO_WIDTH, '')
    .replace(SINGLE_Q, "'")
    .replace(DOUBLE_Q, '"')
    .replace(EN_DASH, '-')
    .replace(ELLIPSIS, '...')
    .replace(NBSP, ' ');
}

// True when a text node has a <pre>/<code> ancestor — its content is code the
// user pasted and must be left byte-exact (#7).
function inCodeContext(node) {
  let n = node.parentNode;
  while (n && n.nodeType === 1) {
    const tag = n.tagName.toLowerCase();
    if (tag === 'pre' || tag === 'code') return true;
    n = n.parentNode;
  }
  return false;
}

export function normalizeEncoding(html, ctx) {
  if (typeof html !== 'string' || html === '') return html;
  const doc = getDoc(ctx);
  if (!doc) return normalizeTextValue(html); // no DOM -> best-effort whole-string
  const root = doc.createElement('div');
  root.innerHTML = html;
  const walker = doc.createTreeWalker(root, 4 /* SHOW_TEXT */);
  let n;
  while ((n = walker.nextNode())) {
    if (inCodeContext(n)) continue;          // never touch code/pre
    const next = normalizeTextValue(n.nodeValue);
    if (next !== n.nodeValue) n.nodeValue = next;
  }
  return root.innerHTML;
}

// ── 12.8 — remove empty inline elements ──────────────────────────────────────
export function removeEmptyInline(html, ctx) {
  if (typeof html !== 'string' || html === '') return html;
  const doc = getDoc(ctx);
  if (!doc) return html;
  const root = doc.createElement('div');
  root.innerHTML = html;
  let changed = true;
  // Loop until stable — removing an empty wrapper can empty its parent.
  while (changed) {
    changed = false;
    root.querySelectorAll('*').forEach((el) => {
      if (!isInline(el)) return;
      const hasText = el.textContent.replace(new RegExp('[\\s' + CP(0x00A0) + ']', 'g'), '') !== '';
      const hasMedia = el.querySelector(HAS_MEDIA_SELECTOR);
      if (!hasText && !hasMedia) { el.remove(); changed = true; }
    });
  }
  return root.innerHTML;
}

// ── 12.7 — merge adjacent identical inline wrappers ──────────────────────────
function sameWrapper(a, b) {
  if (!isInline(a) || !isInline(b)) return false;
  if (a.tagName !== b.tagName) return false;
  // Same tag AND same attributes (so <a> only merges with an identical href).
  const aa = a.attributes, ba = b.attributes;
  if (aa.length !== ba.length) return false;
  for (const attr of aa) {
    if (b.getAttribute(attr.name) !== attr.value) return false;
  }
  return true;
}

export function mergeAdjacentInline(html, ctx) {
  if (typeof html !== 'string' || html === '') return html;
  const doc = getDoc(ctx);
  if (!doc) return html;
  const root = doc.createElement('div');
  root.innerHTML = html;

  const walk = (parent) => {
    let node = parent.firstChild;
    while (node) {
      const next = node.nextSibling;
      if (next && sameWrapper(node, next)) {
        while (next.firstChild) node.appendChild(next.firstChild);
        next.remove();
        continue; // re-check node against its new sibling
      }
      if (node.nodeType === 1) walk(node);
      node = node.nextSibling;
    }
  };
  walk(root);
  return root.innerHTML;
}

// ── 12.7b — unwrap attribute-less <span>/<font> (pure noise wrappers) ────────
// After styles are stripped a bare <span>x</span> carries no meaning; unwrap it
// so the semantic tags inside stand on their own. Only <span>/<font> with zero
// attributes are unwrapped (a <span class=...> may be meaningful and is kept).
export function unwrapBareWrappers(html, ctx) {
  if (typeof html !== 'string' || html === '') return html;
  const doc = getDoc(ctx);
  if (!doc) return html;
  const root = doc.createElement('div');
  root.innerHTML = html;
  let changed = true;
  while (changed) {
    changed = false;
    root.querySelectorAll('span, font').forEach((el) => {
      if (el.attributes.length === 0) {
        while (el.firstChild) el.parentNode.insertBefore(el.firstChild, el);
        el.remove();
        changed = true;
      }
    });
  }
  return root.innerHTML;
}

// ── 12.3 — strip leftover inline styles (configurable) ───────────────────────
export function stripInlineStyles(html, ctx) {
  if (typeof html !== 'string' || html === '') return html;
  const editor = ctx && ctx.editor;
  const strip = !editor || editor._config == null || editor._config.pasteStripStyles !== false;
  if (!strip) return html;
  const doc = getDoc(ctx);
  if (!doc) return html;
  const root = doc.createElement('div');
  root.innerHTML = html;
  root.querySelectorAll('[style]').forEach((el) => el.removeAttribute('style'));
  return root.innerHTML;
}

/**
 * Run the normalization passes in order:
 *   encoding -> strip styles -> unwrap bare -> remove empties -> merge adjacents.
 * Strip-before-merge so merged wrappers compare cleanly (no lingering style
 * attribute differences would block a merge).
 */
export function normalizePaste(html, ctx) {
  let out = normalizeEncoding(html, ctx);
  out = stripInlineStyles(out, ctx);   // strip first so wrappers become bare
  out = unwrapBareWrappers(out, ctx);  // then unwrap now-meaningless spans/fonts
  out = removeEmptyInline(out, ctx);
  out = mergeAdjacentInline(out, ctx);
  return out;
}
