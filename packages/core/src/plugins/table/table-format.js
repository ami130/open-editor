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

/**
 * Built-in visual styles — shipped WITH css (table-styles.js) so they work with
 * zero config, applyable ANYTIME (not just at insert). These are composable
 * toggle classes on the base `oe-table` element:
 *   default    — the standard bordered grid (no extra class)
 *   bordered   — heavier outer + inner borders
 *   striped    — zebra-striped body rows
 *   borderless — no cell borders (clean text-table look)
 * `striped` composes with `bordered`. `default`/`borderless` are mutually
 * exclusive border modes.
 */
export const TABLE_STYLE_CLASSES = [
  'oe-table--bordered', 'oe-table--striped', 'oe-table--borderless', 'oe-table--dotted',
];

// The three BORDER MODES are mutually exclusive; striped is an independent
// overlay. Built-in styles offered in UIs (insert picker + format menu).
const BORDER_MODES = { bordered: 'oe-table--bordered', borderless: 'oe-table--borderless', dotted: 'oe-table--dotted' };

/** Insert-time / picker style options — value maps to a setTableStyleClass key. */
export const BUILTIN_TABLE_STYLES = [
  { value: '', label: 'Default style' },
  { value: 'bordered', label: 'Bordered' },
  { value: 'striped', label: 'Striped' },
  { value: 'dotted', label: 'Dotted' },
  { value: 'borderless', label: 'Borderless' },
];

/**
 * Toggle/set a built-in style class on a table. `style` ∈
 * 'default'|'bordered'|'striped'|'borderless'|'dotted'. `striped` toggles
 * independently; the border modes (bordered/borderless/dotted) replace each
 * other. Preserves any integrator preset classes.
 */
export function setTableStyleClass(table, style) {
  if (!table) return;
  const cls = table.classList;
  if (style === 'striped') {
    cls.toggle('oe-table--striped');
  } else if (BORDER_MODES[style]) {
    for (const m of Object.values(BORDER_MODES)) if (m !== BORDER_MODES[style]) cls.remove(m);
    cls.toggle(BORDER_MODES[style]);
  } else { // 'default'/'' — clear all border modes (keep striped if set)
    for (const m of Object.values(BORDER_MODES)) cls.remove(m);
  }
}

/**
 * Apply a style value at INSERT time (non-toggle: sets the border mode +
 * striped deterministically). 'bordered'|'borderless'|'dotted' set that mode;
 * 'striped' adds striping on the default border; ''/'default' = plain.
 */
export function applyInsertStyle(table, value) {
  if (!table || !value) return;
  if (value === 'striped') { table.classList.add('oe-table--striped'); return; }
  if (BORDER_MODES[value]) table.classList.add(BORDER_MODES[value]);
}

/** Read which built-in styles are active → { bordered, striped, borderless, dotted }. */
export function getTableStyleState(table) {
  const cls = table ? table.classList : { contains: () => false };
  return {
    bordered: cls.contains('oe-table--bordered'),
    striped: cls.contains('oe-table--striped'),
    borderless: cls.contains('oe-table--borderless'),
    dotted: cls.contains('oe-table--dotted'),
  };
}

/**
 * Header-band color (13.T): set/clear the background (and optional text color)
 * of the header cells — the first row's <th>, plus any <th scope="row"> in a
 * header column. Empty color clears. Applied as inline style so it survives
 * getHTML() (sanitizer-guarded) and overrides the default th background.
 */
export function setHeaderColor(table, bg, fg) {
  if (!table) return;
  const heads = table.querySelectorAll('th');
  for (const th of heads) {
    th.style.backgroundColor = bg || '';
    if (fg != null) th.style.color = fg || '';
  }
}

/**
 * Stripe color (13.T): the zebra color used by `oe-table--striped`, set as a
 * CSS custom property on the table so the stylesheet picks it up. Empty →
 * reverts to the token default.
 */
export function setStripeColor(table, color) {
  if (!table) return;
  if (color) table.style.setProperty('--oe-table-stripe', color);
  else table.style.removeProperty('--oe-table-stripe');
}
