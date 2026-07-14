/**
 * sanitizer-config.js — the static tag/attribute allow-list and the full-strip
 * deny-list for the sanitizer. Extracted from sanitizer.js (pure data, no
 * behaviour) to keep that file under the 300-line limit. Editing these lists is
 * how you widen/narrow what HTML survives sanitization.
 */

// Per-tag whitelist: tag → array of attributes allowed on it. Any tag not
// present is unwrapped (children kept); any attribute not listed is stripped.
export const DEFAULT_TAG_WHITELIST = new Map([
  ['p',          ['class', 'style', 'id', 'dir']],
  ['br',         []],
  ['strong',     ['class', 'style']],
  ['em',         ['class', 'style']],
  ['u',          ['class', 'style']],
  ['s',          ['class', 'style']],
  ['del',        ['class', 'style']],
  ['ins',        ['class', 'style']],
  ['sup',        ['class', 'style']],
  ['sub',        ['class', 'style']],
  ['a',          ['href', 'title', 'target', 'rel', 'class', 'aria-label', 'style']],
  ['img',        ['src', 'alt', 'width', 'height', 'class', 'style', 'id', 'srcset', 'sizes', 'loading', 'title', 'fetchpriority', 'decoding']],
  // 16.7.8 — responsive image output. <picture>/<source> carry no scriptable
  // surface of their own; their src-bearing attributes (srcset) are scheme-
  // checked exactly like <img srcset> already is (see srcset handling in
  // sanitizer.js), so widening the allowlist here doesn't add a new sink.
  ['picture',    ['class', 'style']],
  ['source',     ['srcset', 'sizes', 'media', 'type', 'width', 'height']],
  ['ul',         ['class', 'style', 'id', 'dir']],
  ['ol',         ['class', 'style', 'id', 'start', 'type', 'dir']],
  ['li',         ['class', 'style', 'id', 'dir']],
  ['dl',         ['class', 'style']],
  ['dt',         ['class', 'style']],
  ['dd',         ['class', 'style']],
  ['blockquote', ['class', 'style', 'cite', 'data-bq-style', 'dir']],
  ['pre',        ['class']],
  ['code',       ['class']],
  ['h1',         ['class', 'style', 'id', 'dir']],
  ['h2',         ['class', 'style', 'id', 'dir']],
  ['h3',         ['class', 'style', 'id', 'dir']],
  ['h4',         ['class', 'style', 'id', 'dir']],
  ['h5',         ['class', 'style', 'id', 'dir']],
  ['h6',         ['class', 'style', 'id', 'dir']],
  ['table',      ['class', 'style', 'border', 'cellpadding', 'cellspacing', 'width']],
  ['caption',    ['class', 'style']],
  ['colgroup',   ['class', 'style', 'span']],
  ['col',        ['class', 'style', 'span']],
  ['thead',      ['class', 'style']],
  ['tbody',      ['class', 'style']],
  ['tfoot',      ['class', 'style']],
  ['tr',         ['class', 'style']],
  ['th',         ['class', 'style', 'colspan', 'rowspan', 'scope', 'dir']],
  ['td',         ['class', 'style', 'colspan', 'rowspan', 'dir']],
  ['span',       ['class', 'style', 'dir']],
  ['div',        ['class', 'style', 'id', 'dir']],
  ['figure',     ['class', 'style', 'contenteditable', 'data-oe-island']],
  ['figcaption', ['class', 'style', 'contenteditable', 'data-oe-caption']],
  ['hr',         ['class', 'style']],
  ['mark',       ['class', 'style']],
  ['abbr',       ['class', 'style', 'title']],
  ['cite',       ['class', 'style']],
  ['q',          ['class', 'style', 'cite']],
  ['small',      ['class', 'style']],
  ['time',       ['class', 'style', 'datetime']],
  // 14.12 — bidi isolation elements for authored mixed LTR/RTL inline runs.
  ['bdi',        ['class', 'style', 'dir']],
  ['bdo',        ['class', 'style', 'dir']],
]);

// Tags that must be stripped entirely (children too). `iframe` STAYS here:
// the default posture is "strip every iframe". A single, tightly-scoped
// exception is made only for provider-embed iframes (see isSafeEmbedIframe),
// which the core loop checks before removing.
export const DENY_TAGS_FULL = new Set([
  'script', 'noscript', 'style', 'link', 'meta', 'base',
  'object', 'embed', 'applet', 'iframe', 'frame', 'frameset',
  'form', 'input', 'button', 'select', 'textarea', 'option',
  'svg', 'math', 'xml', 'xmp',
]);

// ── Media-embed iframe policy (Phase 13.5) ───────────────────────────────────
// An independent copy of the embed-host allowlist (the plugin has its own; the
// two are intentionally separate so neither layer can be bypassed by editing
// only the other — defense in depth).
const EMBED_HOSTS = new Set([
  'www.youtube.com', 'youtube.com',
  'www.youtube-nocookie.com', 'youtube-nocookie.com',
  'player.vimeo.com',
]);
// The maximal sandbox tokens we permit on an embed iframe. Anything beyond this
// (allow-top-navigation, allow-popups, allow-modals, allow-downloads…) is
// rejected — an embed must not be able to navigate the top window or escape.
const SANDBOX_ALLOWED = new Set(['allow-scripts', 'allow-same-origin', 'allow-presentation']);
// Attributes an embed iframe may keep (everything else is stripped).
export const EMBED_IFRAME_ATTRS = new Set([
  'src', 'sandbox', 'width', 'height', 'allowfullscreen', 'frameborder',
  'title', 'loading', 'referrerpolicy', 'class', 'style',
]);

/**
 * Decide whether an <iframe> element is a SAFE provider embed. Requires:
 *   • an https src on the embed-host allowlist,
 *   • a `sandbox` attribute present whose tokens are all within SANDBOX_ALLOWED
 *     (a missing sandbox → rejected; an over-permissive token → rejected).
 * Returns true only when both hold. The caller removes the iframe otherwise.
 */
export function isSafeEmbedIframe(el) {
  if (!el || el.tagName.toLowerCase() !== 'iframe') return false;
  const src = el.getAttribute('src') || '';
  let u;
  try { u = new URL(src); } catch { return false; }
  if (u.protocol !== 'https:' || !EMBED_HOSTS.has(u.hostname)) return false;

  if (!el.hasAttribute('sandbox')) return false; // sandbox is mandatory
  const tokens = (el.getAttribute('sandbox') || '').split(/\s+/).filter(Boolean);
  // An empty sandbox="" is the MOST restrictive (fine). Any listed token must
  // be within the allowed set — no top-navigation/popups/etc.
  for (const t of tokens) { if (!SANDBOX_ALLOWED.has(t.toLowerCase())) return false; }
  return true;
}
