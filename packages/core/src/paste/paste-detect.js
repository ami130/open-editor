/**
 * paste-detect.js — Phase 12.B: detect where pasted HTML came from, so the
 * pipeline can pick the right source-specific cleanup stage.
 *
 * Returns one of:
 *   'word'    — Microsoft Word / Excel / LibreOffice / OpenOffice
 *   'gdocs'   — Google Docs (the docs-internal-guid wrapper)
 *   'generic' — any other HTML (browser, CMS, hand-written)
 *
 * The Word markers mirror Jodit's `isHtmlFromWord` (source-verified) plus the
 * conditional-comment marker; the GDocs marker is the guid wrapper id that
 * every Google-Docs copy carries. Detection is a cheap read-only string scan —
 * it never mutates the HTML.
 */

// Word / Office family. Any one match is sufficient. Markers are written to
// match STRUCTURAL Word markup (attributes, meta, real tags), NOT arbitrary
// text — so a blog post or code block that merely mentions "mso-list" or shows
// "<o:p" as escaped text is not misclassified as Word (#4).
const WORD_MARKERS = [
  /<meta[^>]*(?:Microsoft (?:Word|Excel)|ProgId[^>]*(?:Word|Excel)\.)/i,
  /<meta[^>]*(?:LibreOffice|OpenOffice)/i,
  /urn:schemas-microsoft-com:office:(?:word|excel|office)/i,
  /<\w[^>]*\sclass=["']?Mso/i,             // class="MsoNormal" etc.
  /\sstyle=["'][^"']*mso-[a-z-]+\s*:/i,    // mso-* only inside a style attribute
  /<!--\s*\[if [^\]]*\]>/i,                // Word conditional comment
  /<o:p\b[^>]*>/i,                          // real <o:p> tag (attrs or close)
  /<[wv]:[a-z][a-z0-9]*[\s>/]/i,            // real <w:*> / <v:*> (VML) tags
];

// Google Docs: the wrapper id present on every Docs copy.
const GDOCS_MARKER = /id=["']?docs-internal-guid-/i;

/**
 * @param {string} html
 * @returns {'word'|'gdocs'|'generic'}
 */
export function detectSource(html) {
  if (typeof html !== 'string' || html === '') return 'generic';
  // Word takes precedence: a Word doc pasted through Docs still carries mso-*
  // markers that need the Word cleanup, and Word is the messier source.
  if (isWordHtml(html)) return 'word';
  if (GDOCS_MARKER.test(html)) return 'gdocs';
  return 'generic';
}

/** True when the HTML looks like it came from Word/Excel/LibreOffice. */
export function isWordHtml(html) {
  if (typeof html !== 'string' || html === '') return false;
  return WORD_MARKERS.some((re) => re.test(html));
}

/** True when the HTML looks like it came from Google Docs. */
export function isGDocsHtml(html) {
  if (typeof html !== 'string' || html === '') return false;
  // Not Word (Word wins) and carries the Docs guid wrapper.
  return !isWordHtml(html) && GDOCS_MARKER.test(html);
}
