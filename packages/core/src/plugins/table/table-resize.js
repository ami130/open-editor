/**
 * table-resize.js — column resize by dragging a cell border (11.8).
 *
 * The pure width math lives in `resizeColumn` (testable without any drag): it
 * shifts width between column `i` and its right neighbour `i+1` by `deltaPx`,
 * keeping the row total constant so the table doesn't grow/shrink. Widths are
 * stored on the <colgroup>'s <col> elements as percentages.
 *
 * TableResizeManager wires the drag: on mousedown/touchstart near a column
 * border it tracks the pointer and calls resizeColumn on move (mouse AND touch,
 * matching the image-resize pattern). Clean listener teardown in destroy().
 */
import { buildMatrix, cellCoords, colSpan } from './table-matrix.js';

const MIN_PCT = 4; // never shrink a column below this % of the table

/** The <col> elements of a table's colgroup (may be empty). */
function cols(table) {
  const cg = table.querySelector('colgroup');
  return cg ? Array.from(cg.children) : [];
}

/** Read a <col>'s width as a number of percent (falls back to equal split). */
function pctOf(col, fallback) {
  const m = (col.style.width || '').match(/([\d.]+)%/);
  return m ? parseFloat(m[1]) : fallback;
}

/**
 * Shift width between column `i` and `i+1` by `deltaPx` (positive grows `i`).
 * `tableWidthPx` converts the pixel delta to a percentage. The pair's combined
 * width is preserved, so only those two columns change. No-op on the last column
 * (nothing to borrow from) or when either would drop below MIN_PCT.
 */
export function resizeColumn(table, i, deltaPx, tableWidthPx) {
  const list = cols(table);
  if (i < 0 || i >= list.length - 1) return; // need a right neighbour
  const w = tableWidthPx > 0 ? tableWidthPx : 1;
  const eq = 100 / list.length;
  const a = pctOf(list[i], eq);
  const b = pctOf(list[i + 1], eq);
  const deltaPct = (deltaPx / w) * 100;
  const na = a + deltaPct;
  const nb = b - deltaPct;
  if (na < MIN_PCT || nb < MIN_PCT) return; // clamp — don't collapse a column
  list[i].style.width = `${na.toFixed(4)}%`;
  list[i + 1].style.width = `${nb.toFixed(4)}%`;
}

export class TableResizeManager {
  constructor() {
    this._editor = null;
    this._drag = null;
  }

  install(editor) {
    this._editor = editor;
    const el = editor.getEditorElement && editor.getEditorElement();
    if (!el) return;
    this._el = el;
    this._onDown = (e) => this._start(e);
    el.addEventListener('mousedown', this._onDown);
    el.addEventListener('touchstart', this._onDown, { passive: false });
  }

  destroy() {
    if (this._el) {
      this._el.removeEventListener('mousedown', this._onDown);
      this._el.removeEventListener('touchstart', this._onDown);
    }
    this._cancel();
    this._editor = this._el = null;
  }

  _point(e) {
    if (e.touches && e.touches.length) return { x: e.touches[0].clientX };
    return { x: e.clientX };
  }

  // A mousedown counts as a resize grab only when the pointer is within EDGE px
  // of a cell's RIGHT border (so normal cell clicks are unaffected).
  _start(e) {
    const cell = e.target && e.target.closest ? e.target.closest('td, th') : null;
    if (!cell) return;
    const table = cell.closest('table');
    if (!table) return;
    const rect = cell.getBoundingClientRect();
    const px = this._point(e).x;
    const EDGE = 6;
    if (px < rect.right - EDGE) return; // not near the right border → let it be
    // The LOGICAL column the cell's right border sits on — via the formal matrix,
    // not the DOM cell index (they diverge in rows containing colspan/rowspan).
    // A cell that spans N columns controls the border of its last spanned column.
    const at = cellCoords(buildMatrix(table), cell);
    if (!at) return;
    const colIndex = at.col + colSpan(cell) - 1;
    if (colIndex < 0 || colIndex >= cols(table).length - 1) return;
    e.preventDefault();
    this._drag = { table, colIndex, startX: px, tableWidth: table.getBoundingClientRect().width };
    const doc = this._el.ownerDocument;
    this._onMove = (mv) => this._move(mv);
    this._onUp = () => this._cancel();
    doc.addEventListener('mousemove', this._onMove);
    doc.addEventListener('mouseup', this._onUp);
    doc.addEventListener('touchmove', this._onMove, { passive: false });
    doc.addEventListener('touchend', this._onUp);
    if (this._editor.history) this._editor.history.takeSnapshot();
  }

  _move(e) {
    if (!this._drag) return;
    if (e.cancelable && e.touches) e.preventDefault();
    const dx = this._point(e).x - this._drag.startX;
    resizeColumn(this._drag.table, this._drag.colIndex, dx, this._drag.tableWidth);
  }

  _cancel() {
    const doc = this._el && this._el.ownerDocument;
    if (doc && this._onMove) {
      doc.removeEventListener('mousemove', this._onMove);
      doc.removeEventListener('touchmove', this._onMove);
    }
    if (doc && this._onUp) {
      doc.removeEventListener('mouseup', this._onUp);
      doc.removeEventListener('touchend', this._onUp);
    }
    if (this._drag && this._editor) {
      this._editor.emit('afterCommand', { command: 'tableResizeColumn', args: [] });
      if (this._editor._onChangeFn) this._editor._onChangeFn();
    }
    this._drag = null;
    this._onMove = this._onUp = null;
  }
}
