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
