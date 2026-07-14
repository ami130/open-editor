/**
 * table-merge.test.js — merge + split cell ops (11.13). The hardest span logic,
 * so verified hard: after every op the matrix must remain a valid rectangle.
 */
import { describe, it, expect } from 'vitest';
import { mergeCells, splitVertical, splitHorizontal } from '../src/plugins/table/table-merge.js';
import {
  buildMatrix, matrixDimensions, cellAt,
} from '../src/plugins/table/table-matrix.js';

function makeTable(rows) {
  const t = document.createElement('table');
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
  t.appendChild(tb);
  document.body.appendChild(t);
  return t;
}
const dims = (t) => matrixDimensions(buildMatrix(t));

// Assert the matrix has no undefined holes (a valid rectangular grid).
function assertRectangular(t) {
  const m = buildMatrix(t);
  const { rows, cols } = matrixDimensions(m);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      expect(cellAt(m, r, c), `hole at (${r},${c})`).not.toBeNull();
    }
  }
}

describe('mergeCells', () => {
  it('merges a horizontal pair into one cell (colspan 2)', () => {
    const t = makeTable([['a', 'b'], ['c', 'd']]);
    const m = buildMatrix(t);
    const survivor = mergeCells(t, [cellAt(m, 0, 0), cellAt(m, 0, 1)]);
    expect(survivor.getAttribute('colspan')).toBe('2');
    expect(survivor.innerHTML).toContain('a');
    expect(survivor.innerHTML).toContain('b');
    assertRectangular(t);
  });

  it('merges a vertical pair into one cell (rowspan 2)', () => {
    const t = makeTable([['a', 'b'], ['c', 'd']]);
    const m = buildMatrix(t);
    const survivor = mergeCells(t, [cellAt(m, 0, 0), cellAt(m, 1, 0)]);
    expect(survivor.getAttribute('rowspan')).toBe('2');
    assertRectangular(t);
  });

  it('merges a 2x2 block into one cell spanning both dims', () => {
    const t = makeTable([['a', 'b', 'x'], ['c', 'd', 'y'], ['e', 'f', 'z']]);
    const m = buildMatrix(t);
    const survivor = mergeCells(t, [cellAt(m, 0, 0), cellAt(m, 0, 1), cellAt(m, 1, 0), cellAt(m, 1, 1)]);
    expect(survivor.getAttribute('colspan')).toBe('2');
    expect(survivor.getAttribute('rowspan')).toBe('2');
    // content of a,b,c,d combined
    for (const ch of ['a', 'b', 'c', 'd']) expect(survivor.textContent).toContain(ch);
    assertRectangular(t);
  });

  it('joins only NON-empty cells with <br>', () => {
    const t = makeTable([['a', ''], ['', '']]);
    const m = buildMatrix(t);
    const survivor = mergeCells(t, [cellAt(m, 0, 0), cellAt(m, 0, 1)]);
    expect(survivor.innerHTML).toBe('a'); // empty neighbour contributes nothing
  });

  it('refuses a ragged (non-rectangular) selection', () => {
    // A wide cell makes an L-shaped selection non-rectangular.
    const t = makeTable([[{ t: 'W', cs: 2 }], ['a', 'b']]);
    const m = buildMatrix(t);
    const before = t.innerHTML;
    const res = mergeCells(t, [cellAt(m, 0, 0), cellAt(m, 1, 0)]); // W + a: not a clean rect
    // (0,0)&(0,1) both = W, (1,0)=a → bounds 0..1 x 0..1 needs (1,1)=b too → not selected → refuse
    expect(res).toBeNull();
    expect(t.innerHTML).toBe(before); // unchanged
  });

  it('returns null for < 2 cells', () => {
    const t = makeTable([['a', 'b']]);
    const m = buildMatrix(t);
    expect(mergeCells(t, [cellAt(m, 0, 0)])).toBeNull();
  });
});

describe('splitVertical', () => {
  it('plain cell → grows neighbours, grid stays rectangular, +1 col', () => {
    const t = makeTable([['a', 'b'], ['c', 'd']]);
    const m = buildMatrix(t);
    splitVertical(t, cellAt(m, 0, 0)); // split 'a'
    expect(dims(t)).toEqual({ rows: 2, cols: 3 });
    assertRectangular(t);
  });
  it('cell with colspan>=2 → shrinks colspan and adds a sibling', () => {
    const t = makeTable([[{ t: 'W', cs: 2 }], ['a', 'b']]);
    const m = buildMatrix(t);
    splitVertical(t, cellAt(m, 0, 0));
    // W had colspan 2 → now 1, plus a new sibling → row still spans 2 cols
    expect(dims(t)).toEqual({ rows: 2, cols: 2 });
    assertRectangular(t);
  });

  // Bug #3 — a plain-cell split adds one logical column, so the <colgroup> must
  // gain a <col> too (otherwise widths render wrong and resize/delete indexing
  // desyncs). A colspan>=2 split does NOT change the column count → no new <col>.
  const colCount = (t) => t.querySelector('colgroup').querySelectorAll('col').length;
  it('plain cell split adds a matching <col> to the colgroup', () => {
    const t = makeTable([['a', 'b'], ['c', 'd']]);
    // give it a 2-col colgroup like createTable() does
    const cg = document.createElement('colgroup');
    cg.appendChild(document.createElement('col'));
    cg.appendChild(document.createElement('col'));
    t.insertBefore(cg, t.firstChild);
    const m = buildMatrix(t);
    splitVertical(t, cellAt(m, 0, 0));
    expect(dims(t).cols).toBe(3);
    expect(colCount(t)).toBe(3); // colgroup stays in sync with the grid
  });
  it('colspan>=2 split does not add a <col> (column count unchanged)', () => {
    const t = makeTable([[{ t: 'W', cs: 2 }], ['a', 'b']]);
    const cg = document.createElement('colgroup');
    cg.appendChild(document.createElement('col'));
    cg.appendChild(document.createElement('col'));
    t.insertBefore(cg, t.firstChild);
    const m = buildMatrix(t);
    splitVertical(t, cellAt(m, 0, 0));
    expect(dims(t).cols).toBe(2);
    expect(colCount(t)).toBe(2);
  });
});

describe('splitHorizontal', () => {
  it('plain cell → new row, neighbours grow rowspan, grid rectangular, +1 row', () => {
    const t = makeTable([['a', 'b'], ['c', 'd']]);
    const m = buildMatrix(t);
    splitHorizontal(t, cellAt(m, 0, 0)); // split 'a'
    expect(dims(t)).toEqual({ rows: 3, cols: 2 });
    assertRectangular(t);
  });
  it('cell with rowspan>=2 → shrinks rowspan, places cell in the row below', () => {
    const t = makeTable([[{ t: 'A', rs: 2 }, 'b'], ['c']]);
    const m = buildMatrix(t);
    splitHorizontal(t, cellAt(m, 0, 0));
    expect(dims(t)).toEqual({ rows: 2, cols: 2 });
    assertRectangular(t);
  });
});
