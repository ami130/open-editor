/**
 * handleBlockquoteEnter — Jodit-style blockquote escape on Enter.
 *
 * Split out of block-commands.js to keep it within the 300-line limit. Wired
 * into the keydown handler in editor-events.js (NOT a registered command — it
 * runs before the default Enter behaviour).
 *
 * When the cursor is on the LAST block inside a blockquote AND that block is
 * empty (just a <br> or no text), pressing Enter escapes the blockquote:
 *   • removes the empty block from the blockquote
 *   • inserts a new <p> immediately after the blockquote
 *   • places the cursor in that <p>
 * If the blockquote becomes empty after removal, it is removed too.
 * Returns true when it handled the event (caller should preventDefault).
 */

import { walkUp, getParentBlock } from '../selection/range-utils.js';

function editorEl(editor) { return editor.getEditorElement(); }
function getDoc(editor)   { return editor._iframeDoc || document; }
function getSelInfo(editor) { return editor.selection ? editor.selection.get() : null; }

function placeCursorAt(node, editor) {
  const win = editor.selection && editor.selection.getWindow();
  if (!win) return;
  const doc = editor._iframeDoc || document;
  const range = doc.createRange();
  range.setStart(node, 0);
  range.collapse(true);
  const sel = win.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

export function handleBlockquoteEnter(editor) {
  if (!editor || (editor._state && editor._state.isReadOnly)) return false;

  const info = getSelInfo(editor);
  if (!info || !info.collapsed) return false;

  const root = editorEl(editor);
  const doc  = getDoc(editor);

  // Must be inside a blockquote
  const bq = walkUp(info.startNode, root,
    (n) => n.nodeType === 1 && n.tagName.toLowerCase() === 'blockquote'
  );
  if (!bq) return false;

  // Find the direct block child of the bq that holds the cursor
  const block = getParentBlock(info.startNode, bq);
  if (!block || block === bq) return false;

  // Must be the LAST direct child of the blockquote
  if (block !== bq.lastElementChild && block !== bq.lastChild) return false;

  // Block must be empty (only whitespace / <br>)
  const text = block.textContent.replace(/\u200B/g, '').trim();
  const hasOnlyBR = block.childNodes.length === 1 &&
                    block.firstChild.nodeType === 1 &&
                    block.firstChild.tagName.toLowerCase() === 'br';
  if (text !== '' && !hasOnlyBR) return false;

  // Capture the blockquote's position in the tree BEFORE any removal, so the
  // new paragraph lands exactly where the blockquote was — even when the
  // blockquote is nested inside another element (e.g. a <div>). Reading
  // bq.parentNode AFTER removing bq would yield null and dump the <p> at root.
  const bqParent  = bq.parentNode;
  const bqNextSib = bq.nextSibling;

  // Remove the empty trailing block
  bq.removeChild(block);

  // If blockquote is now empty, remove it too
  const bqEmptied = !bq.firstChild || bq.textContent.trim() === '';
  if (bqEmptied && bq.parentNode) bq.parentNode.removeChild(bq);

  // Insert new <p> immediately after where the blockquote was.
  const p = doc.createElement('p');
  p.appendChild(doc.createElement('br'));

  if (bqParent) {
    // If the bq still exists (not emptied), insert after it; otherwise insert at
    // the captured sibling position within the original parent.
    const ref = bqEmptied ? bqNextSib : bq.nextSibling;
    bqParent.insertBefore(p, ref);
  } else {
    root.appendChild(p);
  }

  placeCursorAt(p, editor);
  return true;
}
