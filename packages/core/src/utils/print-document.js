/**
 * print-document.js — build the standalone HTML document used by editor.print().
 *
 * H2: the print popup gets NONE of the editor's stylesheet unless we ship it,
 * so previously only the page-break rule travelled and everything else printed
 * as raw browser-default HTML. We now include the theme tokens + BASE_CSS and
 * wrap the content in `.oe-editor` so every `.oe-editor …` rule matches, giving
 * the printout the same typography/spacing/colors as the editor.
 *
 * A dedicated @media print block then neutralizes SCREEN-ONLY affordances (the
 * dashed page-break marker, the hr click-padding, selection outlines) and emits
 * the real page break — so screen markers never leak into paper.
 */
import { BASE_CSS } from './base-css.js';
import { THEME_TOKENS_CSS } from './theme-css.js';

// Screen→print reconciliation. Kept minimal and scoped to what the editor adds.
const PRINT_OVERRIDES = `
  @media print {
    /* real page break + no dashed screen marker */
    .oe-editor hr.oe-page-break { border: 0; height: 0; padding: 0; margin: 0;
      break-after: page; page-break-after: always; }
    /* the hr click-padding is a screen affordance — collapse it for print */
    .oe-editor hr { padding: 0; cursor: auto; }
    /* selection / editing chrome must never print */
    .oe-editor .oe-hr--selected { outline: 0 !important; }
    .oe-type-around { display: none !important; }
  }
  /* the print document has no wrapper — expose theme tokens on the content too */
  .oe-editor { color: var(--oe-fg, #111); background: #fff; }
`;

/**
 * Return a full HTML document string for printing `html` (the editor's getHTML
 * output). `title` names the print job/tab.
 */
export function buildPrintDocument(html, title = 'Print') {
  const safeTitle = String(title).replace(/[<>]/g, '');
  return '<!DOCTYPE html><html><head><meta charset="utf-8">'
    + `<title>${safeTitle}</title>`
    + `<style>${THEME_TOKENS_CSS}\n${BASE_CSS}\n${PRINT_OVERRIDES}</style>`
    + '</head><body><div class="oe-editor">'
    + html
    + '</div></body></html>';
}
