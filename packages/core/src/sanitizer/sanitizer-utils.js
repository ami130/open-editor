/**
 * HTML normalization + URL/CSS safety utilities used by the sanitizer.
 * Extracted to keep sanitizer.js under the 300-line limit.
 */

// ─── URL / CSS safety ─────────────────────────────────────────────────────────

// CSS property patterns that must be blocked in style attributes.
const DANGEROUS_CSS = [
  /url\s*\(/i,
  /expression\s*\(/i,
  /javascript\s*:/i,
  /behavior\s*:/i,
  /binding\s*:/i,
  /-moz-binding/i,
  /vbscript\s*:/i,
];

export function normalizeUrlValue(val) {
  // Strip ALL C0 control characters (U+0000–U+001F) and U+007F plus whitespace
  // that browsers ignore inside a scheme — e.g. "\x01javascript:" executes.
  // Stripping only a subset (tab/newline/CR) left a bypass for \x01-\x07/\x0E-\x1F.
  // eslint-disable-next-line no-control-regex
  return val.replace(/[\u0000-\u001F\u007F]/g, '').toLowerCase().trim();
}

export function isUnsafeUrl(val, opts = {}) {
  const n = normalizeUrlValue(val);
  if (n.startsWith('javascript:')) return true;
  if (n.startsWith('vbscript:'))   return true;
  if (n.startsWith('filesystem:')) return true;
  if (n.startsWith('data:')  && !opts.allowDataUris)  return true;
  if (n.startsWith('blob:')  && !opts.allowBlobUris)  return true;
  return false;
}

/**
 * Whitelist check for link hrefs (Phase 10.9). Unlike isUnsafeUrl (a blocklist
 * used across the sanitizer for src/cite/action), this is a strict allowlist for
 * user-created links: only http(s), mailto, tel, in-page anchors (#…), and
 * relative/root-relative paths (/…, ./…, ../…, or a bare path) are permitted.
 * Everything else — javascript:, data:, vbscript:, blob:, and any unknown
 * scheme — is rejected. Empty/whitespace hrefs are treated as not allowed.
 *
 * Returns true when the href is safe to use as an <a href>.
 */
export function isAllowedLinkHref(val) {
  if (typeof val !== 'string') return false;
  const n = normalizeUrlValue(val);
  if (n === '') return false;
  // In-page anchors and relative/root-relative/protocol-relative paths.
  if (n.startsWith('#')) return true;
  if (n.startsWith('/')) return true;      // /path and //host (protocol-relative)
  if (n.startsWith('./') || n.startsWith('../')) return true;
  // Explicit allowed schemes.
  if (/^(https?:|mailto:|tel:)/.test(n)) return true;
  // A value with no scheme separator is a relative path (e.g. "page.html").
  // ":" before any "/" means it declares a scheme we did not allow → reject.
  const colon = n.indexOf(':');
  const slash = n.indexOf('/');
  if (colon === -1) return true;
  if (slash !== -1 && colon > slash) return true; // colon is in a path segment
  return false;
}

export function isUnsafeStyle(val) {
  // C1 fix: DECODE CSS escapes to the characters the browser will reconstruct,
  // then match — the previous code DELETED escapes, so "\75rl(" (which a
  // browser decodes to "url(") became "rl(" and slipped past the keyword
  // regexes. A CSS hex escape "\XXXXXX" (1–6 hex digits, optional trailing
  // whitespace) decodes to that codepoint; "\c" for any other char decodes to
  // the literal char. Comments are removed first (they are stripped by the CSS
  // parser and split keywords like "expr/**/ession").
  const decoded = String(val)
    .replace(/\/\*[\s\S]*?\*\//g, '')                          // /* ... */ comments
    .replace(/\\([0-9a-fA-F]{1,6})\s?/g, (_, hex) => {          // \65 → 'e'
      const cp = parseInt(hex, 16);
      // Guard against invalid/overlong codepoints; drop them (browser would too).
      return (cp > 0 && cp <= 0x10FFFF) ? String.fromCodePoint(cp) : '';
    })
    .replace(/\\(.)/g, '$1');                                   // \x → x (literal escape)
  return DANGEROUS_CSS.some((re) => re.test(decoded));
}

// ─── Encoding normalization ───────────────────────────────────────────────────

export function normalizeEncoding(html) {
  // Strip BOM (U+FEFF) at start of string
  html = html.replace(/^\ufeff/, '');
  // Strip zero-width chars used in mXSS attacks (ZWSP U+200B, ZWNJ U+200C,
  // BOM U+FEFF mid-string, WORD JOINER U+2060). U+200D (ZERO WIDTH JOINER) is
  // intentionally preserved — it is the combiner in emoji sequences such as
  // family/profession emoji, and is not a tag/attribute delimiter, so keeping
  // it does not reopen an mXSS vector.
  html = html.replace(/[\u200B\u200C\uFEFF\u2060]/g, '');
  return html;
}

// ─── Text node normalization ──────────────────────────────────────────────────
// Converts smart quotes, dashes, and non-breaking spaces AFTER DOM parsing so
// attribute values and tag names are never touched.

export function normalizeTextNodes(fragment) {
  // H-7 fix: smart quotes (U+2018/2019/201C/201D) and dashes (U+2013/2014)
  // are valid typographic characters the author intentionally wrote or pasted.
  // Converting them to ASCII equivalents on every setHTML/paste round-trip
  // permanently destroyed user content.  Only normalize NBSP (U+00A0) because
  // that is a browser-inserted artifact that causes layout issues and must
  // never appear in serialized output HTML.
  const doc = fragment.ownerDocument || (typeof document !== 'undefined' ? document : null);
  if (!doc) return;

  const walker = doc.createTreeWalker(fragment, 4 /* NodeFilter.SHOW_TEXT */);
  let node;
  while ((node = walker.nextNode())) {
    const parentEl = node.parentNode && node.parentNode.nodeType === 1 ? node.parentNode : null;
    if (parentEl && parentEl.closest('pre, code')) continue;
    // Non-breaking space (U+00A0) → regular space: browser-inserted artifact.
    if (node.nodeValue.includes('\u00a0')) {
      node.nodeValue = node.nodeValue.replace(/\u00a0/g, ' ');
    }
  }
}

// ─── Structural normalization ─────────────────────────────────────────────────

export function normalizeStructure(fragment) {
  // Fix <p> directly nested inside <p> by unwrapping the inner one
  const innerPs = Array.from(fragment.querySelectorAll('p p'));
  for (const inner of innerPs) {
    const parent = inner.parentNode;
    if (!parent) continue;
    while (inner.firstChild) parent.insertBefore(inner.firstChild, inner);
    parent.removeChild(inner);
  }

  // Inline elements wrapping block elements — flatten them
  const INLINE_TAGS = new Set(['span', 'a', 'strong', 'em', 'u', 's', 'b', 'i']);
  const BLOCK_TAGS  = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
                                'blockquote', 'pre', 'ul', 'ol', 'li', 'table',
                                'thead', 'tbody', 'tr', 'th', 'td']);

  const inlines = Array.from(fragment.querySelectorAll(Array.from(INLINE_TAGS).join(',')));
  for (const inline of inlines) {
    const hasBlock = Array.from(inline.childNodes).some(
      (n) => n.nodeType === 1 && BLOCK_TAGS.has(n.tagName.toLowerCase())
    );
    if (hasBlock) {
      const parent = inline.parentNode;
      if (!parent) continue;
      while (inline.firstChild) parent.insertBefore(inline.firstChild, inline);
      parent.removeChild(inline);
    }
  }

  // 17.5.2 hardening — a completely EMPTY block element (no children at all)
  // is an invalid caret target in Firefox/WebKit: the caret lands outside it
  // and typing spawns a NEW block per input burst (found live: after
  // setHTML('<p></p>'), typing "x (c)" in Firefox produced five <p>s). Give
  // every childless block its placeholder <br> — the same canonical shape the
  // editor floor (<p><br></p>) already uses.
  const CARET_BLOCKS = 'p, h1, h2, h3, h4, h5, h6, li, td, th, div, blockquote';
  const doc = fragment.ownerDocument || (typeof document !== 'undefined' ? document : null);
  if (doc) {
    for (const el of Array.from(fragment.querySelectorAll(CARET_BLOCKS))) {
      if (el.childNodes.length === 0) el.appendChild(doc.createElement('br'));
    }
  }
}
