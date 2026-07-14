/**
 * table-format.js — pure styling / structural-format ops for the Table plugin
 * (11.9 header toggle, 11.10 table styling, 11.11 cell colors, 11.12 per-side
 * borders, 11.17 cell alignment). All ops are DOM mutations expressed via safe
 * inline styles (the sanitizer's isUnsafeStyle guards the values) or the
 * `scope` attribute; no UI, so they are unit-testable in isolation.
 */
import { tableRows } from './table-matrix.js';

/** Replace a cell element with a new tag, preserving children + attributes. */
function retag(cell, newTag) {
  const doc = cell.ownerDocument;
  const el = doc.createElement(newTag);
  for (const attr of Array.from(cell.attributes)) el.setAttribute(attr.name, attr.value);
  while (cell.firstChild) el.appendChild(cell.firstChild);
  cell.parentNode.replaceChild(el, cell);
  return el;
}

/**
 * 11.9 — Toggle the first row between header (<th scope="col">) and body (<td>).
 * Returns true if the row is now a header row, false if now a body row.
 */
export function toggleHeaderRow(table) {
  const rows = tableRows(table);
  if (!rows.length) return false;
  const first = rows[0];
  const cells = Array.from(first.cells);
  const makeHeader = cells.some((c) => c.tagName.toLowerCase() === 'td');
  for (const cell of cells) {
    if (makeHeader && cell.tagName.toLowerCase() === 'td') {
      const th = retag(cell, 'th');
      th.setAttribute('scope', 'col');
    } else if (!makeHeader && cell.tagName.toLowerCase() === 'th') {
      const td = retag(cell, 'td');
      td.removeAttribute('scope');
    }
  }
  return makeHeader;
}

/** 11.11/11.17 — set a CSS property on each cell; empty value clears it. */
export function setCellStyle(cells, prop, value) {
  const list = Array.from(cells instanceof Set ? cells : cells || []);
  for (const cell of list) {
    if (value == null || value === '') cell.style[prop] = '';
    else cell.style[prop] = value;
  }
}

/** 11.11 — cell background / text colour (validated colour string). */
export function setCellBackground(cells, color) { setCellStyle(cells, 'backgroundColor', color); }
export function setCellTextColor(cells, color)  { setCellStyle(cells, 'color', color); }

/** 11.17 — cell content alignment. */
export function setCellAlign(cells, align)   { setCellStyle(cells, 'textAlign', align); }        // left|center|right|justify
export function setCellVAlign(cells, valign) { setCellStyle(cells, 'verticalAlign', valign); }   // top|middle|bottom

/**
 * 11.12 — per-side border on each cell. side ∈ top|right|bottom|left|all.
 * value is a CSS border shorthand (e.g. '1px solid #000') or '' to clear.
 */
export function setCellBorder(cells, side, value) {
  const list = Array.from(cells instanceof Set ? cells : cells || []);
  const prop = side === 'all' ? 'border' : `border${cap(side)}`;
  for (const cell of list) {
    if (value == null || value === '') cell.style[prop] = '';
    else cell.style[prop] = value;
  }
}
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

/**
 * 11.10 — table-level styling. opts:
 *   { width?: '80%'|'400px'|'', align?: 'left'|'center'|'right'|'',
 *     border?: '1px solid #ccc'|'' }
 * Alignment uses margins (center → auto; left/right → 0 with float-free block).
 */
export function setTableStyle(table, opts = {}) {
  if (!table) return;
  if ('width' in opts) table.style.width = opts.width || '';
  if ('border' in opts) {
    // Apply the border to the table AND every cell so it reads as a grid.
    table.style.border = opts.border || '';
    for (const tr of tableRows(table)) {
      for (const cell of Array.from(tr.cells)) cell.style.border = opts.border || '';
    }
  }
  if ('align' in opts) {
    const a = opts.align;
    table.style.marginLeft = '';
    table.style.marginRight = '';
    if (a === 'center') { table.style.marginLeft = 'auto'; table.style.marginRight = 'auto'; }
    else if (a === 'right') { table.style.marginLeft = 'auto'; table.style.marginRight = '0'; }
    else if (a === 'left') { table.style.marginLeft = '0'; table.style.marginRight = 'auto'; }
  }
}

/**
 * 11.14 — insert/edit/remove the table <caption>. An empty/blank text removes
 * the caption; otherwise it is set (created as the FIRST child per the HTML
 * spec — a caption must precede colgroup/thead/tbody). Returns the caption
 * element, or null when removed.
 */
export function setCaption(table, text) {
  if (!table) return null;
  const doc = table.ownerDocument;
  let cap = table.querySelector(':scope > caption');
  const value = (text || '').trim();
  if (!value) {
    if (cap && cap.parentNode) cap.parentNode.removeChild(cap);
    return null;
  }
  if (!cap) {
    cap = doc.createElement('caption');
    table.insertBefore(cap, table.firstChild); // caption must be first child
  }
  cap.textContent = value;
  return cap;
}

/**
 * 11.18 — apply preset classes to a table while preserving the base `oe-table`
 * class. `classes` is a space-separated string or array; passing '' clears the
 * presets (keeps `oe-table`).
 */
export function applyTableClasses(table, classes) {
  if (!table) return;
  const extra = (Array.isArray(classes) ? classes.join(' ') : (classes || ''))
    .split(/\s+/).filter((c) => c && c !== 'oe-table');
  table.className = ['oe-table', ...extra].join(' ');
}
