/**
 * Table span-integrity suite. Exercises insertRow/insertColumn/deleteRow/
 * deleteColumn/merge/split against tables that carry colspan/rowspan "tails"
 * (spans originating in a non-adjacent row/col), asserting the matrix stays
 * rectangular AND — critically — that no cell keeps a rowspan/colspan pointing
 * at rows/columns that no longer physically exist.
 *
 * (Promoted from a former "audit scratch" file: assertions strengthened, debug
 * logging removed. C4 now asserts the rowspan-vs-physical-rows invariant that a
 * full-block merge previously violated.)
 */
import { describe, it, expect } from 'vitest';
import {
  insertRow, insertColumn, deleteRow, deleteColumn,
} from '../src/plugins/table/table-ops.js';
import { mergeCells, splitHorizontal } from '../src/plugins/table/table-merge.js';
import { toggleHeaderRow } from '../src/plugins/table/table-format.js';
import { buildMatrix, matrixDimensions, cellAt } from '../src/plugins/table/table-matrix.js';

function makeTable(rows, withColgroup = true) {
  const table = document.createElement('table');
  if (withColgroup) {
    const cg = document.createElement('colgroup');
    const nCols = Math.max(...rows.map((r) => r.reduce((n, s) => n + (typeof s === 'object' ? (s.cs || 1) : 1), 0)));
    for (let i = 0; i < nCols; i++) cg.appendChild(document.createElement('col'));
    table.appendChild(cg);
  }
  const tb = document.createElement('tbody');
  for (const row of rows) {
    const tr = document.createElement('tr');
    for (const spec of row) {
      const td = document.createElement(spec && spec.th ? 'th' : 'td');
      if (typeof spec === 'string') td.textContent = spec;
      else if (spec != null) { td.textContent = spec.t || ''; if (spec.cs) td.setAttribute('colspan', String(spec.cs)); if (spec.rs) td.setAttribute('rowspan', String(spec.rs)); }
      tr.appendChild(td);
    }
    tb.appendChild(tr);
  }
  table.appendChild(tb);
  document.body.appendChild(table);
  return table;
}
const dims = (t) => matrixDimensions(buildMatrix(t));
function isRect(t) {
  const m = buildMatrix(t);
  const { rows, cols } = matrixDimensions(m);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (cellAt(m, r, c) == null) return false;
  return true;
}
// No cell may declare a rowspan/colspan larger than the table physically holds.
function spansWithinBounds(t) {
  const physicalRows = t.rows.length;
  for (const row of Array.from(t.rows)) {
    const rowIndex = row.rowIndex;
    for (const cell of Array.from(row.cells)) {
      const rs = parseInt(cell.getAttribute('rowspan') || '1', 10);
      if (rowIndex + rs > physicalRows) return false; // spans past the last row
    }
  }
  return true;
}

describe('table span integrity', () => {
  it('C1: insertRow below a row with a colspan cell keeps the grid rectangular', () => {
    const t = makeTable([[{ t: 'W', cs: 2 }, 'x'], ['a', 'b', 'c']]);
    insertRow(t, 0, 'below');
    expect(dims(t).cols).toBe(3);
    expect(isRect(t)).toBe(true);
  });

  it('C2: insertRow below a full-width colspan row stays rectangular', () => {
    const t = makeTable([['a', 'b', 'c'], [{ t: 'W', cs: 3 }], ['d', 'e', 'f']]);
    insertRow(t, 1, 'below');
    expect(isRect(t)).toBe(true);
  });

  it('C3: insertRow inside a 3-row rowspan grows the span and stays rectangular', () => {
    const t = makeTable([[{ t: 'A', rs: 3 }, 'b'], ['c'], ['d']]);
    insertRow(t, 0, 'below');
    expect(isRect(t)).toBe(true);
    expect(spansWithinBounds(t)).toBe(true);
  });

  it('C4: merging an entire block does NOT leave a rowspan pointing at removed rows', () => {
    const t = makeTable([['a', 'b', 'c'], ['d', 'e', 'f']]);
    const m = buildMatrix(t);
    const surv = mergeCells(t, [
      cellAt(m, 0, 0), cellAt(m, 0, 1), cellAt(m, 0, 2),
      cellAt(m, 1, 0), cellAt(m, 1, 1), cellAt(m, 1, 2),
    ]);
    // Both rows collapse into one → survivor spans 3 cols, exactly 1 row.
    expect(t.rows.length).toBe(1);
    expect(surv.getAttribute('colspan')).toBe('3');
    expect(surv.getAttribute('rowspan')).toBeNull(); // NOT rowspan="2" over a 1-row table
    expect(isRect(t)).toBe(true);
    expect(spansWithinBounds(t)).toBe(true);
  });

  it('C4b: a PARTIAL block merge that leaves rows intact keeps its rowspan', () => {
    const t = makeTable([['a', 'b', 'c'], ['d', 'e', 'f']]);
    const m = buildMatrix(t);
    // Merge cols 0-1 across both rows; col 2 (c, f) survives, both rows remain.
    mergeCells(t, [cellAt(m, 0, 0), cellAt(m, 0, 1), cellAt(m, 1, 0), cellAt(m, 1, 1)]);
    expect(t.rows.length).toBe(2);
    const surv = t.querySelector('td[rowspan]');
    expect(surv.getAttribute('rowspan')).toBe('2');
    expect(surv.getAttribute('colspan')).toBe('2');
    expect(isRect(t)).toBe(true);
    expect(spansWithinBounds(t)).toBe(true);
  });

  it('C5: header toggle preserves cell attributes via retag', () => {
    const t = makeTable([['a', 'b']]);
    t.rows[0].cells[0].setAttribute('data-x', '1');
    toggleHeaderRow(t);
    expect(t.rows[0].cells[0].tagName).toBe('TH');
    expect(t.rows[0].cells[0].getAttribute('data-x')).toBe('1');
  });

  it('C6: deleteColumn occupied only by rowspan tails stays rectangular', () => {
    const t = makeTable([[{ t: 'A', rs: 2 }, 'b'], ['c']]);
    deleteColumn(t, 0);
    expect(isRect(t)).toBe(true);
    expect(spansWithinBounds(t)).toBe(true);
  });

  it('C7: deleteRow where a rowspan ENDS shrinks the span cleanly', () => {
    const t = makeTable([[{ t: 'A', rs: 2 }, 'b'], ['c']]);
    deleteRow(t, 1);
    expect(isRect(t)).toBe(true);
    expect(spansWithinBounds(t)).toBe(true);
  });

  it('C8: insertColumn right of the last col with rowspan tails stays rectangular', () => {
    const t = makeTable([['a', { t: 'B', rs: 2 }], ['c']]);
    insertColumn(t, 1, 'right');
    expect(isRect(t)).toBe(true);
    expect(dims(t).cols).toBe(3);
    expect(spansWithinBounds(t)).toBe(true);
  });

  it('C9: vertical merge then horizontal split round-trips to a rectangular grid', () => {
    const t = makeTable([['a', 'b'], ['c', 'd']]);
    let m = buildMatrix(t);
    mergeCells(t, [cellAt(m, 0, 0), cellAt(m, 1, 0)]); // col0 rowspan 2
    m = buildMatrix(t);
    splitHorizontal(t, cellAt(m, 0, 0));               // rowspan 2 → shrink
    expect(isRect(t)).toBe(true);
    expect(spansWithinBounds(t)).toBe(true);
  });
});
