/**
 * table-keyboard.js — key handling for cells (11.19 key-guard + 11.3/11.4 nav).
 *
 * handleTableKey(editor, e) → true when it consumed the key. The plugin calls
 * this from onKeyDown, which runs BEFORE the Phase 4.5 block-editing handlers,
 * so returning true prevents Enter-split / Backspace-merge from ever treating a
 * <td>/<th> as a block and corrupting the table.
 *
 * Behaviours when the caret is inside a cell:
 *   Tab           → next cell (append a row at the very last cell), caret in it
 *   Shift+Tab     → previous cell
 *   Enter         → line break WITHIN the cell (never splits the table)
 *   Backspace     → blocked ONLY at cell start (would merge into the prev cell)
 *   Delete        → blocked ONLY at cell end   (would merge in the next cell)
 * All other keys (and mid-cell Backspace/Delete) fall through to the browser.
 */
import { getClosestTag, getDeepestNode } from '../../selection/range-utils.js';
import { insertRow } from './table-ops.js';
import { buildMatrix, cellCoords, cellAt, matrixDimensions } from './table-matrix.js';
import { handleTableRangeDelete } from './table-range-delete.js';

function currentCell(editor) {
  const sel = editor.selection && editor.selection.get();
  if (!sel || !sel.startNode) return null;
  const root = editor.getEditorElement();
  return getClosestTag(sel.startNode, 'td', root) ||
         getClosestTag(sel.startNode, 'th', root);
}

/**
 * T10: move the caret OUT of the table to the block before (up) or after (down)
 * it. If no such block exists (table is the first/last child of the editable),
 * create an empty <p> there first so the user is never stuck inside the table.
 * Returns true when it moved the caret.
 */
function escapeTable(editor, table, down) {
  const root = editor.getEditorElement();
  if (!root || table.parentNode !== root) return false; // only for top-level tables
  const doc = table.ownerDocument;
  let target = down ? table.nextElementSibling : table.previousElementSibling;
  if (!target) {
    target = doc.createElement('p');
    target.appendChild(doc.createElement('br'));
    if (down) table.after(target); else table.before(target);
  }
  try {
    const range = doc.createRange();
    if (down) { range.setStart(target, 0); range.collapse(true); }
    else { range.selectNodeContents(target); range.collapse(false); }
    const win = editor.selection && editor.selection.getWindow
      ? editor.selection.getWindow() : (doc.defaultView || window);
    const sel = win && win.getSelection();
    if (sel) { sel.removeAllRanges(); sel.addRange(range); }
  } catch { return false; }
  if (editor._onChangeFn) editor._onChangeFn();
  return true;
}

/**
 * T8: extend a rectangular cell selection with Shift+Arrow. The keyboard anchor
 * (fixed corner) is stored on the selection manager; the focus corner moves one
 * cell per press. Returns true when it consumed the key.
 */
function handleShiftArrowSelect(editor, e, table, cell, selection) {
  const m = buildMatrix(table);
  const at = cellCoords(m, cell);
  if (!at) return false;
  // Anchor = where the range started (first Shift+Arrow), reused until a plain
  // move/click resets it. Focus tracks the last extended-to cell.
  if (!selection._kbAnchor || !table.contains(selection._kbAnchor)) selection._kbAnchor = cell;
  const focus = selection._kbFocus && table.contains(selection._kbFocus) ? selection._kbFocus : cell;
  const fc = cellCoords(m, focus) || at;
  const { rows, cols } = matrixDimensions(m);
  let r = fc.row, c = fc.col;
  if (e.key === 'ArrowUp') r = Math.max(0, r - 1);
  else if (e.key === 'ArrowDown') r = Math.min(rows - 1, r + 1);
  else if (e.key === 'ArrowLeft') c = Math.max(0, c - 1);
  else if (e.key === 'ArrowRight') c = Math.min(cols - 1, c + 1);
  else return false;
  const target = cellAt(m, r, c);
  if (!target) return false;
  e.preventDefault();
  selection._kbFocus = target;
  selection.extendTo(selection._kbAnchor, target);
  return true;
}

/** All cells of the table in DOM order (row-major). */
function orderedCells(table) {
  return Array.from(table.querySelectorAll('td, th'));
}

/** Place a collapsed caret at the start of a cell's content. */
function caretInto(editor, cell, edge = 'start') {
  const doc = editor._iframeDoc || (typeof document !== 'undefined' ? document : null);
  const win = editor.selection && editor.selection.getWindow();
  if (!doc || !win) return;
  const leaf = getDeepestNode(cell, edge === 'end' ? 'last' : 'first') || cell;
  try {
    const range = doc.createRange();
    if (edge === 'end') {
      if (leaf.nodeType === 3) range.setStart(leaf, leaf.nodeValue.length);
      else range.setStartAfter(leaf);
    } else {
      range.setStart(leaf, 0);
    }
    range.collapse(true);
    const sel = win.getSelection();
    if (sel) { sel.removeAllRanges(); sel.addRange(range); }
  } catch { /* non-fatal */ }
}
const caretIntoEnd = (editor, cell) => caretInto(editor, cell, 'end');

/** True when the collapsed caret sits at the very start of the cell content. */
function atCellStart(editor, cell) {
  const info = editor.selection && editor.selection.get();
  if (!info || !info.collapsed) return false;
  if (info.startOffset !== 0) return false;
  const firstLeaf = getDeepestNode(cell, 'first');
  return info.startNode === firstLeaf || info.startNode === cell;
}

/** True when the collapsed caret sits at the very end of the cell content. */
function atCellEnd(editor, cell) {
  const info = editor.selection && editor.selection.get();
  if (!info || !info.collapsed) return false;
  const lastLeaf = getDeepestNode(cell, 'last');
  if (info.startNode === cell) return info.startOffset >= cell.childNodes.length;
  if (info.startNode !== lastLeaf) return false;
  const len = lastLeaf.nodeType === 3 ? lastLeaf.nodeValue.length : lastLeaf.childNodes.length;
  return info.startOffset >= len;
}

export function handleTableKey(editor, e, selection) {
  // Non-collapsed selection touching a table: take over Backspace/Delete so the
  // grid structure is preserved (otherwise handleMultiBlockDelete merges cells).
  // Runs FIRST — before the in-cell caret checks — because such a selection can
  // start outside the table (e.g. from a preceding <p> into a cell).
  if (handleTableRangeDelete(editor, e)) return true;

  const cell = currentCell(editor);
  if (!cell) return false; // not in a table — let normal handling run

  const table = getClosestTag(cell, 'table', editor.getEditorElement());
  if (!table) return false;

  // T8: Shift+Arrow builds a rectangular CELL selection from a keyboard anchor.
  if (selection && e.shiftKey && e.key.startsWith('Arrow')) {
    if (handleShiftArrowSelect(editor, e, table, cell, selection)) return true;
  } else if (selection && (e.key.startsWith('Arrow') || e.key === 'Tab')) {
    // A plain move resets the keyboard-selection anchor so the next Shift+Arrow
    // starts a fresh range from the current cell.
    selection._kbAnchor = null; selection._kbFocus = null;
  }

  // ── Tab / Shift+Tab: move between cells ──────────────────────────────────────
  if (e.key === 'Tab') {
    const cells = orderedCells(table);
    const idx = cells.indexOf(cell);
    if (idx === -1) return false;
    if (e.shiftKey) {
      if (idx > 0) { caretInto(editor, cells[idx - 1]); return true; }
      return true; // at first cell — swallow so focus stays in the table
    }
    if (idx < cells.length - 1) { caretInto(editor, cells[idx + 1]); return true; }
    // Last cell → append a row and move into its first cell.
    editor.history && editor.history.takeSnapshot();
    const lastTr = table.querySelector('tbody tr:last-child, tr:last-child');
    const rowIndex = Array.from(table.rows).indexOf(lastTr);
    insertRow(table, rowIndex, 'below');
    const newCells = orderedCells(table);
    caretInto(editor, newCells[cells.length]); // first cell of the new row
    editor.emit('afterCommand', { command: 'tableAddRow', args: [] });
    if (editor._onChangeFn) editor._onChangeFn();
    return true;
  }

  // ── Enter: line break within the cell (never split the table) ────────────────
  if (e.key === 'Enter') {
    const doc = editor._iframeDoc || document;
    const win = editor.selection && editor.selection.getWindow();
    const info = editor.selection && editor.selection.get();
    // T16: snapshot BEFORE the mutation so this line break is its OWN undo step
    // (outside tables Enter has _onEnter snapshotting; the table path relied only
    // on the debounced typing snapshot, so Ctrl+Z lumped it with adjacent typing).
    if (editor.history && editor.history.takeSnapshot) editor.history.takeSnapshot();
    if (win && info && info.range) {
      try {
        const range = info.range.cloneRange();
        range.deleteContents();
        const br = doc.createElement('br');
        range.insertNode(br);
        // Place caret just after the inserted <br>.
        range.setStartAfter(br);
        range.collapse(true);
        const sel = win.getSelection();
        if (sel) { sel.removeAllRanges(); sel.addRange(range); }
      } catch { /* non-fatal */ }
    }
    if (editor._onChangeFn) editor._onChangeFn();
    editor.emit('afterCommand', { command: 'tableCellNewline', args: [] });
    return true;
  }

  // ── Arrow keys: conservative cell navigation (11.5) ──────────────────────────
  // Vertical arrows move to the cell directly above/below in the same column.
  // Horizontal arrows only jump cells at the cell boundary; otherwise the caret
  // moves normally within the cell text. Never mutates the table.
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    if (e.shiftKey) return false; // don't hijack shift-selection
    const m = buildMatrix(table);
    const at = cellCoords(m, cell);
    if (!at) return false;
    const down = e.key === 'ArrowDown';
    const target = cellAt(m, at.row + (down ? 1 : -1), at.col);
    if (target && target !== cell) { caretInto(editor, target); return true; }
    // T10: at the table's top/bottom edge — step the caret OUT of the table into
    // the adjacent block, creating an escape <p> if the table is the first/last
    // block (otherwise the user can get stuck with no way out by keyboard).
    if (escapeTable(editor, table, down)) { e.preventDefault(); return true; }
    return false;
  }
  if (e.key === 'ArrowLeft' && !e.shiftKey && atCellStart(editor, cell)) {
    const cells = orderedCells(table);
    const idx = cells.indexOf(cell);
    if (idx > 0) { caretIntoEnd(editor, cells[idx - 1]); return true; }
    return false;
  }
  if (e.key === 'ArrowRight' && !e.shiftKey && atCellEnd(editor, cell)) {
    const cells = orderedCells(table);
    const idx = cells.indexOf(cell);
    if (idx > -1 && idx < cells.length - 1) { caretInto(editor, cells[idx + 1]); return true; }
    return false;
  }

  // ── Backspace/Delete: block only the cross-cell-merge boundary case ──────────
  if (e.key === 'Backspace' && atCellStart(editor, cell)) return true;
  if (e.key === 'Delete'    && atCellEnd(editor, cell))   return true;

  return false; // everything else: normal in-cell editing
}
