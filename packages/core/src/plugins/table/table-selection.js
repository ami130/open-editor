/**
 * table-selection.js — click-and-drag rectangular cell selection (11.16).
 *
 * On mousedown in a cell, tracks a start cell; on mousemove into another cell of
 * the SAME table, highlights the smallest rectangle (via the formal matrix) that
 * covers both — the basis for merge / delete / style acting on a range. Cells in
 * the range get the `oe-cell--selected` class. Selection clears on a plain click,
 * on mousedown outside a table, or via clear().
 *
 * Exposes getSelectedCells() (distinct, DOM order) for the ops layer.
 */
import { buildMatrix, cellCoords, cellsInRange, matrixDimensions } from './table-matrix.js';

const SEL_CLASS = 'oe-cell--selected';

export class TableSelectionManager {
  constructor() {
    this._editor = null;
    this._table = null;
    this._startCell = null;
    this._dragging = false;
    this._selected = [];
  }

  install(editor) {
    this._editor = editor;
    const el = editor.getEditorElement && editor.getEditorElement();
    if (!el) return;
    this._el = el;
    this._onDown = (e) => this._start(e);
    this._onMove = (e) => this._move(e);
    this._onUp   = () => this._end();
    el.addEventListener('mousedown', this._onDown);
    el.addEventListener('mousemove', this._onMove);
    const doc = el.ownerDocument;
    doc.addEventListener('mouseup', this._onUp);
    this._doc = doc;
  }

  destroy() {
    if (this._el) {
      this._el.removeEventListener('mousedown', this._onDown);
      this._el.removeEventListener('mousemove', this._onMove);
    }
    if (this._doc) this._doc.removeEventListener('mouseup', this._onUp);
    this.clear();
    this._editor = this._el = this._doc = null;
  }

  _cellFrom(target) {
    if (!target || !target.closest) return null;
    return target.closest('td, th');
  }
  _tableFrom(cell) {
    return cell && cell.closest ? cell.closest('table') : null;
  }

  _start(e) {
    // A right-click (button 2) must NOT clear an existing selection — the user
    // is opening the context menu to act on that selection. Also ignore it as a
    // drag start. (contextmenu fires separately and reads getSelectedCells().)
    if (e.button === 2) return;

    const cell = this._cellFrom(e.target);
    // A left mousedown resets the previous selection and begins a new drag.
    this.clear();
    if (!cell) return;

    // 16.7.6 — header-strip click: a click in the thin top edge of a top-row
    // cell selects the whole COLUMN; a click in the thin left edge of a
    // first-column cell selects the whole ROW (the "click a column/row
    // header" pattern in CKEditor/Jodit). Checked before starting a drag so
    // it wins over normal cell selection. The strip is HEADER_STRIP px wide,
    // reads from the cell's own rect so it works under any zoom/scroll.
    const zone = this._headerZone(cell, e);
    if (zone === 'col') { this.selectColumn(cell); return; }
    if (zone === 'row') { this.selectRow(cell); return; }

    this._startCell = cell;
    this._table = this._tableFrom(cell);
    this._dragging = true;
  }

  // Which header strip (if any) the pointer is in for `cell`. Only the
  // top edge of a first-ROW cell counts as a column header, and only the
  // left edge of a first-COLUMN cell as a row header — so an interior cell's
  // edges never hijack a normal click.
  _headerZone(cell, e) {
    if (typeof cell.getBoundingClientRect !== 'function') return null;
    const r = cell.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const STRIP = 8;
    const tr = cell.parentElement;
    const isFirstRow = tr && tr.parentElement && tr === tr.parentElement.querySelector('tr');
    const isFirstCol = tr && cell === tr.querySelector('td, th');
    if (isFirstRow && e.clientY - r.top <= STRIP) return 'col';
    if (isFirstCol && e.clientX - r.left <= STRIP) return 'row';
    return null;
  }

  _move(e) {
    if (!this._dragging || !this._startCell || !this._table) return;
    const cell = this._cellFrom(e.target);
    if (!cell || this._tableFrom(cell) !== this._table) return;
    if (cell === this._startCell) {
      // Still over the start cell (common on the first move after mousedown) →
      // no range yet. Drop only the highlight; KEEP the drag alive so moving on
      // to another cell still selects. (Calling clear() here killed the drag.)
      this._clearClasses();
      this._selected = [];
      return;
    }
    this._selectRange(this._startCell, cell);
  }

  _end() { this._dragging = false; }

  /** Highlight the rectangle covering both cells. */
  _selectRange(a, b) {
    const m = buildMatrix(this._table);
    const ca = cellCoords(m, a);
    const cb = cellCoords(m, b);
    if (!ca || !cb) return;
    const cells = cellsInRange(m, ca.row, ca.col, cb.row, cb.col);
    this._apply(cells);
  }

  _apply(cells) {
    this._clearClasses();
    this._selected = cells;
    for (const c of cells) c.classList.add(SEL_CLASS);
    if (this._editor) this._editor.emit('tableCellsSelected', { cells });
  }

  _clearClasses() {
    for (const c of this._selected) c.classList.remove(SEL_CLASS);
    // Belt-and-suspenders: clear any stragglers in the editor.
    if (this._el) this._el.querySelectorAll('.' + SEL_CLASS).forEach((c) => c.classList.remove(SEL_CLASS));
  }

  /**
   * 16.7.6 — select every cell in the column containing `cell` (matches the
   * "click a column header" pattern in CKEditor/Jodit). Reuses the same
   * matrix + range machinery as drag-selection, so the selection is a normal
   * rectangular range every downstream op (merge/delete/properties) accepts.
   */
  selectColumn(cell) {
    const table = this._tableFrom(cell);
    if (!table) return;
    this._table = table;
    const m = buildMatrix(table);
    const coords = cellCoords(m, cell);
    if (!coords) return;
    const { rows } = matrixDimensions(m);
    this._apply(cellsInRange(m, 0, coords.col, rows - 1, coords.col));
  }

  /** 16.7.6 — select every cell in the row containing `cell`. */
  selectRow(cell) {
    const table = this._tableFrom(cell);
    if (!table) return;
    this._table = table;
    const m = buildMatrix(table);
    const coords = cellCoords(m, cell);
    if (!coords) return;
    const { cols } = matrixDimensions(m);
    this._apply(cellsInRange(m, coords.row, 0, coords.row, cols - 1));
  }

  /** Distinct selected cells (empty when there is no active range). */
  getSelectedCells() { return this._selected.slice(); }

  clear() {
    this._clearClasses();
    this._selected = [];
    this._startCell = null;
    this._table = null;
  }
}
