/**
 * table-ops.js — structural row/column operations for the Table plugin (11.7).
 *
 * Every op is computed against the formal matrix (table-matrix.js) so
 * colspan/rowspan bookkeeping is handled correctly in one place:
 *   - inserting a column INSIDE a cell's colspan grows that cell's colspan
 *     rather than adding a stray cell;
 *   - deleting a row/column that a span crosses decrements the span and moves
 *     the origin cell down/right when its origin is the removed line;
 *   - <colgroup> is kept in sync with the column count.
 *
 * All ops are pure DOM mutations (no editor/selection side effects) so they are
 * unit-testable in isolation. The plugin wraps them with history + caret.
 */
import {
  buildMatrix, matrixDimensions, cellCoords, cellAt, tableRows, colSpan, rowSpan,
} from './table-matrix.js';

function setSpan(cell, attr, n) {
  if (n <= 1) cell.removeAttribute(attr);
  else cell.setAttribute(attr, String(n));
}

function newCell(doc, tag) {
  const c = doc.createElement(tag);
  c.appendChild(doc.createElement('br'));
  return c;
}

/** The <colgroup>, or null. Keeps column widths in sync with structure. */
function colgroupOf(table) { return table.querySelector('colgroup'); }

export function addColToColgroup(table, index) {
  const cg = colgroupOf(table);
  if (!cg) return;
  const cols = Array.from(cg.children);
  const col = table.ownerDocument.createElement('col');
  const ref = cols[index] || null;
  cg.insertBefore(col, ref);
  _redistributeCols(cg);
}
function removeColFromColgroup(table, index) {
  const cg = colgroupOf(table);
  if (!cg) return;
  const cols = Array.from(cg.children);
  if (cols[index]) cg.removeChild(cols[index]);
  _redistributeCols(cg);
}
function _redistributeCols(cg) {
  const cols = Array.from(cg.children);
  if (!cols.length) return;
  const w = (100 / cols.length).toFixed(4) + '%';
  for (const c of cols) c.style.width = w;
}

/**
 * Insert a row relative to the row at logical index `refRow`.
 * `where` is 'above' | 'below'. Cells whose rowspan crosses the boundary are
 * grown; a fresh <tr> of the right width is inserted otherwise.
 */
export function insertRow(table, refRow, where = 'below') {
  const doc = table.ownerDocument;
  const m = buildMatrix(table);
  const { rows, cols } = matrixDimensions(m);
  if (rows === 0) return;
  const at = where === 'above' ? refRow : refRow + 1;

  const tr = doc.createElement('tr');
  for (let c = 0; c < cols; c++) {
    // If a cell from a row above spans DOWN across the insertion line (its
    // origin row < at and it extends to/through `at`), grow its rowspan instead
    // of placing a new cell in this column.
    if (at > 0 && at < rows) {
      const above = cellAt(m, at - 1, c);
      const here  = cellAt(m, at, c);
      if (above && above === here) { // same cell occupies both → it spans across
        setSpan(above, 'rowspan', rowSpan(above) + 1);
        c += colSpan(above) - 1;
        continue;
      }
    }
    tr.appendChild(newCell(doc, 'td'));
    // Skip the rest of a colspan we don't own by advancing (cells added are 1-wide).
  }

  const domRows = tableRows(table);
  if (at >= domRows.length) {
    // append to the last section
    const section = domRows.length ? domRows[domRows.length - 1].parentNode
                                   : table.querySelector('tbody') || table;
    section.appendChild(tr);
  } else {
    const refTr = domRows[at];
    refTr.parentNode.insertBefore(tr, refTr);
  }
}

/**
 * Insert a column relative to logical column `refCol`.
 * `where` is 'left' | 'right'. A cell whose colspan crosses the insertion line
 * grows its colspan; otherwise a new cell is added in each row at the position.
 */
export function insertColumn(table, refCol, where = 'right') {
  const doc = table.ownerDocument;
  const m = buildMatrix(table);
  const { rows } = matrixDimensions(m);
  const at = where === 'left' ? refCol : refCol + 1;

  for (let r = 0; r < rows; r++) {
    const before = at > 0 ? cellAt(m, r, at - 1) : null;
    const here   = cellAt(m, r, at);
    // Cell straddles the insertion line (occupies both at-1 and at) → grow its
    // colspan once, at its origin row, and add no new cell in any covered row.
    if (before && before === here) {
      if (cellCoords(m, before).row === r) setSpan(before, 'colspan', colSpan(before) + 1);
      continue;
    }
    const rowEl = tableRows(table)[r];
    if (!rowEl) continue;
    const cell = newCell(doc, here && here.tagName.toLowerCase() === 'th' ? 'th' : 'td');
    // Find the DOM insertion point. `here` is the cell at logical (r, at). When
    // `here` originates in THIS row its DOM node is a valid ref. When it is a
    // rowspan PASS-THROUGH from a row above, its DOM node lives in that other
    // row — inserting before it would throw/misplace (BUG-5: this row was
    // instead skipped, leaving the row one cell short and the matrix ragged).
    // In that case insert before this row's first own cell whose origin column
    // is >= at, else append.
    let domRef = (here && cellCoords(m, here).row === r) ? here : null;
    if (here && cellCoords(m, here).row !== r) {
      for (const own of Array.from(rowEl.cells)) {
        const oc = cellCoords(m, own);
        if (oc && oc.col >= at) { domRef = own; break; }
      }
    }
    rowEl.insertBefore(cell, domRef);
  }
  addColToColgroup(table, at);
}

/** Delete the row at logical index `refRow`, fixing rowspans that cross it. */
export function deleteRow(table, refRow) {
  const m = buildMatrix(table);
  const { rows, cols } = matrixDimensions(m);
  if (rows <= 1) return; // deleting the last row → caller should delete the table
  if (refRow < 0 || refRow >= rows) return;

  const moved = new Set();
  for (let c = 0; c < cols; c++) {
    const cell = cellAt(m, refRow, c);
    if (!cell) continue;
    const origin = cellCoords(m, cell);
    const rs = rowSpan(cell);
    if (rs > 1) {
      if (origin.row === refRow && !moved.has(cell)) {
        // Origin is on the deleted row: move the cell into the next row, shrink span.
        moved.add(cell);
        const nextTr = tableRows(table)[refRow + 1];
        if (nextTr) {
          // Compute the insertion reference from the ORIGINAL matrix `m` (stable
          // for the whole pass) — a rebuilt matrix would shift columns as cells
          // are removed, landing later moves in the wrong place. The reference is
          // the first real child of the next row at a logical column past this
          // cell's span; moving in column order then preserves ordering.
          const ref = _insertRefInRow(m, nextTr, refRow + 1, origin.col + colSpan(cell));
          setSpan(cell, 'rowspan', rs - 1);
          nextTr.insertBefore(cell, ref);
        }
      } else if (origin.row < refRow && !moved.has(cell)) {
        moved.add(cell);
        setSpan(cell, 'rowspan', rs - 1); // span passes through → just shrink
      }
    }
  }
  const tr = tableRows(table)[refRow];
  if (tr && tr.parentNode) tr.parentNode.removeChild(tr);
}

/** Delete the column at logical index `refCol`, fixing colspans that cross it. */
export function deleteColumn(table, refCol) {
  const m = buildMatrix(table);
  const { rows, cols } = matrixDimensions(m);
  if (cols <= 1) return; // last column → caller should delete the table
  if (refCol < 0 || refCol >= cols) return;

  const handled = new Set();
  for (let r = 0; r < rows; r++) {
    const cell = cellAt(m, r, refCol);
    if (!cell || handled.has(cell)) continue;
    handled.add(cell);
    const cs = colSpan(cell);
    if (cs > 1) {
      setSpan(cell, 'colspan', cs - 1); // shrink cells that span the column
    } else if (cell.parentNode) {
      cell.parentNode.removeChild(cell); // 1-wide cell → remove it
    }
  }
  removeColFromColgroup(table, refCol);
}

/** Remove the whole table from the DOM. */
export function deleteTable(table) {
  if (table && table.parentNode) table.parentNode.removeChild(table);
}

// Using the ORIGINAL matrix `m` (built once, before any mutation), find the DOM
// cell in `row` (logical row index `rowIndex`) to insertBefore so a moved cell
// lands in logical order. Scans from `fromCol` rightward for the first cell that
// is a genuine child of `row` (skipping pass-through rowspan cells from above,
// which are not children of this row). Returns null → append at end.
//
// The old lookup used cellAt() at exactly the moving cell's column, which
// returned the pass-through rowspan cell (not a child of the row) → null →
// wrongly appended at the end. Scanning past the span from the stable matrix
// fixes both the wrong-column and the multi-move-ordering cases.
function _insertRefInRow(m, row, rowIndex, fromCol) {
  const width = matrixDimensions(m).cols;
  for (let c = fromCol; c < width; c++) {
    const occ = cellAt(m, rowIndex, c);
    if (occ && occ.parentNode === row) return occ;
  }
  return null;
}
