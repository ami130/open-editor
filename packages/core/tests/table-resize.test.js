/**
 * table-resize.test.js — Phase 11.8 column resize (pure width math + manager).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestEditor } from '../src/testing/test-harness.js';
import { resizeColumn, TableResizeManager } from '../src/plugins/table/table-resize.js';
import { createTable } from '../src/plugins/table/table-dom.js';

function colPcts(table) {
  return Array.from(table.querySelectorAll('colgroup col'))
    .map((c) => parseFloat((c.style.width || '').replace('%', '')));
}

describe('resizeColumn (pure width math)', () => {
  it('shifts width from the right neighbour to column i, preserving the pair total', () => {
    const t = createTable(document, 1, 2); // two cols at 50% each
    resizeColumn(t, 0, 100, 400); // +100px of a 400px table = +25%
    const [a, b] = colPcts(t);
    expect(a).toBeCloseTo(75, 1);
    expect(b).toBeCloseTo(25, 1);
    expect(a + b).toBeCloseTo(100, 1); // total preserved
  });

  it('is a no-op on the last column (no right neighbour)', () => {
    const t = createTable(document, 1, 2);
    const before = colPcts(t);
    resizeColumn(t, 1, 50, 400); // col index 1 is the last
    expect(colPcts(t)).toEqual(before);
  });

  it('clamps: refuses to shrink a column below the minimum', () => {
    const t = createTable(document, 1, 2); // 50/50
    const before = colPcts(t);
    resizeColumn(t, 0, -400, 400); // would drive col 0 negative
    expect(colPcts(t)).toEqual(before); // unchanged
  });

  it('only the two adjacent columns change (3-col table)', () => {
    const t = createTable(document, 1, 3); // ~33.33 each
    resizeColumn(t, 0, 33.33, 100); // move ~33% from col1 to col0
    const p = colPcts(t);
    expect(p[2]).toBeCloseTo(33.3333, 1); // third column untouched
  });
});

describe('TableResizeManager lifecycle', () => {
  let editor, root, mgr;
  beforeEach(() => {
    editor = createTestEditor();
    root = editor.getEditorElement();
    mgr = new TableResizeManager();
    mgr.install(editor);
  });
  afterEach(() => {
    mgr.destroy();
    if (!editor.isDestroyed()) editor.destroy();
    if (editor._target && editor._target.parentNode) editor._target.remove();
  });

  it('installs + destroys without leaking (no throw on stray events)', () => {
    root.innerHTML = '';
    const t = createTable(document, 2, 2);
    root.appendChild(t);
    mgr.destroy();
    const cell = t.querySelector('td');
    expect(() => cell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))).not.toThrow();
  });

  it('a mousedown in the CENTER of a cell (not the border) does not start a drag', () => {
    root.innerHTML = '';
    const t = createTable(document, 1, 2);
    root.appendChild(t);
    const cell = t.querySelector('td');
    // Give the cell a realistic rect (jsdom's default is all-zero).
    cell.getBoundingClientRect = () => ({ left: 0, right: 100, top: 0, bottom: 20, width: 100, height: 20 });
    cell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 50 })); // centre
    expect(mgr._drag).toBeNull();
  });

  it('a mousedown ON the right border DOES start a column drag', () => {
    root.innerHTML = '';
    const t = createTable(document, 1, 2);
    root.appendChild(t);
    const cell = t.querySelector('td'); // first cell → has a right neighbour
    cell.getBoundingClientRect = () => ({ left: 0, right: 100, top: 0, bottom: 20, width: 100, height: 20 });
    t.getBoundingClientRect = () => ({ left: 0, right: 200, top: 0, bottom: 20, width: 200, height: 20 });
    cell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 98 })); // near right edge
    expect(mgr._drag).not.toBeNull();
    expect(mgr._drag.colIndex).toBe(0);
  });

  // Bug #4 — in a row with a colspan the DOM cell index diverges from the
  // logical column. Grabbing a colspan-2 cell's right border must target the
  // LAST logical column it spans (col 1), not its DOM index (0).
  it('uses the logical column of a colspan cell, not its DOM index', () => {
    root.innerHTML = '';
    // Row 0: one cell spanning 2 cols. Row 1: two 1-wide cells. 3-col colgroup
    // would be wrong; createTable(1,3) then merge is heavy — build directly.
    const t = createTable(document, 2, 3); // 3 cols, colgroup has 3 <col>
    root.appendChild(t);
    const firstRow = t.rows[0];
    // Merge the first two cells of row 0 into one colspan-2 cell.
    firstRow.deleteCell(1);
    firstRow.cells[0].setAttribute('colspan', '2');
    const spanCell = firstRow.cells[0];
    spanCell.getBoundingClientRect = () => ({ left: 0, right: 200, top: 0, bottom: 20, width: 200, height: 20 });
    t.getBoundingClientRect = () => ({ left: 0, right: 300, top: 0, bottom: 20, width: 300, height: 20 });
    spanCell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 198 })); // near its right border
    expect(mgr._drag).not.toBeNull();
    expect(mgr._drag.colIndex).toBe(1); // logical col 1 (last spanned), not DOM index 0
  });
});
