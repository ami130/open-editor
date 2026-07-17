/**
 * ooxml-table.js — DOM <table> → WordprocessingML <w:tbl>. Extracted from
 * ooxml-body.js to keep that file under the length budget. Handles style
 * presets, per-cell shading/borders/colors, column widths, captions, and
 * colspan/rowspan merges (w:gridSpan + w:vMerge).
 *
 * `para` and `escapeXml` are injected by the caller (ooxml-body) to avoid a
 * circular import — this module owns only table structure, not run rendering.
 */
import { cssColorToHex, cssBorderToOoxml, parseStyle } from './css-color.js';

// Full page content width (A4 portrait minus 1" margins each side) in twips —
// used to turn the editor's percentage column widths into absolute w:gridCol.
const CONTENT_TWIPS = 9026;

/** Table-level border spec from the style-preset classes (editor default grid). */
function tableBorderSpec(table) {
  const cls = table.getAttribute('class') || '';
  if (/\boe-table--borderless\b/.test(cls)) {
    // borderless: no grid, but the editor keeps a header bottom rule — approximate
    // with no table borders (header emphasis comes from the bold TableHeader style).
    return null;
  }
  const dotted = /\boe-table--dotted\b/.test(cls);
  const val = dotted ? 'dotted' : 'single';
  const sz = /\boe-table--bordered\b/.test(cls) ? 8 : 4;
  const inside = dotted ? 'dotted' : 'single';
  return { val, sz, inside, color: 'D3D8E3' };
}

/** Resolve the striped fill: the table's --oe-table-stripe var, else editor default. */
function stripeFill(table) {
  const style = parseStyle(table.getAttribute('style'));
  return cssColorToHex(style['--oe-table-stripe']) || 'F1F5F9';
}

/** Parse a positive integer span attribute (colspan/rowspan), min 1. */
function spanOf(cell, attr) {
  const v = parseInt(cell.getAttribute(attr) || '1', 10);
  return Number.isFinite(v) && v > 1 ? v : 1;
}

/**
 * <w:tcPr>: width, shading, borders, vAlign, plus merge markers.
 * @param {object} [merge] { gridSpan?, vMerge?: 'restart'|'continue' }
 */
function cellProps(cell, striped, isEvenRow, merge = {}) {
  const style = parseStyle(cell.getAttribute('style'));
  const parts = ['<w:tcW w:w="0" w:type="auto"/>'];
  // colspan → horizontal merge; rowspan → vertical merge (restart/continue).
  if (merge.gridSpan > 1) parts.push(`<w:gridSpan w:val="${merge.gridSpan}"/>`);
  if (merge.vMerge) parts.push(`<w:vMerge w:val="${merge.vMerge}"/>`);
  // Background: explicit cell color wins; else striped even-row fill; else none.
  const bg = cssColorToHex(style['background-color'] || style.background);
  const fill = bg || (striped && isEvenRow ? cell._stripe : null);
  if (fill) parts.push(`<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>`);
  // Per-side / shorthand borders from inline style.
  const sides = [['top', 'border-top'], ['left', 'border-left'], ['bottom', 'border-bottom'], ['right', 'border-right']];
  const bAll = cssBorderToOoxml(style.border);
  const borderXml = [];
  for (const [w, prop] of sides) {
    const b = cssBorderToOoxml(style[prop]) || bAll;
    if (b) borderXml.push(`<w:${w} w:val="${b.val}" w:sz="${b.sz}" w:space="0" w:color="${b.color}"/>`);
  }
  if (borderXml.length) parts.push(`<w:tcBorders>${borderXml.join('')}</w:tcBorders>`);
  const va = style['vertical-align'];
  if (va === 'middle' || va === 'bottom') parts.push(`<w:vAlign w:val="${va === 'middle' ? 'center' : 'bottom'}"/>`);
  return `<w:tcPr>${parts.join('')}</w:tcPr>`;
}

/** An empty continuation cell for a vertical (rowspan) merge. */
function vMergeContinuationCell(gridSpan) {
  const gs = gridSpan > 1 ? `<w:gridSpan w:val="${gridSpan}"/>` : '';
  return `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/>${gs}<w:vMerge w:val="continue"/></w:tcPr><w:p/></w:tc>`;
}

/** Column widths (twips) from <col style="width:%"> → <w:tblGrid>. */
function tableGrid(table, colCount) {
  const cols = [...table.querySelectorAll('colgroup > col')];
  const grid = [];
  for (let i = 0; i < colCount; i++) {
    const pct = cols[i] ? parseFloat((parseStyle(cols[i].getAttribute('style'))['width'] || '')) : NaN;
    const w = Number.isFinite(pct) ? Math.round(CONTENT_TWIPS * pct / 100) : Math.round(CONTENT_TWIPS / colCount);
    grid.push(`<w:gridCol w:w="${w}"/>`);
  }
  return `<w:tblGrid>${grid.join('')}</w:tblGrid>`;
}

/**
 * @param {HTMLTableElement} table
 * @param {object} deps { para(el, opts) → string, escapeXml(s) → string }
 * @returns {string} the <w:tbl> XML (with a preceding caption paragraph if any)
 */
export function tableXml(table, { para, escapeXml, ctx }) {
  const rows = Array.from(table.querySelectorAll('tr'));
  if (!rows.length) return '';
  const striped = /\boe-table--striped\b/.test(table.getAttribute('class') || '');
  const stripe = stripeFill(table);
  const bs = tableBorderSpec(table);
  // Column count = max over rows of SUMMED colspans (not raw cell count), so
  // the <w:tblGrid> matches merged layouts.
  const colCount = Math.max(...rows.map((r) =>
    Array.from(r.children).filter((c) => /^t[hd]$/i.test(c.tagName))
      .reduce((sum, c) => sum + spanOf(c, 'colspan'), 0)), 1);

  const borders = bs ? '<w:tblBorders>' +
    ['top', 'left', 'bottom', 'right'].map((s) => `<w:${s} w:val="${bs.val}" w:sz="${bs.sz}" w:space="0" w:color="${bs.color}"/>`).join('') +
    `<w:insideH w:val="${bs.inside}" w:sz="4" w:space="0" w:color="${bs.color}"/>` +
    `<w:insideV w:val="${bs.inside}" w:sz="4" w:space="0" w:color="${bs.color}"/>` +
    '</w:tblBorders>' : '';
  const tblPr = `<w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblLayout w:type="fixed"/>${borders}</w:tblPr>`;

  // Caption → a Caption-styled paragraph BEFORE the table (Word has no table caption).
  const captionEl = table.querySelector(':scope > caption');
  const caption = captionEl && captionEl.textContent.trim()
    ? `<w:p><w:pPr><w:pStyle w:val="Caption"/></w:pPr><w:r><w:t xml:space="preserve">${escapeXml(captionEl.textContent.trim())}</w:t></w:r></w:p>`
    : '';

  // Track active vertical (rowspan) merges so we can insert <w:vMerge continue>
  // continuation cells in the rows they span.
  let trs = '';
  const pending = []; // [{ colsLeft, gridSpan }] — rowspans still open below
  rows.forEach((tr, rowIdx) => {
    const cells = Array.from(tr.children).filter((c) => /^t[hd]$/i.test(c.tagName));
    const nextPending = [];
    let tcs = '';
    // Emit continuations from rowspans opened in earlier rows first.
    for (const p of pending) {
      tcs += vMergeContinuationCell(p.gridSpan);
      if (p.colsLeft > 1) nextPending.push({ colsLeft: p.colsLeft - 1, gridSpan: p.gridSpan });
    }
    for (const cell of cells) {
      cell._stripe = stripe;
      const isHead = cell.tagName.toLowerCase() === 'th';
      const gridSpan = spanOf(cell, 'colspan');
      const rowSpan = spanOf(cell, 'rowspan');
      // Seed run marks with the cell's OWN text color (inline `color` on td/th).
      const cs = parseStyle(cell.getAttribute('style'));
      const baseMarks = {};
      const cc = cssColorToHex(cs.color);
      if (cc) baseMarks.color = cc;
      const p = para(cell, { style: isHead ? 'TableHeader' : undefined, baseMarks, ctx });
      const merge = { gridSpan, vMerge: rowSpan > 1 ? 'restart' : null };
      tcs += `<w:tc>${cellProps(cell, striped, rowIdx % 2 === 1, merge)}${p || '<w:p/>'}</w:tc>`;
      if (rowSpan > 1) nextPending.push({ colsLeft: rowSpan - 1, gridSpan });
    }
    pending.length = 0;
    for (const np of nextPending) pending.push(np);
    trs += `<w:tr>${tcs}</w:tr>`;
  });
  return `${caption}<w:tbl>${tblPr}${tableGrid(table, colCount)}${trs}</w:tbl>`;
}
