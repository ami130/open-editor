/**
 * print-document.js — pure builder: (contentHtml, options) → a complete,
 * self-contained, print-optimized HTML document string.
 *
 * No DOM, no window, no side effects — trivially unit-testable. The plugin
 * (index.js) feeds this the editor's sanitized getHTML() and hands the result
 * to the browser's native print-to-PDF (zero rendering deps, the plan's
 * "print API" approach). This is what distinguishes premium PDF from the free
 * `editor.print()` raw-dump: a real page setup + typographic stylesheet +
 * running header/footer.
 *
 * SECURITY: `contentHtml` is expected to already be sanitized (getHTML() runs
 * the output sanitizer). Option strings that land in markup — title, header,
 * footer — are HTML-escaped here so an integrator-supplied title can't inject.
 */

const PAGE_SIZES = new Set(['A4', 'Letter', 'Legal', 'A3', 'A5']);
const ORIENTATIONS = new Set(['portrait', 'landscape']);

/** Escape the five markup-significant chars for safe interpolation. */
export function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Normalize + default the caller's options. Kept separate so the plugin can
 * validate config once and tests can assert the defaults directly.
 */
export function normalizeOptions(opts = {}) {
  const pageSize = PAGE_SIZES.has(opts.pageSize) ? opts.pageSize : 'A4';
  const orientation = ORIENTATIONS.has(opts.orientation) ? opts.orientation : 'portrait';
  // Margin: a CSS length string; default 20mm. Reject anything with a brace or
  // semicolon (it lands inside an @page block) — fall back to the default.
  let margin = typeof opts.margin === 'string' && opts.margin.trim() ? opts.margin.trim() : '20mm';
  if (/[{};]/.test(margin)) margin = '20mm';
  return {
    title: opts.title != null ? String(opts.title) : 'Document',
    pageSize,
    orientation,
    margin,
    header: opts.header != null ? String(opts.header) : '',
    footer: opts.footer != null ? String(opts.footer) : '',
    pageNumbers: opts.pageNumbers !== false, // default on
    fontFamily: typeof opts.fontFamily === 'string' && opts.fontFamily.trim()
      ? opts.fontFamily.trim()
      : 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  };
}

/** The print stylesheet — the thing that makes the PDF look designed. */
function printStyles(o) {
  // Escape any font-family the caller passed (it lands in a CSS declaration;
  // a stray "}" would break out of the rule). Quotes/braces/semicolons out.
  const font = o.fontFamily.replace(/[<>{};]/g, '');
  return `
    @page {
      size: ${o.pageSize} ${o.orientation};
      margin: ${o.margin};
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      font-family: ${font};
      font-size: 12pt;
      line-height: 1.6;
      color: #1a1a1a;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .oe-pdf__content { max-width: 100%; }
    h1, h2, h3, h4, h5, h6 { line-height: 1.25; margin: 1.2em 0 0.5em; font-weight: 600; page-break-after: avoid; }
    h1 { font-size: 2em; } h2 { font-size: 1.6em; } h3 { font-size: 1.3em; }
    h4 { font-size: 1.1em; } h5 { font-size: 1em; } h6 { font-size: 0.9em; color: #555; }
    p { margin: 0 0 0.8em; }
    a { color: #0a58ca; text-decoration: underline; }
    strong { font-weight: 700; }
    ul, ol { margin: 0 0 0.8em; padding-left: 1.6em; }
    li { margin: 0.2em 0; }
    blockquote {
      margin: 0 0 0.8em; padding: 0.4em 1em;
      border-left: 3px solid #c8ccd2; color: #4a4f57; font-style: italic;
    }
    pre {
      background: #f5f6f8; border: 1px solid #e2e5ea; border-radius: 4px;
      padding: 0.8em 1em; overflow: auto; page-break-inside: avoid;
      font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size: 10.5pt;
    }
    code { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size: 0.92em; }
    p code, li code { background: #f0f1f4; border-radius: 3px; padding: 0.1em 0.3em; }
    img { max-width: 100%; height: auto; }
    figure { margin: 1em 0; page-break-inside: avoid; }
    figure.oe-figure--center { text-align: center; }
    figcaption { font-size: 0.85em; color: #666; text-align: center; margin-top: 0.4em; }
    /* ── Tables: mirror the editor's classes with LITERAL token values (the
       print doc has neither the editor stylesheet nor its CSS variables).
       Inline style="" on a cell/table wins by specificity, so custom
       cell/header/border colors set in the editor carry over automatically.
       The editor's default border token (--oe-border-strong) is #d3d8e3 and
       its default header/stripe fill (--oe-panel-hover) is #f1f5f9. ── */
    table { border-collapse: collapse; width: 100%; margin: 0 0 0.8em; page-break-inside: avoid; table-layout: fixed; }
    caption { caption-side: top; padding: 4px 0; font-size: 0.85em; color: #6b7280; text-align: left; }
    th, td { border: 1px solid #d3d8e3; padding: 0.4em 0.6em; text-align: left; vertical-align: top; }
    th { background: #f1f5f9; font-weight: 600; }
    /* Style presets (class-driven in the editor — replicated here). */
    table.oe-table--bordered { border: 2px solid #d3d8e3; }
    table.oe-table--bordered th, table.oe-table--bordered td { border: 1px solid #d3d8e3; }
    table.oe-table--striped tbody tr:nth-child(even) td,
    table.oe-table--striped > tbody tr:nth-child(even) td { background: var(--oe-table-stripe, #f1f5f9); }
    table.oe-table--borderless th, table.oe-table--borderless td { border: 0; }
    table.oe-table--borderless th { border-bottom: 2px solid #d3d8e3; }
    table.oe-table--dotted, table.oe-table--dotted th, table.oe-table--dotted td { border: 1px dotted #d3d8e3; }
    hr { border: 0; border-top: 1px solid #d0d4da; margin: 1.5em 0; }
    hr.oe-page-break { border: 0; height: 0; break-after: page; page-break-after: always; }
    .oe-pdf__running { position: running(running); font-size: 9pt; color: #888; }
  `;
}

/**
 * Build the full print document string.
 * @param {string} contentHtml  sanitized editor HTML (from getHTML())
 * @param {object} [options]    see normalizeOptions
 * @returns {string} a complete <!DOCTYPE html> document
 */
export function buildPrintDocument(contentHtml, options) {
  const o = normalizeOptions(options);
  const html = typeof contentHtml === 'string' ? contentHtml : '';

  const headerBar = o.header
    ? `<div class="oe-pdf__header">${escapeHtml(o.header)}</div>`
    : '';
  const footerBits = [];
  if (o.footer) footerBits.push(escapeHtml(o.footer));
  const footerBar = footerBits.length
    ? `<div class="oe-pdf__footer">${footerBits.join(' · ')}</div>`
    : '';

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">` +
    `<title>${escapeHtml(o.title)}</title>` +
    `<style>${printStyles(o)}</style></head>` +
    `<body>${headerBar}` +
    `<main class="oe-pdf__content">${html || '<p></p>'}</main>` +
    `${footerBar}</body></html>`;
}
