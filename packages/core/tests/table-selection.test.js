/**
 * table-selection.test.js — Phase 11.16 drag-select rectangular cell range.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestEditor } from '../src/testing/test-harness.js';
import { TableSelectionManager } from '../src/plugins/table/table-selection.js';
import { createTable } from '../src/plugins/table/table-dom.js';

let editor, root, mgr;
beforeEach(() => {
  editor = createTestEditor();
  root = editor.getEditorElement();
  mgr = new TableSelectionManager();
  mgr.install(editor);
});
afterEach(() => {
  mgr.destroy();
  if (!editor.isDestroyed()) editor.destroy();
  if (editor._target && editor._target.parentNode) editor._target.remove();
});

function seed(rows, cols) {
  root.innerHTML = '';
  const t = createTable(document, rows, cols);
  root.appendChild(t);
  return t;
}
const md = (cell) => cell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
const mm = (cell) => cell.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
const selectedCount = () => root.querySelectorAll('.oe-cell--selected').length;

describe('TableSelectionManager', () => {
  it('drag from (0,0) to (1,1) selects a 2x2 block of 4 cells', () => {
    const t = seed(2, 2);
    const cells = t.querySelectorAll('td'); // [00,01,10,11]
    md(cells[0]);
    mm(cells[3]); // to (1,1)
    expect(selectedCount()).toBe(4);
    expect(mgr.getSelectedCells().length).toBe(4);
  });

  it('drag across one row selects that row range only', () => {
    const t = seed(2, 3);
    const cells = t.querySelectorAll('td'); // row0: 0,1,2
    md(cells[0]);
    mm(cells[2]); // (0,0)->(0,2)
    expect(selectedCount()).toBe(3);
  });

  it('dragging back to the start cell clears the selection (single cell = none)', () => {
    const t = seed(2, 2);
    const cells = t.querySelectorAll('td');
    md(cells[0]);
    mm(cells[3]);
    expect(selectedCount()).toBe(4);
    mm(cells[0]); // back to start
    expect(selectedCount()).toBe(0);
    expect(mgr.getSelectedCells().length).toBe(0);
  });

  it('a fresh mousedown clears any prior selection', () => {
    const t = seed(2, 2);
    const cells = t.querySelectorAll('td');
    md(cells[0]); mm(cells[3]);
    expect(selectedCount()).toBe(4);
    md(cells[1]); // new mousedown resets
    expect(selectedCount()).toBe(0);
  });

  it('mousemove without a drag start does nothing', () => {
    const t = seed(2, 2);
    const cells = t.querySelectorAll('td');
    mm(cells[3]);
    expect(selectedCount()).toBe(0);
  });

  it('emits tableCellsSelected with the range', () => {
    const t = seed(2, 2);
    const cells = t.querySelectorAll('td');
    let payload = null;
    editor.on('tableCellsSelected', (e) => { payload = e; });
    md(cells[0]); mm(cells[3]);
    expect(payload).not.toBeNull();
    expect(payload.cells.length).toBe(4);
  });

  it('a right-click (button 2) does NOT clear the selection', () => {
    const t = seed(2, 2);
    const cells = t.querySelectorAll('td');
    md(cells[0]); mm(cells[3]);
    expect(selectedCount()).toBe(4);
    // right mousedown — must preserve the range so the context menu can use it
    cells[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 2 }));
    expect(selectedCount()).toBe(4);
    expect(mgr.getSelectedCells().length).toBe(4);
  });

  it('a move that stays on the start cell keeps the drag alive', () => {
    const t = seed(2, 2);
    const cells = t.querySelectorAll('td');
    md(cells[0]);
    mm(cells[0]);   // still on start — no range yet, but drag stays alive
    expect(selectedCount()).toBe(0);
    mm(cells[3]);   // now move to (1,1) → selects
    expect(selectedCount()).toBe(4);
  });

  it('destroy clears selection and removes listeners', () => {
    const t = seed(2, 2);
    const cells = t.querySelectorAll('td');
    md(cells[0]); mm(cells[3]);
    mgr.destroy();
    expect(root.querySelectorAll('.oe-cell--selected').length).toBe(0);
    // after destroy, events are no-ops (no throw)
    expect(() => md(cells[0])).not.toThrow();
  });
});

// 16.7.6 — whole-column / whole-row selection.
describe('TableSelectionManager — selectColumn / selectRow', () => {
  it('selectColumn selects every cell in that column', () => {
    const t = seed(3, 3);
    const cells = t.querySelectorAll('td'); // row-major: (0,0)(0,1)(0,2)(1,0)...
    mgr.selectColumn(cells[1]); // column index 1
    expect(selectedCount()).toBe(3);
    // The selected cells are exactly the middle column.
    const sel = mgr.getSelectedCells();
    for (const c of sel) expect(c.cellIndex).toBe(1);
  });

  it('selectRow selects every cell in that row', () => {
    const t = seed(3, 3);
    const rows = t.querySelectorAll('tr');
    const rowCell = rows[2].querySelector('td'); // any cell in row 2
    mgr.selectRow(rowCell);
    expect(selectedCount()).toBe(3);
    const sel = mgr.getSelectedCells();
    for (const c of sel) expect(c.parentElement).toBe(rows[2]);
  });

  it('selectColumn/selectRow emit tableCellsSelected', () => {
    const t = seed(2, 2);
    let count = 0;
    editor.on('tableCellsSelected', () => { count++; });
    mgr.selectColumn(t.querySelector('td'));
    mgr.selectRow(t.querySelector('td'));
    expect(count).toBe(2);
  });

  it('a header-strip mousedown (top edge of a first-row cell) selects the column', () => {
    const t = seed(3, 2);
    const firstRowCell = t.querySelector('tr:first-child td:nth-child(2)');
    firstRowCell.getBoundingClientRect = () => ({ left: 100, top: 50, width: 80, height: 30, right: 180, bottom: 80 });
    // clientY within 8px of the top edge → column-select strip.
    firstRowCell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 140, clientY: 52 }));
    expect(selectedCount()).toBe(3); // whole 2nd column (3 rows)
  });

  it('a header-strip mousedown (left edge of a first-column cell) selects the row', () => {
    const t = seed(2, 3);
    const secondRowFirstCell = t.querySelector('tr:nth-child(2) td:first-child');
    secondRowFirstCell.getBoundingClientRect = () => ({ left: 100, top: 50, width: 80, height: 30, right: 180, bottom: 80 });
    // clientX within 8px of the left edge → row-select strip.
    secondRowFirstCell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 103, clientY: 65 }));
    expect(selectedCount()).toBe(3); // whole 2nd row (3 cols)
  });

  it('a click in the INTERIOR of a first-row/first-col cell does NOT trigger header selection', () => {
    const t = seed(3, 3);
    const cell = t.querySelector('tr:first-child td:first-child');
    cell.getBoundingClientRect = () => ({ left: 100, top: 50, width: 80, height: 30, right: 180, bottom: 80 });
    // Well inside both edges → a normal drag-start, not a header strip.
    cell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 140, clientY: 65 }));
    expect(selectedCount()).toBe(0); // no range yet (drag started, nothing selected)
  });
});
