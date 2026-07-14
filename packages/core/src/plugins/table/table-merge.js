/**
 * table-merge.js — merge + split cell operations (11.13), matching Jodit.
 *
 * All ops are pure DOM mutations computed against the formal matrix so span
 * arithmetic stays correct. Built + unit-tested with zero UI before wiring.
 *
 *   mergeCells(table, cells)      — merge a rectangular selection into the
 *                                   top-left cell (colspan/rowspan recomputed
 *                                   from the bounds; other cells' non-empty
 *                                   content joined with <br>; emptied rows removed).
 *   splitVertical(table, cell)    — split one cell into two side-by-side.
 *   splitHorizontal(table, cell)  — split one cell into two stacked.
 */
import {
  buildMatrix, matrixDimensions, cellCoords, cellAt, tableRows,
  colSpan, rowSpan, selectionBounds, rangeIsRectangular,
} from './table-matrix.js';
import { addColToColgroup } from './table-ops.js';

function setSpan(cell, attr, n) {
  if (n <= 1) cell.removeAttribute(attr);
  else cell.setAttribute(attr, String(n));
}
function newCell(doc, tag) {
  const c = doc.createElement(tag);
  c.appendChild(doc.createElement('br'));
  return c;
}
function isEmptyCell(cell) {
  const html = cell.innerHTML.replace(/<br\s*\/?>/gi, '').trim();
  return html === '';
}

/**
 * Merge a rectangular set of cells. Returns the surviving cell, or null when
 * the selection is empty or not a clean rectangle (nothing is mutated then).
 */
export function mergeCells(table, cells) {
  const list = Array.from(cells instanceof Set ? cells : cells || []);
  if (list.length < 2) return null;
  const m = buildMatrix(table);
  const bounds = selectionBounds(m, list);
  if (!bounds) return null;
  if (!rangeIsRectangular(m, list, bounds)) return null; // ragged selection → refuse

  const survivor = cellAt(m, bounds.minR, bounds.minC);
  if (!survivor) return null;

  // Collect distinct cells inside the rectangle (survivor first, DOM order).
  const seen = new Set();
  const inRect = [];
  for (let r = bounds.minR; r <= bounds.maxR; r++) {
    for (let c = bounds.minC; c <= bounds.maxC; c++) {
      const cell = cellAt(m, r, c);
      if (cell && !seen.has(cell)) { seen.add(cell); inRect.push(cell); }
    }
  }

  // Combine non-empty content from the non-survivor cells with <br>.
  const parts = [];
  if (!isEmptyCell(survivor)) parts.push(survivor.innerHTML.trim());
  for (const cell of inRect) {
    if (cell === survivor) continue;
    if (!isEmptyCell(cell)) parts.push(cell.innerHTML.trim());
  }

  // Remove the non-survivor cells.
  for (const cell of inRect) {
    if (cell !== survivor && cell.parentNode) cell.parentNode.removeChild(cell);
  }

  survivor.innerHTML = parts.length ? parts.join('<br>') : '<br>';

  // Remove any rows that ended up with no cells. Track how many of the rows the
  // merge rectangle covered are actually removed — a merge that consumes ENTIRE
  // rows deletes them, so the survivor must NOT keep a rowspan that points at
  // rows that no longer exist (that produces malformed HTML — the bug this fixes).
  let removedRows = 0;
  for (const tr of tableRows(table)) {
    if (tr.cells.length === 0 && tr.parentNode) {
      tr.parentNode.removeChild(tr);
      removedRows++;
    }
  }

  // Recompute spans against what physically survives. colspan is unaffected by
  // row removal; rowspan is the selection height minus any fully-consumed rows,
  // floored at 1.
  const spannedRows = (bounds.maxR - bounds.minR + 1) - removedRows;
  setSpan(survivor, 'colspan', bounds.maxC - bounds.minC + 1);
  setSpan(survivor, 'rowspan', Math.max(1, spannedRows));
  return survivor;
}

/**
 * Split a cell into two columns. Matches Jodit:
 *   colSpan >= 2 → shrink the cell's colspan by 1 and add a sibling cell.
 *   colSpan  < 2 → insert a sibling and grow the colspan of the cell occupying
 *                  the same column in every OTHER row (keeps the grid rectangular).
 */
export function splitVertical(table, cell) {
  const doc = table.ownerDocument;
  const m = buildMatrix(table);
  const at = cellCoords(m, cell);
  if (!at) return;
  const clone = newCell(doc, cell.tagName.toLowerCase());
  if (rowSpan(cell) > 1) setSpan(clone, 'rowspan', rowSpan(cell));

  if (colSpan(cell) >= 2) {
    setSpan(cell, 'colspan', colSpan(cell) - 1);
    cell.after(clone);
    return;
  }
  cell.after(clone);
  // Grow neighbours in the same column (other rows) so columns stay aligned.
  const { rows } = matrixDimensions(m);
  const grown = new Set();
  for (let r = 0; r < rows; r++) {
    if (r === at.row) continue;
    const c = cellAt(m, r, at.col);
    if (c && c !== cell && !grown.has(c) && cellCoords(m, c).row === r) {
      grown.add(c);
      setSpan(c, 'colspan', colSpan(c) + 1);
    }
  }
  // The table gained one logical column → keep the <colgroup> in sync so column
  // widths stay correct and later resize/delete indexing maps 1:1 to columns.
  addColToColgroup(table, at.col + 1);
}

/**
 * Split a cell into two rows. Matches Jodit:
 *   rowSpan >= 2 → shrink the cell's rowspan by 1 and place a new cell in the
 *                  next row within its former span.
 *   rowSpan  < 2 → insert a new row after and grow the rowspan of the cell in
 *                  the same column in every OTHER column-row so rows stay aligned.
 */
export function splitHorizontal(table, cell) {
  const doc = table.ownerDocument;
  const m = buildMatrix(table);
  const at = cellCoords(m, cell);
  if (!at) return;

  if (rowSpan(cell) >= 2) {
    setSpan(cell, 'rowspan', rowSpan(cell) - 1);
    const targetRow = tableRows(table)[at.row + 1];
    const clone = newCell(doc, cell.tagName.toLowerCase());
    if (colSpan(cell) > 1) setSpan(clone, 'colspan', colSpan(cell));
    const refM = buildMatrix(table);
    const ref = _domRef(table, refM, at.row + 1, at.col);
    if (targetRow) targetRow.insertBefore(clone, ref);
    return;
  }

  // rowSpan < 2 → new row directly below, grow other columns' cells rowspan.
  const doc2 = table.ownerDocument;
  const tr = doc2.createElement('tr');
  const clone = newCell(doc2, cell.tagName.toLowerCase());
  if (colSpan(cell) > 1) setSpan(clone, 'colspan', colSpan(cell));
  tr.appendChild(clone);
  const curTr = tableRows(table)[at.row];
  curTr.after(tr);

  // Every other cell in the current row must span down into the new row.
  const grown = new Set();
  const { cols } = matrixDimensions(m);
  for (let c = 0; c < cols; c++) {
    if (c >= at.col && c < at.col + colSpan(cell)) continue; // the split cell's own columns
    const other = cellAt(m, at.row, c);
    if (other && other !== cell && !grown.has(other)) {
      grown.add(other);
      setSpan(other, 'rowspan', rowSpan(other) + 1);
    }
  }
}

// DOM cell currently at logical (r,c) in its row, for insertBefore (or null).
function _domRef(table, m, r, c) {
  const cell = cellAt(m, r, c);
  return cell && cell.parentNode === tableRows(table)[r] ? cell : null;
}
