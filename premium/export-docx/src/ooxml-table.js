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

// Block tags that, inside a cell, must become their OWN paragraph rather than
// being flattened into the cell's single run stream (I15). Mirrors the block
// set in ooxml-body.
const CELL_BLOCK_TAGS = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'ul', 'ol', 'dl', 'table']);

/**
 * Render a table cell's content as one or more <w:p> (I15). A cell with block
 * children (multiple <p>, a list, a nested table…) emits a paragraph per block
 * child via ctx.blockXml; the FIRST block carries the cell's paragraph style
 * (e.g. TableHeader). An inline-only cell is a single styled paragraph, exactly
 * as before. Always returns at least one paragraph so the <w:tc> is valid.
 */
function cellParagraphs(cell, opts, para) {
  const ctx = opts.ctx;
  const blockChildren = ctx && ctx.blockXml
    ? Array.from(cell.children).filter((c) => CELL_BLOCK_TAGS.has(c.tagName.toLowerCase()))
    : [];
  if (!blockChildren.length) return para(cell, opts) || '<w:p/>';
  let out = '';
  let firstDone = false;
  let lastTag = '';
  for (const c of cell.children) {
    const t = c.tagName.toLowerCase();
    if (!CELL_BLOCK_TAGS.has(t)) continue;
    if (!firstDone && (t === 'p' || t === 'div')) {
      // Reuse the cell's style/baseMarks on the first simple paragraph.
      out += para(c, opts); firstDone = true;
    } else {
      out += ctx.blockXml(c); firstDone = true;
    }
    lastTag = t;
  }
  if (!out) return para(cell, opts) || '<w:p/>';
  // OOXML requires a <w:tc> to END with a <w:p>. If the cell's last block is a
  // nested table (emits <w:tbl>), append an empty paragraph or Word rejects it.
  if (lastTag === 'table') out += '<w:p/>';
  return out;
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
  // Only the rows OWNED by this table — NOT rows of a nested <table> inside a
  // cell (querySelectorAll('tr') is unscoped and would pull those in, then the
  // same nested table also renders on its own via the cell walk → duplicated,
  // grid-corrupting rows and a "repair" prompt in Word). A row belongs to this
  // table iff its closest ancestor <table> is this one.
  const rows = Array.from(table.querySelectorAll('tr'))
    .filter((tr) => tr.closest('table') === table);
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

  // Track active vertical (rowspan) merges BY COLUMN so a continuation lands in
  // the SAME column its origin cell occupied — not always at the front of the
  // row (the old bug: a rowspan starting in column 2+ pushed every following
  // cell out of place and could overflow the grid). `openSpans` maps a column
  // index → { rowsLeft, gridSpan } for rowspans still open below that column.
  let trs = '';
  const openSpans = new Map(); // colIndex → { rowsLeft, gridSpan }
  rows.forEach((tr, rowIdx) => {
    const cells = Array.from(tr.children).filter((c) => /^t[hd]$/i.test(c.tagName));
    let tcs = '';
    let col = 0;          // current grid column
    let cellIdx = 0;      // index into this row's real cells
    // Walk columns left→right; at each column either emit a pending
    // continuation (this column is mid-rowspan) or consume the next real cell.
    while (cellIdx < cells.length || openSpans.size) {
      const open = openSpans.get(col);
      if (open) {
        tcs += vMergeContinuationCell(open.gridSpan);
        if (open.rowsLeft > 1) openSpans.set(col, { rowsLeft: open.rowsLeft - 1, gridSpan: open.gridSpan });
        else openSpans.delete(col);
        col += open.gridSpan;
        continue;
      }
      if (cellIdx >= cells.length) break; // no more real cells and no span here
      const cell = cells[cellIdx++];
      cell._stripe = stripe;
      const isHead = cell.tagName.toLowerCase() === 'th';
      const gridSpan = spanOf(cell, 'colspan');
      const rowSpan = spanOf(cell, 'rowspan');
      const cs = parseStyle(cell.getAttribute('style'));
      const baseMarks = {};
      const cc = cssColorToHex(cs.color);
      if (cc) baseMarks.color = cc;
      const p = cellParagraphs(cell, { style: isHead ? 'TableHeader' : undefined, baseMarks, ctx }, para);
      const merge = { gridSpan, vMerge: rowSpan > 1 ? 'restart' : null };
      tcs += `<w:tc>${cellProps(cell, striped, rowIdx % 2 === 1, merge)}${p || '<w:p/>'}</w:tc>`;
      if (rowSpan > 1) openSpans.set(col, { rowsLeft: rowSpan - 1, gridSpan });
      col += gridSpan;
    }
    trs += `<w:tr>${tcs}</w:tr>`;
  });
  return `${caption}<w:tbl>${tblPr}${tableGrid(table, colCount)}${trs}</w:tbl>`;
}
