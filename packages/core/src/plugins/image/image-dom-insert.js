/**
 * image-dom-insert.js — insertFigure() + its private block helpers, split out
 * of image-dom.js to keep that file under the 300-line limit (grew past it
 * when 16.7.8's responsive-<picture> factory was added). Pure DOM insertion
 * logic; no new behavior.
 */
import { _splitListAtLi } from './image-dom-list.js';
import { imageError } from './image-feedback.js';

/** Returns true when a block contains no meaningful text (only <br> or whitespace). */
function _isEmptyBlock(el) {
  const text = el.textContent || '';
  if (text.trim().length > 0) return false;
  // Must have no element children other than a single <br>
  const els = el.querySelectorAll('*');
  if (els.length === 0) return true;
  if (els.length === 1 && els[0].tagName.toLowerCase() === 'br') return true;
  return false;
}

/** Returns the deepest first-child node of el (text or element). */
function _deepFirst(el) {
  let node = el;
  while (node.firstChild) node = node.firstChild;
  return node;
}

/** Collapse the selection to the start of `el` (no-op if selection unavailable). */
function _placeCaretAtStart(doc, el) {
  try {
    const range = doc.createRange();
    range.setStart(el, 0);
    range.collapse(true);
    const domSel = doc.getSelection ? doc.getSelection() : null;
    if (domSel) { domSel.removeAllRanges(); domSel.addRange(range); }
  } catch { /* selection may fail in jsdom test env */ }
}

/**
 * Insert a figure after the block containing the cursor.
 * Places an empty <p> after the figure so the cursor has somewhere to land.
 */
export function insertFigure(editor, figure) {
  const root = editor.getEditorElement();
  const doc  = root.ownerDocument;

  // IMG13: a broken image (404 / non-image URL / decode failure) now surfaces a
  // user-visible toast — was emit('error') only, silent unless the host listened.
  // Fires at most once; the figure stays so the user can fix/replace its src.
  const insertedImg = figure.querySelector && figure.querySelector('img');
  if (insertedImg && typeof editor.emit === 'function') {
    insertedImg.addEventListener('error', () => {
      imageError(editor,
        'This image could not be loaded — check the URL or replace it.',
        'plugin:image:loaderror');
    }, { once: true });
  }

  // BUG-5 fix: snapshot BEFORE mutation so undo returns to pre-insert state
  editor.history && editor.history.takeSnapshot();

  // Table-cell branch: if the caret is inside a <td>/<th>, insert INTO that cell
  // (the figure escaping the whole table was surprising). Append the figure to the
  // cell, ensure a <p> after it for the caret, and stop — never walk up to root.
  const sel0 = editor.selection && editor.selection.get();
  if (sel0 && sel0.startNode) {
    const startEl = sel0.startNode.nodeType === 1 ? sel0.startNode : sel0.startNode.parentElement;
    const cell = startEl && startEl.closest ? startEl.closest('td,th') : null;
    if (cell && root.contains(cell)) {
      cell.appendChild(figure);
      let afterP = figure.nextElementSibling;
      if (!afterP || afterP.tagName.toLowerCase() === 'figure') {
        afterP = doc.createElement('p');
        afterP.appendChild(doc.createElement('br'));
        figure.after(afterP);
      }
      _placeCaretAtStart(doc, afterP);
      if (typeof editor._updatePlaceholder === 'function') editor._updatePlaceholder();
      if (editor._onChangeFn) editor._onChangeFn();
      editor.emit('afterCommand', { command: 'insertImage', args: [] });
      return;
    }
  }

  // Find the block at the cursor — walk up from startNode to a direct child of root.
  // Falls back to the last direct child, then appends to root if both fail.
  let anchorBlock = null;
  let selOffsetAtStart = false;
  const sel = editor.selection && editor.selection.get();
  if (sel && sel.startNode) {
    let node = sel.startNode;
    while (node && node !== root) {
      if (node.parentNode === root) { anchorBlock = node; break; }
      node = node.parentNode;
    }
    // BUG-1/2 fix: detect when cursor is at offset 0 within the block
    if (anchorBlock) {
      const startNode = sel.startNode;
      const startOff  = sel.startOffset;
      // Cursor at block start when: startNode IS the block at offset 0,
      // or startNode is block's first text node/child at offset 0
      const deepFirst = _deepFirst(anchorBlock);
      selOffsetAtStart = (startOff === 0) && (
        startNode === anchorBlock ||
        startNode === deepFirst
      );
    }
  }
  if (!anchorBlock) anchorBlock = root.lastElementChild;

  if (anchorBlock && anchorBlock.parentNode === root) {
    const tag = anchorBlock.tagName.toLowerCase();
    const isList = tag === 'ul' || tag === 'ol';

    if (isList && sel && sel.startNode) {
      // Find the specific <li> containing the cursor
      let liNode = sel.startNode;
      while (liNode && liNode !== anchorBlock) {
        if (liNode.parentNode === anchorBlock) break;
        liNode = liNode.parentNode;
      }
      if (liNode && liNode.parentNode === anchorBlock &&
          liNode.tagName.toLowerCase() === 'li') {
        const { before, after } = _splitListAtLi(anchorBlock, liNode, doc);
        if (before) {
          before.after(figure);
        } else {
          anchorBlock.before(figure);
          if (anchorBlock.children.length === 0) {
            anchorBlock.parentNode && anchorBlock.parentNode.removeChild(anchorBlock);
          }
        }
        if (after && figure.parentNode) {
          figure.after(after);
        }
      } else {
        // Couldn't find li — fall back to after-list
        anchorBlock.after(figure);
      }
    } else {
      const isEmpty = _isEmptyBlock(anchorBlock);
      if (isEmpty) {
        anchorBlock.before(figure);
        anchorBlock.parentNode && anchorBlock.parentNode.removeChild(anchorBlock);
      } else if (selOffsetAtStart) {
        anchorBlock.before(figure);
      } else {
        anchorBlock.after(figure);
      }
    }
  } else {
    root.appendChild(figure);
  }

  // Always ensure a <p> after the figure so the cursor has a text node to land on
  let afterP = figure.nextElementSibling;
  if (!afterP || afterP.tagName.toLowerCase() === 'figure') {
    afterP = doc.createElement('p');
    afterP.appendChild(doc.createElement('br'));
    figure.after(afterP);
  }

  // Place cursor inside the <p> after the figure
  _placeCaretAtStart(doc, afterP);

  // Update placeholder visibility and fire onChange since DOM was mutated directly
  if (typeof editor._updatePlaceholder === 'function') editor._updatePlaceholder();
  if (editor._onChangeFn) editor._onChangeFn();

  editor.emit('afterCommand', { command: 'insertImage', args: [] });
}
