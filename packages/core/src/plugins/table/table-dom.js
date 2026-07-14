/**
 * table-dom.js — DOM factory + insertion for the Table plugin (11.2).
 *
 * createTable() builds a clean, semantic <table>: an optional <caption>, a
 * <colgroup> with one <col> per column (equal % widths — the basis for column
 * resize), a <tbody> of <tr>, and cells that each contain a <br> so they have
 * height and a caret target. insertTable() places it at the cursor as a
 * block-level island (never nested inside an inline element) and drops the
 * caret into the first cell. Structural editing ops live in table-ops.js and
 * are expressed against the formal matrix (table-matrix.js).
 */

const MIN = 1;
const MAX = 50; // guard against absurd NxM from a malformed grid-picker value

function clampDim(n) {
  const v = parseInt(n, 10);
  if (!Number.isFinite(v)) return MIN;
  return Math.max(MIN, Math.min(MAX, v));
}

/** A fresh editable cell: <td> (or <th>) containing a single <br>. */
function makeCell(doc, tag) {
  const cell = doc.createElement(tag);
  cell.appendChild(doc.createElement('br'));
  return cell;
}

/**
 * Build a clean table.
 * opts: { headerRow?:bool, caption?:string, className?:string }
 * Column widths are distributed equally via <col style="width:%">.
 */
export function createTable(doc, rows, cols, opts = {}) {
  const nRows = clampDim(rows);
  const nCols = clampDim(cols);

  const table = doc.createElement('table');
  table.className = ('oe-table ' + (opts.className || '')).trim();

  if (opts.caption) {
    const cap = doc.createElement('caption');
    cap.textContent = opts.caption;
    table.appendChild(cap);
  }

  // <colgroup> with equal-width columns (rounded so they sum to ~100%).
  const colgroup = doc.createElement('colgroup');
  const w = (100 / nCols);
  for (let c = 0; c < nCols; c++) {
    const col = doc.createElement('col');
    col.style.width = `${w.toFixed(4)}%`;
    colgroup.appendChild(col);
  }
  table.appendChild(colgroup);

  const tbody = doc.createElement('tbody');
  for (let r = 0; r < nRows; r++) {
    const tr = doc.createElement('tr');
    const isHeader = opts.headerRow && r === 0;
    for (let c = 0; c < nCols; c++) {
      const cell = makeCell(doc, isHeader ? 'th' : 'td');
      if (isHeader) cell.setAttribute('scope', 'col');
      tr.appendChild(cell);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  return table;
}

/** Deepest first cell of a table (for initial caret placement). */
export function firstCell(table) {
  return table.querySelector('td, th');
}

/**
 * Insert a table at the cursor as a block-level island, place the caret in the
 * first cell, and add a trailing <p> so there is always an editable line after
 * the table (mirrors insertFigure's floor guarantee).
 */
export function insertTable(editor, table) {
  const root = editor.getEditorElement();
  const doc  = root.ownerDocument;

  editor.history && editor.history.takeSnapshot();

  // Find the nearest direct child of root at the cursor; fall back to last child.
  let anchorBlock = null;
  const sel = editor.selection && editor.selection.get();
  if (sel && sel.startNode) {
    let node = sel.startNode;
    while (node && node !== root) {
      if (node.parentNode === root) { anchorBlock = node; break; }
      node = node.parentNode;
    }
  }
  if (!anchorBlock) anchorBlock = root.lastElementChild;

  if (anchorBlock && anchorBlock.parentNode === root) {
    anchorBlock.after(table);
  } else {
    root.appendChild(table);
  }

  // Always keep an editable line after the table.
  let afterP = table.nextElementSibling;
  if (!afterP || afterP.tagName.toLowerCase() === 'table') {
    afterP = doc.createElement('p');
    afterP.appendChild(doc.createElement('br'));
    table.after(afterP);
  }

  // Caret into the first cell.
  const cell = firstCell(table);
  if (cell) {
    try {
      const range = doc.createRange();
      range.setStart(cell, 0);
      range.collapse(true);
      const domSel = doc.getSelection ? doc.getSelection() : null;
      if (domSel) { domSel.removeAllRanges(); domSel.addRange(range); }
    } catch { /* selection may fail in jsdom */ }
  }

  if (typeof editor._updatePlaceholder === 'function') editor._updatePlaceholder();
  if (editor._onChangeFn) editor._onChangeFn();
  editor.emit('afterCommand', { command: 'insertTable', args: [] });
}
