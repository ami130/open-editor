/**
 * handleBlockquoteEnter — Jodit-style blockquote escape on Enter.
 *
 * Split out of block-commands.js to keep it within the 300-line limit. Wired
 * into the keydown handler in editor-events.js (NOT a registered command — it
 * runs before the default Enter behaviour).
 *
 * Two behaviours (returns true when it handled the event → caller preventDefaults):
 *   1. EMPTY last block + Enter → ESCAPE: remove the empty block, insert a new
 *      <p> after the blockquote, cursor there; if the quote emptied, drop it too.
 *   2. Any other Enter inside a quote → SPLIT IN PLACE: create an explicit new
 *      <p> sibling inside the quote (see splitInsideBlockquote) rather than let
 *      the browser decide (engines disagree — some exit, some inject a <div>).
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

/**
 * Split the current line INSIDE the blockquote into a new sibling block, so a
 * mid-quote Enter produces an explicit new paragraph within the quote rather
 * than deferring to the browser (which is inconsistent across engines). Handles
 * both an inner-block quote (<blockquote><p>…</p></blockquote>) and a bare-text
 * quote (<blockquote>…</blockquote>, where `block` IS the blockquote).
 */
function splitInsideBlockquote(editor, bq, block, info, doc) {
  // Capture the caret BEFORE any DOM mutation: moving nodes below shifts the
  // live selection range, so reading info.range.startOffset afterwards would
  // give the wrong split point (the whole line ends up on one side).
  const caretNode = info.range.startContainer;
  const caretOffset = info.range.startOffset;

  // Bare-text quote: wrap all existing content into a <p> first so we have a
  // concrete block to split, keeping the DOM shape uniform afterwards. The
  // caretNode (a text node) is moved, not replaced, so it stays valid.
  let target = block;
  if (block === bq) {
    const p = doc.createElement('p');
    while (bq.firstChild) p.appendChild(bq.firstChild);
    bq.appendChild(p);
    target = p;
  }

  const newTag = target.tagName.toLowerCase() === 'div' ? 'div' : 'p';
  const newBlock = doc.createElement(newTag);

  // Extract everything from the caret to the end of the current block into the
  // new block; the caret's own text node split point is respected.
  const splitRange = doc.createRange();
  splitRange.setStart(caretNode, caretOffset);
  splitRange.setEndAfter(target.lastChild || target);
  newBlock.appendChild(splitRange.extractContents());

  const isEmpty = (b) => (b.textContent || '').replace(/[\u200B\uFEFF]/g, '').trim() === ''
    && !b.querySelector('br,img,video,iframe');
  if (!target.firstChild || isEmpty(target)) {
    target.innerHTML = ''; target.appendChild(doc.createElement('br'));
  }
  if (!newBlock.firstChild || isEmpty(newBlock)) {
    newBlock.innerHTML = ''; newBlock.appendChild(doc.createElement('br'));
  }

  bq.insertBefore(newBlock, target.nextSibling);
  placeCursorAt(newBlock, editor);
  return true;
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

  // Find the direct block child of the bq that holds the cursor. walkUp stops
  // BEFORE the root, so with root=bq a bare-text quote (no inner <p>) yields
  // null — treat that as "the block is the blockquote itself".
  const block = getParentBlock(info.startNode, bq) || bq;

  const text = block === bq
    ? ''  // bare-text quote: never treat as the "empty last block" escape case
    : block.textContent.replace(/\u200B/g, '').trim();
  const hasOnlyBR = block !== bq && block.childNodes.length === 1 &&
                    block.firstChild.nodeType === 1 &&
                    block.firstChild.tagName.toLowerCase() === 'br';
  const isLast = block === bq.lastElementChild || block === bq.lastChild;
  const emptyEscape = block !== bq && isLast && (text === '' || hasOnlyBR);

  // MID-QUOTE Enter on NON-EMPTY content (Q4): split into a new sibling block
  // INSIDE the quote (an explicit <p>) instead of leaving it to the browser
  // (which inconsistently exits the quote or injects a <div> across engines).
  if (!emptyEscape) {
    return splitInsideBlockquote(editor, bq, block, info, doc);
  }

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
