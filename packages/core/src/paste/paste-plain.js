/**
 * paste-plain.js — Phase 12.G: plain-text paste handling.
 *
 * 12.9  plainTextToHtml — turn a plain-text clipboard payload into clean HTML.
 *       Blank-line-separated chunks become separate paragraphs; a single line
 *       break inside a chunk becomes a <br>. This beats the old behavior (one
 *       block joined by <br>s) and matches how a person reads pasted text.
 *       In <br> enter-mode (no paragraph wrapping) it degrades to a single
 *       run with <br>s, preserving the editor's block model.
 *
 * 12.10 is wired in editor-paste.js (a one-shot "force plain" flag set by the
 *       Ctrl+Shift+V handler); this module just provides the text→HTML shaping.
 *
 * Pure functions — no DOM, no editor. Text is HTML-escaped so no character is
 * ever interpreted as markup.
 */

/** Escape the five HTML-significant characters. */
export function escapeHtmlText(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Convert plain text to HTML.
 * @param {string} text
 * @param {object} [opts]
 * @param {boolean} [opts.block=true]  wrap blank-line chunks in <p> (paragraph
 *   enter-mode). When false (<br> enter-mode) the whole text is one run with
 *   <br> for every line break.
 * @returns {string}
 */
/**
 * T7: does the plain text look like a spreadsheet paste (TSV)? Requires ≥2 lines
 * where at least one line contains a TAB — the shape Excel/Google Sheets put on
 * the plain-text clipboard. (A single tab-less paragraph is NOT a table.)
 */
export function looksLikeTsv(text) {
  const lines = String(text == null ? '' : text).replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n');
  if (lines.length < 2) return false;
  return lines.some((l) => l.includes('\t'));
}

/**
 * T7: convert a TSV clipboard payload to a clean <table> HTML string. Rows split
 * on newline, cells on TAB; the grid is padded to the widest row so it's
 * rectangular. Cell text is HTML-escaped. First row is NOT auto-headered (Sheets
 * doesn't distinguish); the user can toggle a header row after.
 */
export function tsvToTableHtml(text) {
  const rows = String(text == null ? '' : text)
    .replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n')
    .map((line) => line.split('\t'));
  const cols = rows.reduce((n, r) => Math.max(n, r.length), 0);
  const body = rows.map((cells) => {
    const tds = [];
    for (let c = 0; c < cols; c++) {
      const v = escapeHtmlText(cells[c] != null ? cells[c] : '');
      tds.push(`<td>${v || '<br>'}</td>`);
    }
    return `<tr>${tds.join('')}</tr>`;
  }).join('');
  return `<table class="oe-table"><tbody>${body}</tbody></table>`;
}

export function plainTextToHtml(text, opts = {}) {
  const block = opts.block !== false;
  const src = String(text == null ? '' : text);
  if (src === '') return '';

  // T7: a spreadsheet (TSV) paste becomes a real table instead of tab-run text —
  // but only in paragraph (block) mode; <br>/force-plain mode keeps it literal.
  if (block && opts.tsvTables !== false && looksLikeTsv(src)) return tsvToTableHtml(src);

  // Normalize line endings first so \r\n / \r behave like \n everywhere.
  const normalized = src.replace(/\r\n?/g, '\n');

  if (!block) {
    // <br> mode: single run, every newline becomes a <br>.
    return escapeHtmlText(normalized).replace(/\n/g, '<br>');
  }

  // Paragraph mode: split on runs of blank lines into paragraphs; within a
  // paragraph a lone newline is a soft break (<br>).
  const chunks = normalized
    .split(/\n{2,}/)                 // blank line(s) separate paragraphs
    .map((c) => c.replace(/^\n+|\n+$/g, '')) // trim stray edge newlines
    .filter((c) => c.trim() !== '');

  if (chunks.length === 0) return '';

  return chunks
    .map((chunk) => `<p>${escapeHtmlText(chunk).replace(/\n/g, '<br>')}</p>`)
    .join('');
}
