/**
 * table-contextmenu.test.js — Phase 11.6/11.7 context-menu actions.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestEditor } from '../src/testing/test-harness.js';
import { buildTableMenuItems } from '../src/plugins/table/table-contextmenu.js';
import { createTable } from '../src/plugins/table/table-dom.js';
import { buildMatrix, matrixDimensions } from '../src/plugins/table/table-matrix.js';

let editor, root;
beforeEach(() => { editor = createTestEditor(); root = editor.getEditorElement(); });
afterEach(() => {
  if (!editor.isDestroyed()) editor.destroy();
  if (editor._target && editor._target.parentNode) editor._target.remove();
});

function seed(rows, cols) {
  root.innerHTML = '';
  const t = createTable(document, rows, cols);
  root.appendChild(t);
  return t;
}
const dims = (t) => matrixDimensions(buildMatrix(t));
function itemBy(items, label) { return items.find((i) => i.label === label); }

describe('buildTableMenuItems', () => {
  it('offers the full set of row/column/table actions', () => {
    const t = seed(2, 2);
    const items = buildTableMenuItems(editor, t.querySelector('td'));
    const labels = items.filter((i) => i.label).map((i) => i.label);
    expect(labels).toEqual(expect.arrayContaining([
      'Insert row above', 'Insert row below',
      'Insert column left', 'Insert column right',
      'Delete row', 'Delete column', 'Delete table',
    ]));
  });

  it('Insert row below adds a row', () => {
    const t = seed(2, 2);
    itemBy(buildTableMenuItems(editor, t.querySelector('td')), 'Insert row below').action();
    expect(dims(t)).toEqual({ rows: 3, cols: 2 });
  });

  it('Insert column right adds a column', () => {
    const t = seed(2, 2);
    itemBy(buildTableMenuItems(editor, t.querySelector('td')), 'Insert column right').action();
    expect(dims(t)).toEqual({ rows: 2, cols: 3 });
  });

  it('Delete row on the FIRST cell removes that row', () => {
    const t = seed(3, 2);
    const firstRowCell = t.querySelectorAll('tbody tr')[0].querySelector('td');
    itemBy(buildTableMenuItems(editor, firstRowCell), 'Delete row').action();
    expect(dims(t)).toEqual({ rows: 2, cols: 2 });
  });

  it('Delete column removes that column', () => {
    const t = seed(2, 3);
    itemBy(buildTableMenuItems(editor, t.querySelector('td')), 'Delete column').action();
    expect(dims(t)).toEqual({ rows: 2, cols: 2 });
  });

  it('Delete row on a single-row table deletes the whole table', () => {
    const t = seed(1, 2);
    itemBy(buildTableMenuItems(editor, t.querySelector('td')), 'Delete row').action();
    expect(root.querySelector('table')).toBeNull();
  });

  it('Delete table removes it and fires afterCommand', () => {
    const t = seed(2, 2);
    const cmds = [];
    editor.on('afterCommand', (e) => cmds.push(e.command));
    itemBy(buildTableMenuItems(editor, t.querySelector('td')), 'Delete table').action();
    expect(root.querySelector('table')).toBeNull();
    expect(cmds).toContain('tableDelete');
  });
});

describe('buildTableMenuItems — merge/split (11.C-3)', () => {
  it('offers "Merge cells" only when 2+ cells are selected', () => {
    const t = seed(2, 2);
    const cells = Array.from(t.querySelectorAll('td'));
    const noSel = buildTableMenuItems(editor, cells[0], []);
    expect(itemBy(noSel, 'Merge cells')).toBeUndefined();
    const withSel = buildTableMenuItems(editor, cells[0], [cells[0], cells[1]]);
    expect(itemBy(withSel, 'Merge cells')).toBeTruthy();
  });

  it('always offers split entries on the clicked cell', () => {
    const t = seed(2, 2);
    const items = buildTableMenuItems(editor, t.querySelector('td'));
    expect(itemBy(items, 'Split cell vertically')).toBeTruthy();
    expect(itemBy(items, 'Split cell horizontally')).toBeTruthy();
  });

  it('"Merge cells" merges the selected range', () => {
    const t = seed(2, 2);
    const cells = Array.from(t.querySelectorAll('td'));
    const items = buildTableMenuItems(editor, cells[0], [cells[0], cells[1]]);
    itemBy(items, 'Merge cells').action();
    expect(cells[0].getAttribute('colspan')).toBe('2');
  });

  it('"Split cell vertically" adds a column', () => {
    const t = seed(2, 2);
    itemBy(buildTableMenuItems(editor, t.querySelector('td')), 'Split cell vertically').action();
    expect(dims(t)).toEqual({ rows: 2, cols: 3 });
  });
});

describe('buildTableMenuItems — format submenu (11.D)', () => {
  it('offers a "Table format" submenu', () => {
    const t = seed(2, 2);
    const fmt = itemBy(buildTableMenuItems(editor, t.querySelector('td')), 'Table format');
    expect(fmt).toBeTruthy();
    expect(Array.isArray(fmt.submenu)).toBe(true);
  });

  it('Toggle header row (in submenu) converts the first row to <th>', () => {
    const t = seed(2, 2);
    const fmt = itemBy(buildTableMenuItems(editor, t.querySelector('td')), 'Table format');
    itemBy(fmt.submenu, 'Toggle header row').action();
    expect(t.querySelectorAll('tr:first-child th').length).toBe(2);
  });

  it('provides a Copy table entry', () => {
    const t = seed(2, 2);
    const fmt = itemBy(buildTableMenuItems(editor, t.querySelector('td')), 'Table format');
    expect(itemBy(fmt.submenu, 'Copy table')).toBeTruthy();
  });

  // 16.7.5 — the old flat border/color/align entries were replaced by two
  // scoped dialogs. The underlying ops (setCellBorder, setTableStyle, etc.)
  // still exist and are tested directly in table-format.test.js; here we only
  // assert the submenu now exposes the two dialog openers.
  it('offers "Table properties…" and "Cell properties…" dialog openers', () => {
    const t = seed(2, 2);
    const fmt = itemBy(buildTableMenuItems(editor, t.querySelector('td')), 'Table format');
    expect(itemBy(fmt.submenu, 'Table properties…')).toBeTruthy();
    expect(itemBy(fmt.submenu, 'Cell properties…')).toBeTruthy();
    // Both are dialog openers (have an action), not further submenus.
    expect(typeof itemBy(fmt.submenu, 'Table properties…').action).toBe('function');
    expect(typeof itemBy(fmt.submenu, 'Cell properties…').action).toBe('function');
  });

  it('no longer exposes the old flat per-side border / align entries', () => {
    const t = seed(2, 2);
    const fmt = itemBy(buildTableMenuItems(editor, t.querySelector('td')), 'Table format');
    expect(itemBy(fmt.submenu, 'Border all sides')).toBeUndefined();
    expect(itemBy(fmt.submenu, 'Align cell center')).toBeUndefined();
  });
});
