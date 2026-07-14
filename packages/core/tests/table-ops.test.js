/**
 * table-ops.test.js — row/column operations, verified via the formal matrix.
 * Tests plain grids AND the hard colspan/rowspan-crossing cases.
 */
import { describe, it, expect } from 'vitest';
import {
  insertRow, insertColumn, deleteRow, deleteColumn, deleteTable,
} from '../src/plugins/table/table-ops.js';
import { buildMatrix, matrixDimensions, cellAt } from '../src/plugins/table/table-matrix.js';

function makeTable(rows) {
  const table = document.createElement('table');
  const cg = document.createElement('colgroup');
  const nCols = Math.max(...rows.map((r) => r.reduce((n, s) => n + (typeof s === 'object' ? (s.cs || 1) : 1), 0)));
  for (let i = 0; i < nCols; i++) cg.appendChild(document.createElement('col'));
  table.appendChild(cg);
  const tb = document.createElement('tbody');
  for (const row of rows) {
    const tr = document.createElement('tr');
    for (const spec of row) {
      const td = document.createElement('td');
      if (typeof spec === 'string') td.textContent = spec;
      else { td.textContent = spec.t || ''; if (spec.cs) td.setAttribute('colspan', String(spec.cs)); if (spec.rs) td.setAttribute('rowspan', String(spec.rs)); }
      tr.appendChild(td);
    }
    tb.appendChild(tr);
  }
  table.appendChild(tb);
  document.body.appendChild(table);
  return table;
}
const dims = (t) => matrixDimensions(buildMatrix(t));

describe('insertRow — plain', () => {
  it('adds a row below with the right cell count', () => {
    const t = makeTable([['a', 'b'], ['c', 'd']]);
    insertRow(t, 0, 'below');
    expect(dims(t)).toEqual({ rows: 3, cols: 2 });
    expect(t.querySelectorAll('tbody tr')[1].querySelectorAll('td').length).toBe(2);
  });
  it('adds a row above the first row', () => {
    const t = makeTable([['a', 'b']]);
    insertRow(t, 0, 'above');
    expect(dims(t)).toEqual({ rows: 2, cols: 2 });
  });
});

describe('insertRow — rowspan crossing', () => {
  it('growing rowspan when a cell spans across the insertion line', () => {
    // A spans rows 0-1; insert a row "below" row 0 falls INSIDE A's span → grow.
    const t = makeTable([[{ t: 'A', rs: 2 }, 'b'], ['c']]);
    insertRow(t, 0, 'below');
    const m = buildMatrix(t);
    const a = cellAt(m, 0, 0);
    expect(a.getAttribute('rowspan')).toBe('3'); // grew 2 → 3
    expect(dims(t)).toEqual({ rows: 3, cols: 2 });
  });
});

describe('insertColumn — plain', () => {
  it('adds a column to the right in every row + colgroup', () => {
    const t = makeTable([['a', 'b'], ['c', 'd']]);
    insertColumn(t, 1, 'right');
    expect(dims(t)).toEqual({ rows: 2, cols: 3 });
    expect(t.querySelectorAll('colgroup col').length).toBe(3);
  });
  it('adds a column to the left of the first column', () => {
    const t = makeTable([['a'], ['b']]);
    insertColumn(t, 0, 'left');
    expect(dims(t)).toEqual({ rows: 2, cols: 2 });
  });
});

describe('insertColumn — colspan crossing', () => {
  it('grows colspan when a cell spans across the insertion line', () => {
    // Row0 has a colspan=2 cell; row1 has two cells. Insert a column "right" of
    // col 0 lands inside the wide cell → grow its colspan.
    const t = makeTable([[{ t: 'W', cs: 2 }], ['a', 'b']]);
    insertColumn(t, 0, 'right');
    const m = buildMatrix(t);
    const w = cellAt(m, 0, 0);
    expect(w.getAttribute('colspan')).toBe('3');
    expect(dims(t)).toEqual({ rows: 2, cols: 3 });
  });
});

describe('insertColumn — rowspan crossing (BUG-5: no ragged rows)', () => {
  // Every logical position must be filled after the insert (rectangular matrix).
  function assertRectangular(t) {
    const m = buildMatrix(t);
    const { rows, cols } = matrixDimensions(m);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        expect(cellAt(m, r, c), `position (${r},${c}) empty`).not.toBeNull();
      }
    }
    return { rows, cols };
  }

  it('inserting LEFT of a rowspan column adds a cell to EVERY spanned row', () => {
    // A spans rows 0-1 at col 0; B at (0,1); C at (1,1). Insert col at 0 (left).
    const t = makeTable([[{ t: 'A', rs: 2 }, 'B'], ['C']]);
    insertColumn(t, 0, 'left');
    // Before the fix row 1 stayed at 1 DOM cell → matrix was ragged (2 vs 3).
    expect(t.rows[0].cells.length).toBe(3); // new, A, B
    expect(t.rows[1].cells.length).toBe(2); // new, C  (A is a passthrough)
    expect(assertRectangular(t)).toEqual({ rows: 2, cols: 3 });
  });

  it('inserting RIGHT of a rowspan column stays rectangular', () => {
    const t = makeTable([[{ t: 'A', rs: 2 }, 'B'], ['C']]);
    insertColumn(t, 0, 'right');
    expect(assertRectangular(t)).toEqual({ rows: 2, cols: 3 });
  });
});

describe('deleteRow', () => {
  it('removes a plain row', () => {
    const t = makeTable([['a', 'b'], ['c', 'd'], ['e', 'f']]);
    deleteRow(t, 1);
    expect(dims(t)).toEqual({ rows: 2, cols: 2 });
    expect(t.textContent).not.toContain('c');
  });
  it('shrinks a rowspan that passes through the deleted row', () => {
    const t = makeTable([[{ t: 'A', rs: 3 }, 'b'], ['c'], ['d']]);
    deleteRow(t, 1); // middle row, A spans through it
    const m = buildMatrix(t);
    expect(cellAt(m, 0, 0).getAttribute('rowspan')).toBe('2');
    expect(dims(t)).toEqual({ rows: 2, cols: 2 });
  });
  it('refuses to delete the only row', () => {
    const t = makeTable([['a', 'b']]);
    deleteRow(t, 0);
    expect(dims(t)).toEqual({ rows: 1, cols: 2 }); // unchanged
  });

  // Bug #2 — a rowspan cell whose ORIGIN is on the deleted row must relocate
  // into the next row at its own column, not be appended at the row's end.
  const rowText = (t) => Array.from(t.rows).map((r) => Array.from(r.cells).map((c) => c.textContent));
  it('moves a rowspan-origin cell into its correct column (single span)', () => {
    // [a][B rs2][c] / [d][e]  — delete row 0 → B lands between d and e.
    const t = makeTable([['a', { t: 'B', rs: 2 }, 'c'], ['d', 'e']]);
    deleteRow(t, 0);
    expect(rowText(t)).toEqual([['d', 'B', 'e']]);
    expect(dims(t)).toEqual({ rows: 1, cols: 3 });
  });
  it('moves multiple rowspan-origin cells preserving their order', () => {
    // [A rs2][B rs2][c] / [d]  — delete row 0 → A, B keep order before d.
    const t = makeTable([[{ t: 'A', rs: 2 }, { t: 'B', rs: 2 }, 'c'], ['d']]);
    deleteRow(t, 0);
    expect(rowText(t)).toEqual([['A', 'B', 'd']]);
    expect(dims(t)).toEqual({ rows: 1, cols: 3 });
  });
});

describe('deleteColumn', () => {
  it('removes a plain column + colgroup entry', () => {
    const t = makeTable([['a', 'b', 'c'], ['d', 'e', 'f']]);
    deleteColumn(t, 1);
    expect(dims(t)).toEqual({ rows: 2, cols: 2 });
    expect(t.querySelectorAll('colgroup col').length).toBe(2);
    expect(t.textContent).not.toContain('b');
  });
  it('shrinks a colspan that spans the deleted column', () => {
    const t = makeTable([[{ t: 'W', cs: 2 }, 'x'], ['a', 'b', 'c']]);
    deleteColumn(t, 0);
    const m = buildMatrix(t);
    // span 2 → 1: the attribute is REMOVED (a span of 1 is not an explicit attr).
    expect(cellAt(m, 0, 0).getAttribute('colspan')).toBeNull();
    expect(cellAt(m, 0, 0).textContent).toBe('W'); // cell survives
    expect(dims(t)).toEqual({ rows: 2, cols: 2 });
  });
  it('refuses to delete the only column', () => {
    const t = makeTable([['a'], ['b']]);
    deleteColumn(t, 0);
    expect(dims(t)).toEqual({ rows: 2, cols: 1 });
  });
});

describe('deleteTable', () => {
  it('removes the table from the DOM', () => {
    const t = makeTable([['a']]);
    deleteTable(t);
    expect(t.parentNode).toBeNull();
  });
});
