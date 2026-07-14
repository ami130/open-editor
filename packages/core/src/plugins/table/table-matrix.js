/**
 * table-matrix.js — the formal-matrix model for the Table plugin (11.0).
 *
 * A "formal matrix" is a normalized 2D grid built from a <table> that accounts
 * for colspan/rowspan: a cell that spans N columns / M rows appears in every one
 * of the N×M logical positions it covers. This is the single source of truth for
 * every structural operation (add/remove row-col, merge, split, bounds) so the
 * span bookkeeping is computed in one well-tested place rather than ad hoc.
 *
 * These functions are PURE reads of DOM structure — they never mutate the table.
 * DOM mutation lives in table-dom.js and is expressed in terms of this model.
 */

/** Read a positive integer span attribute (colspan/rowspan), defaulting to 1. */
function span(cell, attr) {
  const v = parseInt(cell.getAttribute(attr) || '1', 10);
  return Number.isFinite(v) && v > 0 ? v : 1;
}
export function colSpan(cell) { return span(cell, 'colspan'); }
export function rowSpan(cell) { return span(cell, 'rowspan'); }

/** All row elements (<tr>) of a table, in document order, across thead/tbody/tfoot. */
export function tableRows(table) {
  if (!table) return [];
  // rows is a live HTMLCollection spanning all sections in visual order.
  return Array.from(table.rows || []);
}

/**
 * Build the formal matrix for a table.
 * Returns a 2D array `m` where `m[r][c]` is the cell element occupying logical
 * position (row r, col c). Spanned cells are repeated across the cells they
 * cover. Ragged source rows are tolerated (missing positions are left undefined).
 */
export function buildMatrix(table) {
  const rows = tableRows(table);
  const m = [];
  for (let r = 0; r < rows.length; r++) if (!m[r]) m[r] = [];

  for (let r = 0; r < rows.length; r++) {
    const cells = Array.from(rows[r].cells || []);
    let c = 0;
    for (const cell of cells) {
      // Skip logical columns already filled by a rowspan from a row above.
      while (m[r][c] !== undefined) c++;
      const cs = colSpan(cell);
      const rs = rowSpan(cell);
      for (let dr = 0; dr < rs; dr++) {
        const rr = r + dr;
        if (!m[rr]) m[rr] = [];
        for (let dc = 0; dc < cs; dc++) m[rr][c + dc] = cell;
      }
      c += cs;
    }
  }
  return m;
}

/** Logical dimensions of a matrix: { rows, cols } (cols = widest row). */
export function matrixDimensions(m) {
  const rows = m.length;
  let cols = 0;
  for (const row of m) if (row && row.length > cols) cols = row.length;
  return { rows, cols };
}

/**
 * Find the ORIGIN (top-left) logical coordinate of a cell in the matrix.
 * Returns { row, col } or null if the cell is not present.
 */
export function cellCoords(m, cell) {
  for (let r = 0; r < m.length; r++) {
    const row = m[r] || [];
    for (let c = 0; c < row.length; c++) {
      if (row[c] === cell) return { row: r, col: c };
    }
  }
  return null;
}

/** The distinct cell at logical (r,c), or null if out of range / empty. */
export function cellAt(m, r, c) {
  return (m[r] && m[r][c] !== undefined) ? m[r][c] : null;
}

/**
 * Compute the bounding box of a set of cells, expanded so it fully contains
 * every span of every included cell (Jodit's getSelectedBound). Returns
 * { minR, maxR, minC, maxC } or null when the set is empty / not in the matrix.
 */
export function selectionBounds(m, cells) {
  const set = cells instanceof Set ? cells : new Set(cells);
  let minR = Infinity, maxR = -Infinity, minC = Infinity, maxC = -Infinity;
  let found = false;
  for (let r = 0; r < m.length; r++) {
    const row = m[r] || [];
    for (let c = 0; c < row.length; c++) {
      if (set.has(row[c])) {
        found = true;
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
        if (c < minC) minC = c;
        if (c > maxC) maxC = c;
      }
    }
  }
  return found ? { minR, maxR, minC, maxC } : null;
}

/**
 * Distinct cells whose ORIGIN falls within a rectangular logical range
 * (inclusive). Order is row-major by origin. Useful for "select the cells in
 * this drag rectangle" once the rectangle is known.
 */
export function cellsInRange(m, r0, c0, r1, c1) {
  const minR = Math.min(r0, r1), maxR = Math.max(r0, r1);
  const minC = Math.min(c0, c1), maxC = Math.max(c0, c1);
  const seen = new Set();
  const out = [];
  for (let r = minR; r <= maxR; r++) {
    const row = m[r] || [];
    for (let c = minC; c <= maxC; c++) {
      const cell = row[c];
      if (cell && !seen.has(cell)) { seen.add(cell); out.push(cell); }
    }
  }
  return out;
}

/** True when every logical position of `range` is covered by a cell in `cells`. */
export function rangeIsRectangular(m, cells, bounds) {
  const set = cells instanceof Set ? cells : new Set(cells);
  for (let r = bounds.minR; r <= bounds.maxR; r++) {
    for (let c = bounds.minC; c <= bounds.maxC; c++) {
      if (!set.has(cellAt(m, r, c))) return false;
    }
  }
  return true;
}
