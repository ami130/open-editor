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
  // Header/footer/page-number text lands inside CSS `content:` strings in the
  // @page margin boxes, so strip anything that could break out of the string or
  // the rule (quotes/braces/semicolons/backslash). These are DISTINCT from the
  // HTML-escaped values used elsewhere — a CSS string has different metachars.
  // Page numbers land inside a CSS `content:` counter — no user text there, so
  // no sanitization needed for that box.
  //
  // CROSS-ENGINE STRATEGY (I9): Firefox's print engine IGNORES @page margin
  // boxes entirely, so a header/footer built only with @top-center/@bottom-*
  // vanishes in Firefox. `position: fixed` elements, by contrast, DO repeat on
  // every printed page in BOTH Chromium and Firefox. So:
  //   • header/footer  → position:fixed running <div>s in the body (both engines)
  //   • page numbers   → an @bottom-right margin box with counter(page). There is
  //     no body-element equivalent that resolves the page counter cross-engine,
  //     so page numbers remain a Chromium/Edge feature (documented); the header/
  //     footer TEXT now shows everywhere, which is the main premium value.
  // The header/footer text is HTML-escaped where it lands in the body divs (see
  // buildPrintDocument), so no CSS-string sanitization is needed here anymore.
  const hasHeader = !!o.header;
  const hasFooter = !!o.footer;
  const pageNumBox = o.pageNumbers
    ? `@bottom-right { content: "Page " counter(page) " of " counter(pages); font-size: 9pt; color: #888; }`
    : '';
  // Reserve top/bottom body space so fixed running bars never overlap content.
  const runTop = hasHeader ? '14mm' : '0';
  const runBottom = hasFooter ? '14mm' : '0';
  return `
    @page {
      size: ${o.pageSize} ${o.orientation};
      margin: ${o.margin};
      ${pageNumBox}
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    /* Fixed running header/footer — repeat on every page in Chromium AND Firefox. */
    .oe-pdf__running {
      position: fixed; left: 0; right: 0; font-size: 9pt; color: #888;
      text-align: center; padding: 4px 0;
    }
    .oe-pdf__running--header { top: 0; }
    .oe-pdf__running--footer { bottom: 0; }
    .oe-pdf__content { max-width: 100%; padding-top: ${runTop}; padding-bottom: ${runBottom}; }
    body {
      font-family: ${font};
      font-size: 12pt;
      line-height: 1.6;
      color: #1a1a1a;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    /* Heading scale/weight mirror the editor (base-css.js): h1/h2 are 700, not
       600, and h2/h3 sizes match exactly — previously headings looked lighter
       and slightly mis-sized vs the editor. */
    h1, h2, h3, h4, h5, h6 { line-height: 1.25; margin: 1.2em 0 0.5em; page-break-after: avoid; }
    h1 { font-size: 2em;    font-weight: 700; } h2 { font-size: 1.5em;  font-weight: 700; }
    h3 { font-size: 1.25em; font-weight: 600; } h4 { font-size: 1.1em;  font-weight: 600; }
    h5 { font-size: 1em;    font-weight: 600; } h6 { font-size: 0.9em;  font-weight: 600; color: #555; }
    p { margin: 0 0 0.8em; }
    a { color: #3547b8; text-decoration: underline; } /* --oe-link (editor) */
    strong { font-weight: 700; }
    ul, ol { margin: 0 0 0.8em; padding-left: 1.6em; }
    li { margin: 0.2em 0; }
    /* ── Blockquotes: mirror the editor (base-css.js). --bq-accent is settable
       per-quote via inline style (allowlisted), so we read it with the editor's
       default border color as fallback and use color-mix against white for the
       tinted fills — exactly as the editor does against --oe-bg (=#fff). ── */
    blockquote, blockquote[data-bq-style="border"] {
      --bq-accent: #c5c5c5;
      margin: 8px 0; padding: 4px 0 4px 16px;
      border-left: 4px solid var(--bq-accent); background: transparent;
      color: #555; font-style: italic;
    }
    blockquote[data-bq-style="card"] {
      --bq-accent: #e6e9f0; font-style: normal; color: #1a1a1a;
      border: none; border-left: 4px solid var(--bq-accent); border-radius: 6px;
      background: color-mix(in srgb, var(--bq-accent) 12%, #fff);
      margin: 8px 0; padding: 14px 14px 14px 18px;
    }
    blockquote[data-bq-style="pull"] {
      --bq-accent: #1a1a1a; border: none;
      border-top: 2px solid var(--bq-accent); border-bottom: 2px solid var(--bq-accent);
      background: transparent; margin: 16px 24px; padding: 12px 0;
      color: #111; font-style: italic; font-size: 1.25em; font-weight: 500;
      text-align: center; line-height: 1.5;
    }
    /* Callout base — the editor keys these as callout-info/-warning/-success/
       -danger (NOT "callout"); a plain "callout" never exists. */
    blockquote[data-bq-style^="callout-"] {
      position: relative; font-style: normal; border-radius: 6px;
      margin: 8px 0; padding: 12px 16px 12px 46px;
      border-left: 4px solid var(--bq-accent);
      background: color-mix(in srgb, var(--bq-accent) 10%, #fff);
    }
    blockquote[data-bq-style^="callout-"]::before {
      position: absolute; left: 14px; top: 12px; font-size: 1.1em; line-height: 1;
    }
    blockquote[data-bq-style="callout-info"]    { --bq-accent: #1e88e5; color: #1a3a5c; }
    blockquote[data-bq-style="callout-info"]::before    { content: "\\1F4A1"; }
    blockquote[data-bq-style="callout-warning"] { --bq-accent: #f5c518; color: #5a3e00; }
    blockquote[data-bq-style="callout-warning"]::before { content: "\\26A0\\FE0F"; }
    blockquote[data-bq-style="callout-success"] { --bq-accent: #43a047; color: #1b3a20; }
    blockquote[data-bq-style="callout-success"]::before { content: "\\2705"; }
    blockquote[data-bq-style="callout-danger"]  { --bq-accent: #e53935; color: #4a0a0a; }
    blockquote[data-bq-style="callout-danger"]::before  { content: "\\274C"; }
    pre {
      background: #f5f6f8; border: 1px solid #e2e5ea; border-radius: 4px;
      padding: 0.8em 1em; overflow: auto; page-break-inside: avoid;
      font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size: 10.5pt;
    }
    code { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size: 0.92em; }
    p code, li code { background: #f0f1f4; border-radius: 3px; padding: 0.1em 0.3em; }
    /* Highlights: <mark> carries its color as an inline style (allowlisted), so
       that wins here; this default matches the browser fallback and forces the
       fill to actually print. sub/sup keep their baseline shift. */
    mark { background: #fff3a3; color: inherit; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    sub, sup { line-height: 0; }
    img { max-width: 100%; height: auto; }
    /* Figure alignment — faithfully mirror the editor's image-styles.js so the
       PDF places images exactly where the editor shows them (previously only
       --center was handled, so left/right/inline images landed default-placed,
       which read as "image placement not perfect"). */
    figure { margin: 1em 0; page-break-inside: avoid; }
    figure.oe-figure--left  { float: left;  margin: 0.25em 1.25em 0.75em 0; max-width: 60%; }
    figure.oe-figure--right { float: right; margin: 0.25em 0 0.75em 1.25em; max-width: 60%; }
    figure.oe-figure--center { display: block; width: fit-content; max-width: 100%; margin-left: auto; margin-right: auto; }
    figure.oe-figure--center img { margin-left: auto; margin-right: auto; }
    figure.oe-figure--center figcaption { text-align: center; }
    figure.oe-figure--inline { display: inline-block; vertical-align: bottom; margin: 0 0.35em; }
    /* clear floats so a following block doesn't wrap awkwardly under a floated
       figure at the end of the document. */
    figure.oe-figure--left::after, figure.oe-figure--right::after { content: ""; display: block; clear: both; }
    figcaption { font-size: 0.85em; color: #666; text-align: center; margin-top: 0.4em; }
    /* ── Tables: mirror the editor's classes with LITERAL token values (the
       print doc has neither the editor stylesheet nor its CSS variables).
       Inline style="" on a cell/table wins by specificity, so custom
       cell/header/border colors set in the editor carry over automatically.
       The editor's default border token (--oe-border-strong) is #d3d8e3 and
       its default header/stripe fill (--oe-panel-hover) is #f1f5f9. ── */
    table { border-collapse: collapse; width: 100%; margin: 0 0 0.8em; page-break-inside: avoid; table-layout: fixed; }
    caption { caption-side: top; padding: 4px 0; font-size: 0.85em; color: #6b7280; text-align: left; }
    th, td { border: 1px solid #d3d8e3; padding: 0.4em 0.6em; text-align: left; vertical-align: top; min-width: 24px; word-break: break-word; }
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
    /* Code blocks must WRAP in print (I1): a fixed-width PDF page can't scroll,
       so long lines were being clipped at the page edge. pre-wrap keeps
       whitespace/indentation but lets long lines break. */
    pre, pre code { white-space: pre-wrap; overflow-wrap: anywhere; }
    /* (blockquote callout/card/pull styles are defined once, above, keyed on the
       editor's real data-bq-style values.) */
    /* To-do lists (I3): the editor's checkbox is CSS-only, so replicate the
       box + checked glyph here or the PDF would show an empty bullet. */
    ul[data-todo-list] { list-style: none; padding-left: 0.2em; }
    ul[data-todo-list] li[data-todo] { position: relative; padding-left: 1.6em; list-style: none; }
    ul[data-todo-list] li[data-todo]::before {
      content: "\\2610"; position: absolute; left: 0; font-size: 1.1em; line-height: 1.3;
    }
    ul[data-todo-list] li[data-todo][data-checked="true"]::before { content: "\\2611"; }
    ul[data-todo-list] li[data-todo][data-checked="true"] { color: #6b7280; text-decoration: line-through; }
    ul[data-todo-list] li[data-todo] .oe-todo-check { display: none; }
    /* Media embeds: a live <iframe> can't play in a static PDF. Give the figure
       a bordered frame so it reads as an embedded video placeholder, hide the
       click-shield, and label it. NOTE: the label is a STATIC string — the
       provider name lives in data-provider, which the sanitizer STRIPS from
       getHTML() (only class/style/contenteditable/data-oe-island survive on a
       <figure>), so reading it via CSS attr() would render blank. The 16/9
       aspect ratio mirrors the editor's media-styles.js, not a fixed height. */
    figure.oe-embed { margin: 1em 0; border: 1px solid #d3d8e3; border-radius: 6px; padding: 0; page-break-inside: avoid; }
    figure.oe-embed .oe-embed__shield { display: none; }
    figure.oe-embed .oe-embed__frame { width: 100%; aspect-ratio: 16 / 9; min-height: 200px; border: 0; }
    figure.oe-embed::before {
      content: "Embedded video"; display: block;
      padding: 0.4em 0.8em; font-size: 0.8em; color: #6b7280; border-bottom: 1px solid #eceef2;
    }
    /* Bookmark anchors (I7): the in-editor marker (icon/color chrome) is editing
       affordance, not content — strip its presentation but keep the anchor text
       and the id so internal links can still target it. */
    a.oe-bookmark { color: inherit; text-decoration: none; background: none; }
    a.oe-bookmark[data-oe-icon]::before, a.oe-bookmark[data-oe-color] { background: none; }
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

  // Header/footer are position:fixed running bars so they repeat on every page
  // in BOTH Chromium and Firefox (see printStyles I9 note). Their text is
  // HTML-escaped here because it lands in real markup. Page numbers come from
  // the @page margin box in printStyles (counter-based).
  const headerBar = o.header
    ? `<div class="oe-pdf__running oe-pdf__running--header">${escapeHtml(o.header)}</div>`
    : '';
  const footerBar = o.footer
    ? `<div class="oe-pdf__running oe-pdf__running--footer">${escapeHtml(o.footer)}</div>`
    : '';
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">` +
    `<title>${escapeHtml(o.title)}</title>` +
    `<style>${printStyles(o)}</style></head>` +
    `<body>${headerBar}${footerBar}` +
    `<main class="oe-pdf__content">${html || '<p></p>'}</main>` +
    `</body></html>`;
}
