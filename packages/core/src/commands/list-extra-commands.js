/**
 * Secondary list commands — listStyleType, setListStart, definitionList.
 * Split out of list-commands.js to keep both within the 300-line limit. These
 * are independent of the core toggle/indent/Tab/Enter logic and only touch list
 * attributes or insert a definition list.
 */

import { CommandManager } from './command-manager.js';
import { nearestList, placeCursor } from './list-dom.js';

function editorEl(editor)   { return editor.getEditorElement(); }
function getDoc(editor)     { return editor._iframeDoc || document; }
function getSelInfo(editor) { return editor.selection ? editor.selection.get() : null; }

// ─── listStyleType ────────────────────────────────────────────────────────────

const ALLOWED_STYLE_TYPES = new Set([
  'disc', 'circle', 'square', 'decimal', 'decimal-leading-zero',
  'lower-roman', 'upper-roman', 'lower-alpha', 'upper-alpha',
  'lower-latin', 'upper-latin', 'lower-greek', 'none',
]);
const OL_ONLY = new Set([
  'decimal', 'decimal-leading-zero', 'lower-roman', 'upper-roman',
  'lower-alpha', 'upper-alpha', 'lower-latin', 'upper-latin', 'lower-greek',
]);

export const listStyleTypeCommand = {
  execute(editor, value = 'disc', listEl) {
    if (!ALLOWED_STYLE_TYPES.has(value)) return;
    const list = listEl || nearestList(
      getSelInfo(editor) && getSelInfo(editor).startNode,
      editorEl(editor)
    );
    if (!list) return;
    const tag = list.tagName.toLowerCase();
    if (tag === 'ul' && OL_ONLY.has(value)) return;
    if (tag === 'ol' && (value === 'disc' || value === 'circle' || value === 'square')) return;
    list.style.listStyleType = value;
  },
};

export const setListStartCommand = {
  execute(editor, n = 1) {
    const info = getSelInfo(editor);
    if (!info) return;
    const list = nearestList(info.startNode, editorEl(editor));
    if (list && list.tagName.toLowerCase() === 'ol') {
      const parsed = parseInt(n, 10);
      // <ol start="0"> is valid HTML, so preserve 0 (and any non-negative
      // integer). Only a missing/NaN value defaults to 1; negatives clamp to 0.
      const safe = Number.isNaN(parsed) ? 1 : Math.max(0, parsed);
      list.setAttribute('start', String(safe));
    }
  },
};

export const definitionListCommand = {
  execute(editor) {
    const doc = getDoc(editor);
    const dl = doc.createElement('dl');
    const dt = doc.createElement('dt');
    const dd = doc.createElement('dd');
    // Empty, editable rows — do NOT inject literal "Term"/"Definition" text the
    // user would have to delete. A <br> keeps each row visible and focusable.
    dt.appendChild(doc.createElement('br'));
    dd.appendChild(doc.createElement('br'));
    dl.appendChild(dt);
    dl.appendChild(dd);
    if (editor.selection) editor.selection.insertAtCursor(dl);
    placeCursor(dt, editor);
    return CommandManager.SKIP_RESTORE;
  },
};
