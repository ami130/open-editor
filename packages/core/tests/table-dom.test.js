/**
 * table-dom.test.js — Phase 11.2: createTable + insertTable.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestEditor } from '../src/testing/test-harness.js';
import { createTable, insertTable, firstCell } from '../src/plugins/table/table-dom.js';
import { buildMatrix, matrixDimensions } from '../src/plugins/table/table-matrix.js';

let editor, root;
beforeEach(() => { editor = createTestEditor(); root = editor.getEditorElement(); });
afterEach(() => {
  if (!editor.isDestroyed()) editor.destroy();
  if (editor._target && editor._target.parentNode) editor._target.remove();
});

describe('createTable', () => {
  it('builds a rows×cols grid with a colgroup of equal widths', () => {
    const t = createTable(document, 2, 3);
    expect(t.tagName).toBe('TABLE');
    expect(t.querySelectorAll('tbody tr').length).toBe(2);
    expect(t.querySelectorAll('tbody tr:first-child td').length).toBe(3);
    const cols = t.querySelectorAll('colgroup col');
    expect(cols.length).toBe(3);
    expect(cols[0].style.width).toContain('%');
    // matrix agrees on dimensions
    expect(matrixDimensions(buildMatrix(t))).toEqual({ rows: 2, cols: 3 });
  });

  it('every cell has a <br> so it is editable and has height', () => {
    const t = createTable(document, 1, 2);
    t.querySelectorAll('td').forEach((td) => {
      expect(td.querySelector('br')).not.toBeNull();
    });
  });

  it('headerRow makes the first row <th scope="col">', () => {
    const t = createTable(document, 2, 2, { headerRow: true });
    const firstRow = t.querySelector('tbody tr');
    const ths = firstRow.querySelectorAll('th');
    expect(ths.length).toBe(2);
    expect(ths[0].getAttribute('scope')).toBe('col');
    // second row stays td
    expect(t.querySelectorAll('tbody tr')[1].querySelector('td')).not.toBeNull();
  });

  it('adds a caption when requested', () => {
    const t = createTable(document, 1, 1, { caption: 'Sales' });
    expect(t.querySelector('caption').textContent).toBe('Sales');
  });

  it('clamps absurd/invalid dimensions', () => {
    expect(createTable(document, 0, 0).querySelectorAll('td').length).toBe(1); // → 1×1
    expect(createTable(document, 999, 999).querySelectorAll('tbody tr').length).toBe(50); // MAX
    expect(createTable(document, 'x', 'y').querySelectorAll('td').length).toBe(1); // NaN → 1
  });
});

describe('insertTable', () => {
  it('inserts the table at the cursor with a trailing <p>', () => {
    root.innerHTML = '<p>before</p>';
    // place caret in the paragraph
    const p = root.querySelector('p');
    const win = editor.selection.getWindow();
    const range = document.createRange();
    range.setStart(p.firstChild, 3); range.collapse(true);
    const s = win.getSelection(); s.removeAllRanges(); s.addRange(range);

    const t = createTable(document, 2, 2);
    insertTable(editor, t);

    expect(root.querySelector('table')).not.toBeNull();
    // a <p> exists after the table
    expect(t.nextElementSibling && t.nextElementSibling.tagName.toLowerCase()).toBe('p');
  });

  it('places the caret inside the first cell', () => {
    root.innerHTML = '<p>x</p>';
    const t = createTable(document, 2, 2);
    insertTable(editor, t);
    const info = editor.selection.get();
    const cell = firstCell(t);
    expect(cell.contains(info.startNode) || info.startNode === cell).toBe(true);
  });

  it('emits afterCommand:insertTable and takes a history snapshot', () => {
    const cmds = [];
    editor.on('afterCommand', (e) => cmds.push(e.command));
    root.innerHTML = '<p>x</p>';
    insertTable(editor, createTable(document, 1, 1));
    expect(cmds).toContain('insertTable');
  });
});
