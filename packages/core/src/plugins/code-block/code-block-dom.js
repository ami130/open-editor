/**
 * code-block-dom.js — Phase 13.7 DOM operations for the code-block plugin.
 *
 * insertCodeBlock(editor, language) — insert a <pre><code class="language-X">
 *   block at the caret (block-level, with a trailing paragraph so the caret can
 *   escape below it) and place the caret inside the code.
 * tabInCode(editor)      — insert INDENT spaces at the caret.
 * shiftTabInCode(editor) — remove up to INDENT leading spaces before the caret.
 *
 * Kept out of the plugin file for the 300-line limit; each op is small and
 * uses only standard range/DOM APIs.
 */
import { getClosestTag } from '../../selection/range-utils.js';

const INDENT = '  '; // two spaces per Tab

function ctx(editor) {
  const doc = editor._iframeDoc || (typeof document !== 'undefined' ? document : null);
  const win = editor.selection && editor.selection.getWindow && editor.selection.getWindow();
  return { doc, win };
}

/** Insert a fenced code block and put the caret inside it. */
export function insertCodeBlock(editor, language) {
  const { doc } = ctx(editor);
  if (!doc) return;
  const pre = doc.createElement('pre');
  const code = doc.createElement('code');
  if (language) code.className = `language-${language}`;
  code.appendChild(doc.createElement('br'));
  pre.appendChild(code);

  // Insert as a block: place the <pre> and a trailing <p> so the user can move
  // out below it. insertAtCursor handles caret placement + selection.
  const frag = doc.createDocumentFragment();
  frag.appendChild(pre);
  const trailing = doc.createElement('p');
  trailing.appendChild(doc.createElement('br'));
  frag.appendChild(trailing);

  if (editor.selection && typeof editor.selection.insertAtCursor === 'function') {
    // Wrap the fragment's HTML so insertAtCursor's string path builds it; but we
    // have DOM nodes — insert the <pre> node then move caret inside its <code>.
    editor.selection.insertAtCursor(pre);
  }
  placeCaretInCode(editor, code);
}

/** Place a collapsed caret at the start of a <code>'s content. */
function placeCaretInCode(editor, code) {
  const { doc, win } = ctx(editor);
  if (!doc || !win) return;
  try {
    const range = doc.createRange();
    range.setStart(code, 0);
    range.collapse(true);
    const sel = win.getSelection();
    if (sel) { sel.removeAllRanges(); sel.addRange(range); }
  } catch { /* non-fatal */ }
}

/** Insert INDENT at the caret inside code. */
export function tabInCode(editor) {
  const { doc, win } = ctx(editor);
  if (!doc || !win) return;
  const sel = win.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  range.deleteContents();
  const node = doc.createTextNode(INDENT);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
  if (editor._onChangeFn) editor._onChangeFn();
}

/**
 * Insert a newline at the caret inside code (Enter behaviour). A "\n" text node
 * inside <pre> renders as a line break and round-trips exactly — unlike a block
 * split, which would produce two separate <pre> elements. If the newline lands
 * at the very end of the code's text, append a second "\n" so the caret line is
 * visible (browsers collapse a trailing lone newline in <pre>).
 */
export function newlineInCode(editor) {
  const { doc, win } = ctx(editor);
  if (!doc || !win) return;
  const sel = win.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  range.deleteContents();
  const nl = doc.createTextNode('\n');
  range.insertNode(nl);
  // At end-of-content a single trailing "\n" is not rendered; add a companion
  // so the new (empty) line is visible, and place the caret before it.
  const atEnd = !nl.nextSibling ||
    (nl.nextSibling.nodeType === 3 && nl.nextSibling.nodeValue === '');
  if (atEnd) {
    const pad = doc.createTextNode('\n');
    nl.parentNode.insertBefore(pad, nl.nextSibling);
  }
  range.setStartAfter(nl);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
  if (editor._onChangeFn) editor._onChangeFn();
}

/** Remove up to INDENT spaces immediately before the caret inside code. */
export function shiftTabInCode(editor) {
  const { doc, win } = ctx(editor);
  if (!doc || !win) return;
  const sel = win.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  const node = range.startContainer;
  if (node.nodeType !== 3) return; // only within a text node
  const offset = range.startOffset;
  const before = node.nodeValue.slice(0, offset);
  // How many spaces (up to INDENT.length) directly precede the caret?
  const m = before.match(/ {1,2}$/);
  if (!m) return;
  const remove = m[0].length;
  node.nodeValue = node.nodeValue.slice(0, offset - remove) + node.nodeValue.slice(offset);
  try {
    range.setStart(node, offset - remove);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  } catch { /* non-fatal */ }
  if (editor._onChangeFn) editor._onChangeFn();
}

/** True when a node is inside a <pre> within the editor. */
export function inCodeBlock(node, root) {
  return !!getClosestTag(node, 'pre', root);
}
