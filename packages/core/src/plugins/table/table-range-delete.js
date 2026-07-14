/**
 * table-range-delete.js — the cross-cell selection guard (fix for the
 * table-corruption bug: a non-collapsed selection touching a table used to
 * fall through handleTableKey into handleMultiBlockDelete, which treated
 * <td>/<th> as ordinary blocks and merged them, destroying the table).
 *
 * When the selection is non-collapsed and touches a table, we take over
 * Backspace/Delete/typing so the table STRUCTURE is preserved:
 *   • selection entirely within one cell  → let the browser do a normal
 *     in-cell range delete (return false; it is not a multi-block case)
 *   • selection spanning ≥2 cells, or crossing the table boundary → clear the
 *     content of each intersected cell (leaving a <br> placeholder), never
 *     merging cells or dissolving the table; caret lands in the first cell.
 */
import { getClosestTag } from '../../selection/range-utils.js';

/** All cell elements of the table in DOM order (row-major). */
function tableCells(table) {
  return Array.from(table.querySelectorAll('td, th'));
}

/**
 * True when the selection `range` intersects `cell` (any overlap, including
 * the range starting or ending inside it). Uses boundary-point comparisons so
 * it is reliable across browsers and jsdom.
 */
function rangeTouchesCell(range, cell, doc) {
  let cr;
  try {
    cr = doc.createRange();
    cr.selectNodeContents(cell);
  } catch {
    return false;
  }
  // selection.start < cell.end  AND  selection.end > cell.start
  const startBeforeCellEnd = range.compareBoundaryPoints(Range.END_TO_START, cr) < 0;
  const endAfterCellStart  = range.compareBoundaryPoints(Range.START_TO_END, cr) > 0;
  return startBeforeCellEnd && endAfterCellStart;
}

/** Reset a cell's content to a single <br> placeholder. */
function clearCell(cell, doc) {
  cell.textContent = '';
  cell.appendChild(doc.createElement('br'));
}

/** Place a collapsed caret at the start of a cell. */
function caretIntoCellStart(editor, cell, doc) {
  const win = editor.selection && editor.selection.getWindow();
  if (!win) return;
  try {
    const range = doc.createRange();
    range.setStart(cell, 0);
    range.collapse(true);
    const sel = win.getSelection();
    if (sel) { sel.removeAllRanges(); sel.addRange(range); }
  } catch { /* non-fatal */ }
}

/**
 * Handle Backspace/Delete when the selection is non-collapsed and touches a
 * table. Returns true when it consumed the key (structure-preserving delete),
 * false to let normal handling proceed (single-cell in-cell delete).
 *
 * `cell` is the cell containing the selection start (may be null when the
 * selection starts outside the table but ends inside it).
 */
export function handleTableRangeDelete(editor, e) {
  if (e.key !== 'Backspace' && e.key !== 'Delete') return false;

  const info = editor.selection && editor.selection.get();
  if (!info || info.collapsed || !info.range) return false;

  const root = editor.getEditorElement();
  const doc = editor._iframeDoc || (typeof document !== 'undefined' ? document : null);
  if (!root || !doc) return false;

  // Find every table that the selection touches at either end or across.
  const startCell = getClosestTag(info.startNode, 'td', root) ||
                    getClosestTag(info.startNode, 'th', root);
  const endCell   = getClosestTag(info.endNode, 'td', root) ||
                    getClosestTag(info.endNode, 'th', root);
  const startTable = startCell && getClosestTag(startCell, 'table', root);
  const endTable   = endCell && getClosestTag(endCell, 'table', root);

  // Collect the affected tables. Endpoints inside a cell contribute their table;
  // additionally, any table that the range merely SPANS ACROSS (an "engulfing"
  // selection: <p>…</p><table/><p>…</p> selected end-to-end) must be caught too —
  // otherwise the guard bails, handleMultiBlockDelete runs, and range.deleteContents()
  // silently removes the whole table. intersectsNode finds those in-between tables.
  const tables = new Set();
  if (startTable) tables.add(startTable);
  if (endTable) tables.add(endTable);
  for (const table of root.querySelectorAll('table')) {
    if (tables.has(table)) continue;
    try { if (info.range.intersectsNode(table)) tables.add(table); } catch { /* ignore */ }
  }

  // Selection touches no table at all → not our concern.
  if (tables.size === 0) return false;

  // Gather every cell the selection intersects, across the affected tables.
  const affected = [];
  for (const table of tables) {
    for (const cell of tableCells(table)) {
      if (rangeTouchesCell(info.range, cell, doc)) affected.push(cell);
    }
  }

  // Entirely within a single cell and not crossing the table boundary → let the
  // browser handle the in-cell range delete (it will not corrupt the table).
  if (affected.length <= 1 && startCell && startCell === endCell) return false;

  // Structure-preserving clear: empty every intersected cell, keep the grid.
  editor.history && editor.history.takeSnapshot();
  for (const cell of affected) clearCell(cell, doc);

  const caretCell = affected[0] || startCell || endCell;
  if (caretCell) caretIntoCellStart(editor, caretCell, doc);

  editor.emit('afterCommand', { command: 'tableRangeDelete', args: [] });
  if (editor._onChangeFn) editor._onChangeFn();
  return true;
}
