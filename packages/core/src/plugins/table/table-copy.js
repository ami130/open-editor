/**
 * table-copy.js — copy a table to the clipboard as clean HTML (11.15).
 *
 * serializeTable(table)  — pure: returns a clean HTML string for the table,
 *                          runnable/testable without a clipboard. Drops editor-
 *                          only artifacts (the oe-* helper classes, the trailing
 *                          <br> placeholders inside otherwise-empty cells) so the
 *                          output pastes cleanly into Word / other editors.
 * copyTable(editor,table) — async: writes text/html to the clipboard via the
 *                          async Clipboard API when available, else falls back to
 *                          copyToClipboard() (plain-text of the HTML). Resolves a
 *                          boolean; never throws.
 */
import { copyToClipboard } from '../../utils/clipboard.js';
import { buildMatrix, cellCoords } from './table-matrix.js';

/**
 * T6: build a standalone <table> HTML string + a TSV string from a selected cell
 * RANGE (the rectangle bounding the given cells). Returns { html, tsv } — html for
 * rich targets (Word/another editor), tsv for spreadsheets/plain-text. Editor-only
 * classes and caret-placeholder <br>s are stripped, mirroring serializeTable.
 */
export function serializeCellRange(table, cells) {
  if (!table || !cells || !cells.length) return null;
  const m = buildMatrix(table);
  let minR = Infinity, minC = Infinity, maxR = -1, maxC = -1;
  for (const cell of cells) {
    const co = cellCoords(m, cell);
    if (!co) continue;
    if (co.row < minR) minR = co.row;
    if (co.col < minC) minC = co.col;
    if (co.row > maxR) maxR = co.row;
    if (co.col > maxC) maxC = co.col;
  }
  if (maxR < 0) return null;
  const doc = table.ownerDocument;
  const out = doc.createElement('table');
  const tbody = doc.createElement('tbody');
  const tsvRows = [];
  const seen = new Set();
  for (let r = minR; r <= maxR; r++) {
    const tr = doc.createElement('tr');
    const tsvCells = [];
    for (let c = minC; c <= maxC; c++) {
      const src = m[r] && m[r][c];
      if (!src) { tsvCells.push(''); continue; }
      // A spanning cell appears once (at its origin) — skip its repeats.
      if (seen.has(src)) continue;
      seen.add(src);
      const clone = src.cloneNode(true);
      clone.querySelectorAll && clone.classList && clone.classList.remove('oe-cell--selected');
      if (clone.childNodes.length === 1 && clone.firstChild.nodeName === 'BR') clone.removeChild(clone.firstChild);
      tr.appendChild(clone);
      tsvCells.push((src.textContent || '').replace(/\s+/g, ' ').trim());
    }
    if (tr.children.length) tbody.appendChild(tr);
    tsvRows.push(tsvCells.join('\t'));
  }
  out.appendChild(tbody);
  return { html: out.outerHTML, tsv: tsvRows.join('\n') };
}

/** Clean, standalone HTML string for the table (no editor-only cruft). */
export function serializeTable(table) {
  if (!table) return '';
  const clone = table.cloneNode(true);

  // Strip the editor's own helper classes; keep author/preset classes.
  const EDITOR_CLASSES = new Set(['oe-table', 'oe-cell--selected']);
  clone.querySelectorAll('[class]').forEach((el) => {
    const kept = (el.getAttribute('class') || '')
      .split(/\s+/).filter((c) => c && !EDITOR_CLASSES.has(c));
    if (kept.length) el.setAttribute('class', kept.join(' '));
    else el.removeAttribute('class');
  });
  if (clone.classList) {
    for (const c of Array.from(clone.classList)) if (EDITOR_CLASSES.has(c)) clone.classList.remove(c);
    if (!clone.getAttribute('class')) clone.removeAttribute('class');
  }

  // A lone <br> that was only a caret placeholder in an empty cell is noise on
  // paste — remove it when it's the cell's only child.
  clone.querySelectorAll('td, th').forEach((cell) => {
    if (cell.childNodes.length === 1 && cell.firstChild.nodeName === 'BR') {
      cell.removeChild(cell.firstChild);
    }
  });

  return clone.outerHTML;
}

/**
 * Copy the table. Prefers writing text/html (so Word / other rich editors get
 * a real table); falls back to plain text of the same HTML. Never throws.
 */
export async function copyTable(editor, table) {
  const html = serializeTable(table);
  if (!html) return false;

  // Async Clipboard API with a rich HTML payload (best fidelity).
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard &&
        typeof navigator.clipboard.write === 'function' &&
        typeof ClipboardItem !== 'undefined' && typeof Blob !== 'undefined') {
      const item = new ClipboardItem({
        'text/html':  new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([table.textContent || ''], { type: 'text/plain' }),
      });
      await navigator.clipboard.write([item]);
      return true;
    }
  } catch { /* fall through to the text fallback */ }

  const doc = (editor && editor._wrapper && editor._wrapper.ownerDocument) || undefined;
  return copyToClipboard(html, doc);
}
