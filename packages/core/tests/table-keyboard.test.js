/**
 * table-keyboard.test.js — Phase 11.B key-guard + Tab/Enter handling.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestEditor } from '../src/testing/test-harness.js';
import { handleTableKey } from '../src/plugins/table/table-keyboard.js';
import { createTable } from '../src/plugins/table/table-dom.js';
import { buildMatrix, matrixDimensions } from '../src/plugins/table/table-matrix.js';

let editor, root;
beforeEach(() => { editor = createTestEditor(); root = editor.getEditorElement(); });
afterEach(() => {
  if (!editor.isDestroyed()) editor.destroy();
  if (editor._target && editor._target.parentNode) editor._target.remove();
});

function seedTable(rows, cols) {
  root.innerHTML = '';
  const t = createTable(document, rows, cols);
  root.appendChild(t);
  return t;
}
function caretIn(cell, offset = 0) {
  const win = editor.selection.getWindow();
  const leaf = cell.firstChild || cell;
  const range = document.createRange();
  range.setStart(leaf, offset);
  range.collapse(true);
  const s = win.getSelection(); s.removeAllRanges(); s.addRange(range);
}
function currentCellOf() {
  const info = editor.selection.get();
  let n = info.startNode;
  while (n && n !== root) { if (n.tagName === 'TD' || n.tagName === 'TH') return n; n = n.parentNode; }
  return null;
}
function selectRange(startNode, sOff, endNode, eOff) {
  const win = editor.selection.getWindow();
  const r = document.createRange();
  r.setStart(startNode, sOff);
  r.setEnd(endNode, eOff);
  const s = win.getSelection(); s.removeAllRanges(); s.addRange(r);
}
const key = (k, opts = {}) => ({ key: k, shiftKey: !!opts.shift, preventDefault() {} });

describe('handleTableKey — not in a table', () => {
  it('returns false so normal handling runs', () => {
    root.innerHTML = '<p>hi</p>';
    caretIn(root.querySelector('p'), 0);
    expect(handleTableKey(editor, key('Tab'))).toBe(false);
    expect(handleTableKey(editor, key('Enter'))).toBe(false);
    expect(handleTableKey(editor, key('Backspace'))).toBe(false);
  });
});

describe('handleTableKey — Tab navigation', () => {
  it('Tab moves to the next cell', () => {
    const t = seedTable(2, 2);
    const cells = t.querySelectorAll('td');
    caretIn(cells[0], 0);
    expect(handleTableKey(editor, key('Tab'))).toBe(true);
    expect(currentCellOf()).toBe(cells[1]);
  });
  it('Shift+Tab moves to the previous cell', () => {
    const t = seedTable(2, 2);
    const cells = t.querySelectorAll('td');
    caretIn(cells[2], 0);
    expect(handleTableKey(editor, key('Tab', { shift: true }))).toBe(true);
    expect(currentCellOf()).toBe(cells[1]);
  });
  it('Tab at the very last cell appends a row and moves into it', () => {
    const t = seedTable(2, 2);
    const cells = t.querySelectorAll('td');
    caretIn(cells[cells.length - 1], 0);
    expect(handleTableKey(editor, key('Tab'))).toBe(true);
    expect(matrixDimensions(buildMatrix(t))).toEqual({ rows: 3, cols: 2 });
    // caret is now in the first cell of the new row
    const newCells = t.querySelectorAll('td');
    expect(currentCellOf()).toBe(newCells[4]);
  });
});

describe('handleTableKey — Enter inside a cell', () => {
  it('inserts a <br> in the cell and does NOT split the table', () => {
    const t = seedTable(1, 1);
    const cell = t.querySelector('td');
    cell.innerHTML = 'ab';
    caretIn(cell, 1); // between a and b
    expect(handleTableKey(editor, key('Enter'))).toBe(true);
    expect(cell.querySelector('br')).not.toBeNull();
    // table structure intact: still 1x1, still one table
    expect(root.querySelectorAll('table').length).toBe(1);
    expect(matrixDimensions(buildMatrix(t))).toEqual({ rows: 1, cols: 1 });
  });
});

describe('handleTableKey — Backspace/Delete guard', () => {
  it('Backspace at cell START is blocked (no cross-cell merge)', () => {
    const t = seedTable(1, 2);
    const cells = t.querySelectorAll('td');
    cells[1].innerHTML = 'x';
    caretIn(cells[1], 0); // at start of second cell
    expect(handleTableKey(editor, key('Backspace'))).toBe(true); // consumed → blocked
    expect(matrixDimensions(buildMatrix(t))).toEqual({ rows: 1, cols: 2 });
  });
  it('Backspace mid-cell falls through to normal editing', () => {
    const t = seedTable(1, 1);
    const cell = t.querySelector('td');
    cell.innerHTML = 'abc';
    caretIn(cell, 2); // mid-text
    expect(handleTableKey(editor, key('Backspace'))).toBe(false);
  });
  it('Delete at cell END is blocked', () => {
    const t = seedTable(1, 2);
    const cells = t.querySelectorAll('td');
    cells[0].innerHTML = 'x';
    caretIn(cells[0], 1); // end of first cell's text
    expect(handleTableKey(editor, key('Delete'))).toBe(true);
    expect(matrixDimensions(buildMatrix(t))).toEqual({ rows: 1, cols: 2 });
  });
});

describe('handleTableKey — cross-cell selection delete (structure guard)', () => {
  it('Backspace over a selection spanning two cells clears them, keeps the grid', () => {
    const t = seedTable(2, 2);
    const cells = t.querySelectorAll('td');
    cells[0].textContent = 'AAA'; cells[1].textContent = 'BBB';
    cells[2].textContent = 'CCC'; cells[3].textContent = 'DDD';
    // select from mid-AAA to mid-DDD (spans all four cells)
    selectRange(cells[0].firstChild, 1, cells[3].firstChild, 2);
    expect(handleTableKey(editor, key('Backspace'))).toBe(true);
    // structure preserved: still 2x2, still one table, four cells
    expect(root.querySelectorAll('table').length).toBe(1);
    expect(matrixDimensions(buildMatrix(t))).toEqual({ rows: 2, cols: 2 });
    expect(t.querySelectorAll('td').length).toBe(4);
    // every intersected cell was emptied to a <br> placeholder
    t.querySelectorAll('td').forEach((c) => expect(c.textContent).toBe(''));
  });

  it('Delete over a selection from an outside <p> into a cell keeps the table intact', () => {
    root.innerHTML = '';
    const p = document.createElement('p'); p.textContent = 'hello';
    root.appendChild(p);
    const t = createTable(document, 1, 2);
    const cells = t.querySelectorAll('td');
    cells[0].textContent = 'AAA'; cells[1].textContent = 'BBB';
    root.appendChild(t);
    selectRange(p.firstChild, 2, cells[0].firstChild, 3); // "llo" through first cell
    expect(handleTableKey(editor, key('Delete'))).toBe(true);
    // table still has its 2 cells and colgroup; not dissolved into the <p>
    expect(root.querySelectorAll('table').length).toBe(1);
    expect(t.querySelectorAll('td').length).toBe(2);
    expect(t.querySelector('colgroup').querySelectorAll('col').length).toBe(2);
  });

  it('a selection ENTIRELY within one cell falls through (browser handles it)', () => {
    const t = seedTable(1, 1);
    const cell = t.querySelector('td');
    cell.textContent = 'ABCDEF';
    selectRange(cell.firstChild, 1, cell.firstChild, 4);
    expect(handleTableKey(editor, key('Backspace'))).toBe(false);
  });

  // Defect #5 — an "engulfing" selection (<p>…</p><table/><p>…</p> selected
  // end-to-end) must NOT let handleMultiBlockDelete run, which would delete the
  // whole table via range.deleteContents(). The guard catches the in-between
  // table via intersectsNode and preserves it.
  it('a selection engulfing a whole table (outside p → outside p) preserves the table', () => {
    root.innerHTML = '';
    const p1 = document.createElement('p'); p1.textContent = 'before'; root.appendChild(p1);
    const t = createTable(document, 2, 2); root.appendChild(t);
    const p2 = document.createElement('p'); p2.textContent = 'after'; root.appendChild(p2);
    selectRange(p1.firstChild, 2, p2.firstChild, 3);
    expect(handleTableKey(editor, key('Backspace'))).toBe(true);
    expect(root.querySelectorAll('table').length).toBe(1);
    expect(t.querySelectorAll('td').length).toBe(4);
  });

  it('a selection engulfing TWO tables preserves both', () => {
    root.innerHTML = '';
    const p1 = document.createElement('p'); p1.textContent = 'p1'; root.appendChild(p1);
    const t1 = createTable(document, 1, 2); root.appendChild(t1);
    const pm = document.createElement('p'); pm.textContent = 'mid'; root.appendChild(pm);
    const t2 = createTable(document, 1, 2); root.appendChild(t2);
    const p3 = document.createElement('p'); p3.textContent = 'p3'; root.appendChild(p3);
    selectRange(p1.firstChild, 1, p3.firstChild, 1);
    expect(handleTableKey(editor, key('Delete'))).toBe(true);
    expect(root.querySelectorAll('table').length).toBe(2);
  });

  it('a multi-block selection with NO table still falls through to block-editing', () => {
    root.innerHTML = '<p>aaa</p><p>bbb</p>';
    const ps = root.querySelectorAll('p');
    selectRange(ps[0].firstChild, 1, ps[1].firstChild, 2);
    expect(handleTableKey(editor, key('Backspace'))).toBe(false);
  });

  it('does not touch a non-Backspace/Delete key on a cross-cell selection', () => {
    const t = seedTable(1, 2);
    const cells = t.querySelectorAll('td');
    cells[0].textContent = 'AA'; cells[1].textContent = 'BB';
    selectRange(cells[0].firstChild, 0, cells[1].firstChild, 2);
    // ArrowRight on a shift-less range: range-delete guard ignores it
    expect(handleTableKey(editor, key('ArrowRight'))).toBe(false);
  });
});

describe('handleTableKey — arrow navigation (11.5)', () => {
  it('ArrowDown moves to the cell directly below (same column)', () => {
    const t = seedTable(2, 2);
    const cells = t.querySelectorAll('td'); // [00,01,10,11]
    caretIn(cells[0], 0); // row0 col0
    expect(handleTableKey(editor, key('ArrowDown'))).toBe(true);
    expect(currentCellOf()).toBe(cells[2]); // row1 col0
  });
  it('ArrowUp moves to the cell directly above', () => {
    const t = seedTable(2, 2);
    const cells = t.querySelectorAll('td');
    caretIn(cells[3], 0); // row1 col1
    expect(handleTableKey(editor, key('ArrowUp'))).toBe(true);
    expect(currentCellOf()).toBe(cells[1]); // row0 col1
  });
  it('ArrowUp at the top row returns false (no cell above)', () => {
    const t = seedTable(2, 2);
    const cells = t.querySelectorAll('td');
    caretIn(cells[0], 0);
    expect(handleTableKey(editor, key('ArrowUp'))).toBe(false);
  });
  it('ArrowDown at the bottom row returns false', () => {
    const t = seedTable(2, 2);
    const cells = t.querySelectorAll('td');
    caretIn(cells[2], 0);
    expect(handleTableKey(editor, key('ArrowDown'))).toBe(false);
  });
  it('ArrowRight at cell END jumps to the next cell', () => {
    const t = seedTable(1, 2);
    const cells = t.querySelectorAll('td');
    cells[0].innerHTML = 'ab';
    caretIn(cells[0], 2); // end of "ab"
    expect(handleTableKey(editor, key('ArrowRight'))).toBe(true);
    expect(currentCellOf()).toBe(cells[1]);
  });
  it('ArrowRight mid-cell returns false (normal caret movement)', () => {
    const t = seedTable(1, 2);
    const cells = t.querySelectorAll('td');
    cells[0].innerHTML = 'abc';
    caretIn(cells[0], 1); // mid-text
    expect(handleTableKey(editor, key('ArrowRight'))).toBe(false);
  });
  it('ArrowLeft at cell START jumps to the previous cell', () => {
    const t = seedTable(1, 2);
    const cells = t.querySelectorAll('td');
    caretIn(cells[1], 0); // start of second cell
    expect(handleTableKey(editor, key('ArrowLeft'))).toBe(true);
    expect(currentCellOf()).toBe(cells[0]);
  });
  it('Shift+Arrow is NOT hijacked (returns false for selection)', () => {
    const t = seedTable(2, 2);
    const cells = t.querySelectorAll('td');
    caretIn(cells[0], 0);
    expect(handleTableKey(editor, key('ArrowDown', { shift: true }))).toBe(false);
  });
});
