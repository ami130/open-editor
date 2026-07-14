/**
 * table-plugin.test.js — Phase 11.A plugin shell.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestEditor } from '../src/testing/test-harness.js';
import { createTablePlugin, tablePlugin } from '../src/plugins/table/table-plugin.js';

let editor;
beforeEach(() => { editor = createTestEditor(); });
afterEach(() => {
  if (!editor.isDestroyed()) editor.destroy();
  if (editor._target && editor._target.parentNode) editor._target.remove();
});

describe('createTablePlugin', () => {
  it('factory returns a fresh spec each call (per-instance state)', () => {
    const a = createTablePlugin();
    const b = createTablePlugin();
    expect(a).not.toBe(b);
    expect(a.name).toBe('table');
  });

  it('singleton export exists', () => {
    expect(tablePlugin.name).toBe('table');
  });

  it('install injects table styles once', () => {
    const p = createTablePlugin();
    p.install(editor);
    const doc = editor._wrapper.ownerDocument;
    expect(doc.getElementById('oe-table-styles')).not.toBeNull();
    // idempotent
    p.install(editor);
    expect(doc.querySelectorAll('#oe-table-styles').length).toBe(1);
    p.destroy();
  });

  it('exposes an Insert Table toolbar button', () => {
    const p = createTablePlugin();
    p.install(editor);
    const btns = p.getToolbarButtons();
    expect(btns).toHaveLength(1);
    expect(btns[0].name).toBe('insertTable');
    expect(btns[0].tooltip).toBe('Insert Table');
    expect(typeof btns[0].onClick).toBe('function');
    p.destroy();
  });

  it('destroy clears the editor reference', () => {
    const p = createTablePlugin();
    p.install(editor);
    p.destroy();
    expect(p._editor).toBeNull();
  });

  it('onKeyDown delegates to the table key handler (Tab in a cell consumed)', () => {
    const p = createTablePlugin();
    p.install(editor);
    const root = editor.getEditorElement();
    root.innerHTML = '<table><tbody><tr><td>a</td><td>b</td></tr></tbody></table>';
    const cells = root.querySelectorAll('td');
    const range = document.createRange();
    range.setStart(cells[0].firstChild, 0); range.collapse(true);
    const s = editor.selection.getWindow().getSelection();
    s.removeAllRanges(); s.addRange(range);
    // Tab in a cell is consumed (true) so block-editing never sees it.
    expect(p.onKeyDown({ key: 'Tab', shiftKey: false, preventDefault() {} })).toBe(true);
    // A plain key outside any table is NOT consumed.
    root.innerHTML = '<p>x</p>';
    const r2 = document.createRange();
    r2.setStart(root.querySelector('p').firstChild, 0); r2.collapse(true);
    s.removeAllRanges(); s.addRange(r2);
    expect(p.onKeyDown({ key: 'Tab', shiftKey: false, preventDefault() {} })).toBe(false);
    p.destroy();
  });

  it('right-click in a cell shows the table context menu', () => {
    const p = createTablePlugin();
    p.install(editor);
    const root = editor.getEditorElement();
    root.innerHTML = '<table><tbody><tr><td id="c">a</td></tr></tbody></table>';
    let shown = null;
    editor.ui.contextMenu.show = (x, y, items) => { shown = items; };
    const cell = root.querySelector('#c');
    p._onContextMenu({ target: cell, clientX: 10, clientY: 10, preventDefault() {} });
    expect(shown).not.toBeNull();
    expect(shown.some((i) => i.label === 'Delete table')).toBe(true);
    p.destroy();
  });
});
