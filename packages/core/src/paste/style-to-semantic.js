/**
 * style-to-semantic.js — Phase 12.13: promote style-driven formatting to
 * semantic tags. THIS EXCEEDS JODIT, which keeps the style↔tag mapping in its
 * toolbar-button configs only and never applies it on paste — so a Google Docs
 * or Word paste that expresses bold/italic/underline as inline styles stays a
 * pile of styled <span>s in Jodit but becomes clean <strong>/<em>/<u>/<s> here.
 *
 * For each element carrying a recognized formatting style, we wrap its contents
 * in the matching semantic tag and remove that style property (so 12.3 can then
 * drop the now-empty style attribute without losing the formatting). Multiple
 * formats on one element nest (bold+italic → <strong><em>…</em></strong>).
 *
 * Runs BEFORE 12.3 (strip styles) — the whole point is to capture formatting
 * before the raw style attribute is discarded.
 *
 * Pure `(html, ctx?) → html`.
 */

// property → { test(value) → bool, tag }. Order controls nesting (outer first).
const PROMOTIONS = [
  { prop: 'font-weight',     tag: 'strong', test: (v) => /^(bold|bolder|[6-9]00)$/i.test(v.trim()) },
  { prop: 'font-style',      tag: 'em',     test: (v) => /^italic$/i.test(v.trim()) },
  { prop: 'text-decoration', tag: 's',      test: (v) => /line-through/i.test(v) },
  { prop: 'text-decoration-line', tag: 's', test: (v) => /line-through/i.test(v) },
  { prop: 'text-decoration', tag: 'u',      test: (v) => /underline/i.test(v) },
  { prop: 'text-decoration-line', tag: 'u', test: (v) => /underline/i.test(v) },
  { prop: 'vertical-align',  tag: 'sup',    test: (v) => /^super$/i.test(v.trim()) },
  { prop: 'vertical-align',  tag: 'sub',    test: (v) => /^sub$/i.test(v.trim()) },
];

function getDoc(ctx) {
  if (ctx && ctx.editor && ctx.editor._iframeDoc) return ctx.editor._iframeDoc;
  return typeof document !== 'undefined' ? document : null;
}

/** Parse a style attribute into an ordered [prop, value] list. */
function parseStyle(style) {
  const out = [];
  for (const decl of String(style).split(';')) {
    const i = decl.indexOf(':');
    if (i === -1) continue;
    const prop = decl.slice(0, i).trim().toLowerCase();
    const val = decl.slice(i + 1).trim();
    if (prop && val) out.push([prop, val]);
  }
  return out;
}

/** Serialize [prop,value] pairs back to a style string. */
function serializeStyle(pairs) {
  return pairs.map(([p, v]) => `${p}:${v}`).join(';');
}

/** Wrap all children of `el` in a new `tag` element (in place). */
function wrapChildren(el, tag, doc) {
  const wrap = doc.createElement(tag);
  while (el.firstChild) wrap.appendChild(el.firstChild);
  el.appendChild(wrap);
}

export function styleToSemantic(html, ctx) {
  if (typeof html !== 'string' || html === '') return html;
  const doc = getDoc(ctx);
  if (!doc) return html;

  const root = doc.createElement('div');
  root.innerHTML = html;

  root.querySelectorAll('[style]').forEach((el) => {
    const pairs = parseStyle(el.getAttribute('style'));
    if (!pairs.length) return;

    // Which promotions fire for this element's styles, and which style
    // declarations they consume (removed after wrapping).
    const consumed = new Set();
    const applied = [];
    for (const promo of PROMOTIONS) {
      const hit = pairs.find(([p, v]) => p === promo.prop && promo.test(v));
      if (hit && !applied.includes(promo.tag)) {
        applied.push(promo.tag);
        consumed.add(hit);
      }
    }
    if (!applied.length) return;

    // Wrap innermost-last so the FIRST applied tag ends up outermost
    // (bold+italic → <strong><em>…). We add from the inside out.
    for (let i = applied.length - 1; i >= 0; i--) {
      wrapChildren(el, applied[i], doc);
    }

    // Drop the consumed declarations; keep the rest for 12.3 to decide on.
    const remaining = pairs.filter((pair) => !consumed.has(pair));
    if (remaining.length) el.setAttribute('style', serializeStyle(remaining));
    else el.removeAttribute('style');
  });

  return root.innerHTML;
}
