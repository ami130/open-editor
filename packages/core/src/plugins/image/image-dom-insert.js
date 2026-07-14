/**
 * image-dom-insert.js — insertFigure() + its private block helpers, split out
 * of image-dom.js to keep that file under the 300-line limit (grew past it
 * when 16.7.8's responsive-<picture> factory was added). Pure DOM insertion
 * logic; no new behavior.
 */
import { _splitListAtLi } from './image-dom-list.js';

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

/**
 * Insert a figure after the block containing the cursor.
 * Places an empty <p> after the figure so the cursor has somewhere to land.
 */
export function insertFigure(editor, figure) {
  const root = editor.getEditorElement();
  const doc  = root.ownerDocument;

  // 9.5 — signal a broken image so the host app can surface a toast. Fires at
  // most once; the figure stays in the document (the user can fix/replace it).
  const insertedImg = figure.querySelector && figure.querySelector('img');
  if (insertedImg && typeof editor.emit === 'function') {
    insertedImg.addEventListener('error', () => {
      editor.emit('error', {
        error: new Error(`Image failed to load: ${insertedImg.getAttribute('src') || ''}`),
        context: 'plugin:image:loaderror',
      });
    }, { once: true });
  }

  // BUG-5 fix: snapshot BEFORE mutation so undo returns to pre-insert state
  editor.history && editor.history.takeSnapshot();

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
  try {
    const range = doc.createRange();
    range.setStart(afterP, 0);
    range.collapse(true);
    const domSel = doc.getSelection ? doc.getSelection() : null;
    if (domSel) { domSel.removeAllRanges(); domSel.addRange(range); }
  } catch { /* selection may fail in jsdom test env */ }

  // Update placeholder visibility and fire onChange since DOM was mutated directly
  if (typeof editor._updatePlaceholder === 'function') editor._updatePlaceholder();
  if (editor._onChangeFn) editor._onChangeFn();

  editor.emit('afterCommand', { command: 'insertImage', args: [] });
}
