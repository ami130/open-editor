/**
 * link-url.js — user-typed href normalization (L4). Extracted from link-dom.js to
 * keep it under the 300-line limit.
 */

// A scheme-less token that LOOKS like a domain: label(.label)+ then an optional
// port/path/query/hash, e.g. example.com, www.foo.co.uk/page?a=1#x. The last
// dotted label must be a plausible TLD (letters only, 2+). Anchored, no space.
const BARE_DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}(:\d+)?([/?#]\S*)?$/i;
// A path-less token ending in a common file extension is a RELATIVE FILE, not a
// domain (page.html, my.file.pdf, data.json) — never prepend to it. A token WITH
// a path (x.com/a.pdf) is a real URL and still links.
const FILE_EXT_RE = /\.(html?|php|aspx?|jsp|js|mjs|cjs|ts|css|json|xml|md|txt|png|jpe?g|gif|webp|svg|avif|pdf|zip|gz|csv|docx?|xlsx?|pptx?)$/i;

/**
 * L4: turn a bare domain a user typed ("example.com", "www.x.co/page") into a
 * real absolute URL by prepending https://. Leaves untouched: values that already
 * have a scheme, in-page anchors (#…), absolute/relative paths (/…, ./…, ../…),
 * mailto/tel, path-less relative files (page.html), and anything with whitespace.
 * Returns the (possibly) rewritten href.
 */
export function normalizeUserHref(href) {
  if (typeof href !== 'string') return href;
  const t = href.trim();
  if (t === '') return t;
  if (/^[a-z][a-z0-9+.-]*:/i.test(t)) return t;      // already has a scheme
  if (t.startsWith('#') || t.startsWith('/') ||
      t.startsWith('./') || t.startsWith('../')) return t; // anchor / path
  if (/\s/.test(t)) return t;                        // not a single token
  if (!t.includes('/') && FILE_EXT_RE.test(t)) return t;  // relative file
  return BARE_DOMAIN_RE.test(t) ? `https://${t}` : t;
}
