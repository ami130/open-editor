/**
 * table-format-menu.js — the "Table format" submenu items (11.9/11.14/11.15 +
 * 16.7.5). Split out of table-contextmenu.js to keep both files under the
 * 300-line limit. Each entry wraps a pure op (table-format / table-copy) with a
 * history snapshot + onChange notification via the shared `run` passed in.
 *
 * buildFormatMenuItems(editor, table, cell, selectedCells, run) → item[]
 * The cells the style ops target are the drag-selection when present, else the
 * single right-clicked cell.
 *
 * 16.7.5 — the old flat border/color/align entries (each hardcoded to one
 * border style) are replaced by two scoped dialogs (table-props-dialog.js):
 * "Table properties…" (whole-table width/align/grid-border with a real
 * width/style/color picker) and "Cell properties…" (per-side border,
 * background, text color, h/v align — scoped to the selection). The simple
 * one-shot items (header toggle, caption, copy) stay as direct submenu entries.
 */
import { toggleHeaderRow, setCaption } from './table-format.js';
import { copyTable } from './table-copy.js';
import { openTablePropertiesDialog, openCellPropertiesDialog } from './table-props-dialog.js';

export function buildFormatMenuItems(editor, table, cell, selectedCells, run) {
  const targets = (selectedCells && selectedCells.length) ? selectedCells : [cell];

  // A single "Table format" submenu, ONE level deep (nested sub-submenus are
  // fragile via hover — Jodit keeps these flat too).
  return [{
    label: 'Table format',
    submenu: [
      { label: 'Table properties…', action: () => openTablePropertiesDialog(editor, table, run) },
      { label: 'Cell properties…',  action: () => openCellPropertiesDialog(editor, table, targets, run) },
      { separator: true },
      { label: 'Toggle header row', action: () => run(() => toggleHeaderRow(table), 'tableHeaderToggle') },
      { label: 'Edit caption…', action: () => _editCaption(editor, table, run) },
      { label: 'Copy table',    action: () => copyTable(editor, table) },
    ],
  }];
}

function _editCaption(editor, table, run) {
  if (!editor.ui || !editor.ui.modal) return;
  const doc = (editor._wrapper && editor._wrapper.ownerDocument) || document;
  const input = doc.createElement('input');
  input.type = 'text';
  input.className = 'oe-img-dialog__input';
  const existing = table.querySelector(':scope > caption');
  input.value = existing ? existing.textContent : '';
  editor.ui.modal.open({
    title: 'Table caption',
    body: input,
    buttons: [{ label: 'Cancel', value: null }, { label: 'Apply', value: 'apply', variant: 'primary' }],
  }).then((v) => {
    if (v === 'apply') run(() => setCaption(table, input.value), 'tableCaption');
  });
}
