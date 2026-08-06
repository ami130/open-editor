/**
 * table-color-apply-fix.test.js — the user-reported bug: "table properties
 * header color not working." Root cause: a bare, unlabeled "apply" checkbox
 * silently gated Header color (Table properties) and Background/Text color
 * (Cell properties), unchecked by default on first use, so picking a color
 * and clicking Apply did nothing. Fixed: these fields now apply unconditionally
 * on Apply, exactly like Border color / Stripe color already did in the same
 * dialogs. Drives the real dialog flow via a stubbed editor.ui.modal.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { OpenEditor } from '../src/editor.js';
import { openTablePropertiesDialog, openCellPropertiesDialog } from '../src/plugins/table/table-props-dialog.js';

let editor, target;
afterEach(() => {
  if (editor && !editor.isDestroyed()) editor.destroy();
  if (target && target.parentNode) target.remove();
  editor = target = null;
});

function make() {
  target = document.createElement('div');
  document.body.appendChild(target);
  editor = new OpenEditor(target, {});
  return editor;
}

/** Stub editor.ui.modal.open to resolve with `choice`, capturing the form body. */
function stubModal(ed, choice) {
  let capturedForm = null;
  const origOpen = ed.ui.modal.open;
  ed.ui.modal.open = (opts) => {
    capturedForm = opts.body;
    return Promise.resolve(choice);
  };
  return { getForm: () => capturedForm, restore: () => { ed.ui.modal.open = origOpen; } };
}

describe('Table properties — header color applies without a separate checkbox', () => {
  it('picking a header color and clicking Apply colors every <th> (no checkbox needed)', async () => {
    make();
    editor.setHTML('<table class="oe-table"><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>');
    const table = editor.getEditorElement().querySelector('table');
    const stub = stubModal(editor, 'apply');

    const promise = openTablePropertiesDialog(editor, table, (fn) => fn());
    const form = stub.getForm();
    // No apply-checkbox should exist for Header color anymore.
    const headerField = Array.from(form.querySelectorAll('.oe-tprops__field'))
      .find((f) => f.textContent.includes('Header color'));
    expect(headerField.querySelector('input[type="checkbox"]')).toBeNull();

    const headerColorInput = headerField.querySelector('input[type="color"]');
    headerColorInput.value = '#00ff00';
    await promise;
    stub.restore();

    for (const th of table.querySelectorAll('th')) {
      expect(th.style.backgroundColor).toBe('rgb(0, 255, 0)');
    }
  });
});

describe('Cell properties — background/text color apply without a separate checkbox', () => {
  it('picking a background and text color and clicking Apply colors the selected cells', async () => {
    make();
    editor.setHTML('<table class="oe-table"><tbody><tr><td>1</td><td>2</td></tr></tbody></table>');
    const table = editor.getEditorElement().querySelector('table');
    const cells = Array.from(table.querySelectorAll('td'));
    const stub = stubModal(editor, 'apply');

    const promise = openCellPropertiesDialog(editor, table, cells, (fn) => fn());
    const form = stub.getForm();
    const bgField = Array.from(form.querySelectorAll('.oe-tprops__field'))
      .find((f) => f.textContent.includes('Background'));
    const fgField = Array.from(form.querySelectorAll('.oe-tprops__field'))
      .find((f) => f.textContent.includes('Text color'));
    expect(bgField.querySelector('input[type="checkbox"]')).toBeNull();
    expect(fgField.querySelector('input[type="checkbox"]')).toBeNull();

    bgField.querySelector('input[type="color"]').value = '#ff00ff';
    fgField.querySelector('input[type="color"]').value = '#0000ff';
    await promise;
    stub.restore();

    for (const cell of cells) {
      expect(cell.style.backgroundColor).toBe('rgb(255, 0, 255)');
      expect(cell.style.color).toBe('rgb(0, 0, 255)');
    }
  });
});
