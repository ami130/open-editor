/**
 * table-matrix.test.js — exhaustive tests for the formal-matrix model (11.0).
 * The matrix is the bedrock of every table op, so it is tested hard:
 * plain grids, colspan, rowspan, combined spans, ragged rows, coords, bounds,
 * ranges, and the rectangular-selection check.
 */
import { describe, it, expect } from 'vitest';
import {
  buildMatrix, matrixDimensions, cellCoords, cellAt,
  selectionBounds, cellsInRange, rangeIsRectangular, colSpan, rowSpan,
} from '../src/plugins/table/table-matrix.js';

// Build a <table> from a compact spec. Each row is an array of cell specs:
//   'x'                     → a plain <td> with text 'x'
//   { t:'x', cs:2, rs:1 }   → <td> with colspan/rowspan
function makeTable(rows) {
  const table = document.createElement('table');
  const tbody = document.createElement('tbody');
  for (const row of rows) {
    const tr = document.createElement('tr');
    for (const spec of row) {
      const td = document.createElement('td');
      if (typeof spec === 'string') { td.textContent = spec; }
      else {
        td.textContent = spec.t || '';
        if (spec.cs) td.setAttribute('colspan', String(spec.cs));
        if (spec.rs) td.setAttribute('rowspan', String(spec.rs));
      }
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  document.body.appendChild(table);
  return table;
}
function textAt(m, r, c) { const cell = cellAt(m, r, c); return cell ? cell.textContent : null; }

describe('colSpan / rowSpan readers', () => {
  it('default to 1 and parse valid spans, ignore garbage', () => {
    const td = document.createElement('td');
    expect(colSpan(td)).toBe(1);
    td.setAttribute('colspan', '3'); expect(colSpan(td)).toBe(3);
    td.setAttribute('rowspan', '0'); expect(rowSpan(td)).toBe(1); // 0 → 1
    td.setAttribute('colspan', 'x'); expect(colSpan(td)).toBe(1); // NaN → 1
  });
});

describe('buildMatrix — plain grid', () => {
  it('2x3 grid maps every position', () => {
    const t = makeTable([['a', 'b', 'c'], ['d', 'e', 'f']]);
    const m = buildMatrix(t);
    expect(matrixDimensions(m)).toEqual({ rows: 2, cols: 3 });
    expect(textAt(m, 0, 0)).toBe('a');
    expect(textAt(m, 0, 2)).toBe('c');
    expect(textAt(m, 1, 1)).toBe('e');
  });
});

describe('buildMatrix — colspan', () => {
  it('a colspan=2 cell fills two logical columns', () => {
    const t = makeTable([[{ t: 'A', cs: 2 }, 'B'], ['c', 'd', 'e']]);
    const m = buildMatrix(t);
    expect(matrixDimensions(m)).toEqual({ rows: 2, cols: 3 });
    expect(textAt(m, 0, 0)).toBe('A');
    expect(textAt(m, 0, 1)).toBe('A'); // repeated
    expect(textAt(m, 0, 2)).toBe('B');
    expect(cellAt(m, 0, 0)).toBe(cellAt(m, 0, 1)); // same element instance
  });
});

describe('buildMatrix — rowspan', () => {
  it('a rowspan=2 cell fills two logical rows and shifts the next row', () => {
    const t = makeTable([[{ t: 'A', rs: 2 }, 'B'], ['c']]);
    const m = buildMatrix(t);
    expect(matrixDimensions(m)).toEqual({ rows: 2, cols: 2 });
    expect(textAt(m, 0, 0)).toBe('A');
    expect(textAt(m, 1, 0)).toBe('A'); // repeated into row 1, col 0
    expect(textAt(m, 0, 1)).toBe('B');
    expect(textAt(m, 1, 1)).toBe('c'); // 'c' lands at col 1, not col 0
  });
});

describe('buildMatrix — combined colspan + rowspan', () => {
  it('a 2x2 spanning cell covers all four positions', () => {
    const t = makeTable([[{ t: 'BIG', cs: 2, rs: 2 }, 'x'], ['y'], ['a', 'b', 'c']]);
    const m = buildMatrix(t);
    expect(cellAt(m, 0, 0)).toBe(cellAt(m, 1, 1)); // all four are the same cell
    expect(textAt(m, 0, 0)).toBe('BIG');
    expect(textAt(m, 1, 0)).toBe('BIG');
    expect(textAt(m, 0, 2)).toBe('x');
    expect(textAt(m, 1, 2)).toBe('y');
    expect(textAt(m, 2, 0)).toBe('a');
  });
});

describe('cellCoords', () => {
  it('returns the ORIGIN of a spanned cell', () => {
    const t = makeTable([[{ t: 'A', cs: 2, rs: 2 }, 'x'], ['y']]);
    const m = buildMatrix(t);
    const big = cellAt(m, 1, 1);
    expect(cellCoords(m, big)).toEqual({ row: 0, col: 0 });
  });
  it('returns null for a cell not in the table', () => {
    const t = makeTable([['a']]);
    const m = buildMatrix(t);
    expect(cellCoords(m, document.createElement('td'))).toBeNull();
  });
});

describe('selectionBounds', () => {
  it('expands to include full spans of selected cells', () => {
    const t = makeTable([[{ t: 'A', rs: 2 }, 'b'], ['c']]);
    const m = buildMatrix(t);
    const a = cellAt(m, 0, 0);
    const bounds = selectionBounds(m, [a]);
    expect(bounds).toEqual({ minR: 0, maxR: 1, minC: 0, maxC: 0 });
  });
  it('returns null for empty selection', () => {
    const t = makeTable([['a']]);
    expect(selectionBounds(buildMatrix(t), [])).toBeNull();
  });
});

describe('cellsInRange + rangeIsRectangular', () => {
  it('collects distinct cells in a rectangle, row-major', () => {
    const t = makeTable([['a', 'b', 'c'], ['d', 'e', 'f']]);
    const m = buildMatrix(t);
    const cells = cellsInRange(m, 0, 0, 1, 1); // a,b,d,e
    expect(cells.map((c) => c.textContent)).toEqual(['a', 'b', 'd', 'e']);
  });
  it('rectangular check passes for a clean block, fails when a span crosses the edge', () => {
    const t = makeTable([['a', 'b'], [{ t: 'wide', cs: 2 }]]);
    const m = buildMatrix(t);
    // Select a,b (row 0) → fully rectangular.
    const bounds1 = selectionBounds(m, [cellAt(m, 0, 0), cellAt(m, 0, 1)]);
    expect(rangeIsRectangular(m, [cellAt(m, 0, 0), cellAt(m, 0, 1)], bounds1)).toBe(true);
    // Select just 'a' → its bounds is a single cell → rectangular.
    const bounds2 = selectionBounds(m, [cellAt(m, 0, 0)]);
    expect(rangeIsRectangular(m, [cellAt(m, 0, 0)], bounds2)).toBe(true);
  });
});
