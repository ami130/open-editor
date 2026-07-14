/**
 * table-contextmenu.js — right-click menu items for a table cell (11.6, 11.7).
 *
 * buildTableMenuItems(editor, cell) → items for ContextMenuManager.show().
 * Each action wraps a pure table-ops function with a history snapshot and an
 * onChange/afterCommand notification. Row/column targets are resolved from the
 * formal matrix so ops hit the correct logical line even with spans.
 *
 * Deleting the last remaining row or column deletes the whole table (there is
 * nothing left to keep), matching common editor behaviour.
 */
import { getClosestTag } from '../../selection/range-utils.js';
import { buildMatrix, matrixDimensions, cellCoords } from './table-matrix.js';
import {
  insertRow, insertColumn, deleteRow, deleteColumn, deleteTable,
} from './table-ops.js';
import { mergeCells, splitVertical, splitHorizontal } from './table-merge.js';
import { buildFormatMenuItems } from './table-format-menu.js';

function tableOf(editor, cell) {
  return getClosestTag(cell, 'table', editor.getEditorElement());
}

/**
 * Build the table context-menu items for a right-clicked `cell`.
 * `selectedCells` is the current drag-selection (from TableSelectionManager);
 * when it holds ≥2 cells, a "Merge cells" entry is offered.
 */
export function buildTableMenuItems(editor, cell, selectedCells = []) {
  const table = tableOf(editor, cell);
  if (!table) return [];

  // Resolve the cell's logical position once; ops re-read the matrix themselves.
  const coordsOf = () => cellCoords(buildMatrix(table), cell) || { row: 0, col: 0 };

  const run = (fn, command) => {
    editor.history && editor.history.takeSnapshot();
    fn();
    editor.emit('afterCommand', { command, args: [] });
    if (editor._onChangeFn) editor._onChangeFn();
    if (typeof editor._updatePlaceholder === 'function') editor._updatePlaceholder();
  };

  const items = [];

  // ── Merge / split (11.13) — selection-aware ──────────────────────────────────
  if (Array.isArray(selectedCells) && selectedCells.length >= 2) {
    items.push({ label: 'Merge cells', action: () => run(() => mergeCells(table, selectedCells), 'tableMerge') });
  }
  // Split is always available on the clicked cell (Jodit divides a plain cell by
  // growing neighbours, or a spanned cell by shrinking it).
  items.push({ label: 'Split cell vertically',   action: () => run(() => splitVertical(table, cell),   'tableSplitV') });
  items.push({ label: 'Split cell horizontally', action: () => run(() => splitHorizontal(table, cell), 'tableSplitH') });
  items.push({ separator: true });

  return items.concat([
    { label: 'Insert row above', action: () => run(() => insertRow(table, coordsOf().row, 'above'), 'tableInsertRow') },
    { label: 'Insert row below', action: () => run(() => insertRow(table, coordsOf().row, 'below'), 'tableInsertRow') },
    { separator: true },
    { label: 'Insert column left',  action: () => run(() => insertColumn(table, coordsOf().col, 'left'),  'tableInsertColumn') },
    { label: 'Insert column right', action: () => run(() => insertColumn(table, coordsOf().col, 'right'), 'tableInsertColumn') },
    { separator: true },
    {
      label: 'Delete row',
      action: () => run(() => {
        const { rows } = matrixDimensions(buildMatrix(table));
        if (rows <= 1) deleteTable(table);
        else deleteRow(table, coordsOf().row);
      }, 'tableDeleteRow'),
    },
    {
      label: 'Delete column',
      action: () => run(() => {
        const { cols } = matrixDimensions(buildMatrix(table));
        if (cols <= 1) deleteTable(table);
        else deleteColumn(table, coordsOf().col);
      }, 'tableDeleteColumn'),
    },
    { separator: true },
    ...buildFormatMenuItems(editor, table, cell, selectedCells, run),
    { separator: true },
    { label: 'Delete table', action: () => run(() => deleteTable(table), 'tableDelete') },
  ]);
}
