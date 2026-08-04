/**
 * image-keyboard-resize.js — keyboard operations on a selected image island
 * (arrow-resize, type-to-replace, delete). Split out of image-selection.js to
 * keep it under the 300-line limit. Each mutates the editor as asked.
 */
import { ensureEditorFloor } from '../../editing/block-editing.js';

/**
 * Arrow-key resize: Right/Left change width, Up/Down change height; aspect ratio
 * is preserved by deriving the other axis. Shift = 10px step, else 1px. Min 20px.
 */
export function keyboardResizeImage(editor, figure, e) {
  const img = figure && figure.querySelector('img');
  if (!img) return false;
  const step = e.shiftKey ? 10 : 1;
  const rect = img.getBoundingClientRect();
  let w = Math.round(rect.width) || img.naturalWidth || parseInt(img.getAttribute('width'), 10) || 0;
  let h = Math.round(rect.height) || img.naturalHeight || parseInt(img.getAttribute('height'), 10) || 0;
  if (!w || !h) return false;
  const ratio = w / h;
  const cw = (v) => Math.min(8000, Math.max(20, v));   // IMG19 min/max clamp
  const ch = (v) => Math.min(8000, Math.max(20, v));
  if (e.key === 'ArrowRight')      w = cw(w + step);
  else if (e.key === 'ArrowLeft')  w = cw(w - step);
  else if (e.key === 'ArrowDown')  h = ch(h + step);
  else if (e.key === 'ArrowUp')    h = ch(h - step);
  else return false;
  // Keep aspect ratio: derive the axis that wasn't directly changed.
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') h = ch(Math.round(w / ratio));
  else w = cw(Math.round(h * ratio));

  if (editor && editor.history && editor.history.takeSnapshot) editor.history.takeSnapshot();
  img.style.width  = `${w}px`;
  img.style.height = `${h}px`;
  img.setAttribute('width',  String(w));
  img.setAttribute('height', String(h));
  if (editor) {
    editor.emit('imageSelected', { figure }); // reposition overlay + action bar
    if (editor._onChangeFn) editor._onChangeFn();
    // Snapshot the POST-resize state (mirrors the mouse-drag path's 'resizeImage'
    // afterCommand) so undo/redo step through the resize cleanly rather than
    // skipping past it. takeSnapshot() above only captured the pre-resize size.
    editor.emit('afterCommand', { command: 'keyboardResizeImage', args: [],
      announce: `Image resized to ${w} by ${h} pixels` });
  }
  return true;
}

/**
 * IMG20: replace a selected image figure with a paragraph containing `char`,
 * caret after it (typing over a selected object replaces it — Docs/Word). Returns
 * true if it replaced. Snapshots first so undo restores the image.
 */
export function replaceFigureWithText(editor, figure, char) {
  if (!editor || !figure || !figure.parentNode) return false;
  const doc = (editor._iframeDoc) || (figure.ownerDocument) || document;
  if (editor.history && editor.history.takeSnapshot) editor.history.takeSnapshot();
  const p = doc.createElement('p');
  const text = doc.createTextNode(char);
  p.appendChild(text);
  figure.parentNode.replaceChild(p, figure);
  // Place the caret after the typed character.
  try {
    const win = (editor.selection && editor.selection.getWindow && editor.selection.getWindow())
      || doc.defaultView;
    const range = doc.createRange();
    range.setStart(text, text.length);
    range.collapse(true);
    const sel = win && win.getSelection();
    if (sel) { sel.removeAllRanges(); sel.addRange(range); }
  } catch { /* selection unavailable */ }
  if (editor._onChangeFn) editor._onChangeFn();
  // Emit afterCommand so HistoryManager snapshots the POST-replace state too.
  // takeSnapshot() above only records the pre-replace (image) state; without this
  // trailing snapshot, one undo would skip past the image to the prior state and
  // the image could never be restored. Mirrors deleteFigureFromDoc's afterCommand.
  if (typeof editor.emit === 'function') {
    editor.emit('afterCommand', { command: 'replaceImageWithText', args: [] });
  }
  return true;
}

/**
 * IMG17: focus the figure's caption so it can be typed, creating one if the
 * figure has none (older pasted content). Places the caret at the caption end.
 * Returns true if a caption was focused.
 */
export function focusCaption(editor, figure) {
  if (!figure) return false;
  const doc = figure.ownerDocument || document;
  let cap = figure.querySelector('figcaption[data-oe-caption]')
    || figure.querySelector('figcaption');
  if (!cap) {
    if (editor && editor.history && editor.history.takeSnapshot) editor.history.takeSnapshot();
    cap = doc.createElement('figcaption');
    cap.setAttribute('contenteditable', 'true');
    cap.setAttribute('data-oe-caption', '');
    figure.appendChild(cap);
    if (editor && editor._onChangeFn) editor._onChangeFn();
  }
  try { if (cap.focus) cap.focus(); } catch { /* focus unavailable */ }
  try {
    const win = doc.defaultView;
    const range = doc.createRange();
    range.selectNodeContents(cap);
    range.collapse(false);                 // caret at end of any existing text
    const sel = win && win.getSelection();
    if (sel) { sel.removeAllRanges(); sel.addRange(range); }
  } catch { /* selection unavailable */ }
  return true;
}

/**
 * Remove a figure from the document: snapshot for undo, place the caret at a
 * sensible neighbour (prev sibling / next / parent), restore the empty-editor
 * floor, and fire change. Caller is expected to have deselected already.
 */
export function deleteFigureFromDoc(editor, fig) {
  if (!fig) return;
  if (editor && editor.history && editor.history.takeSnapshot) editor.history.takeSnapshot();
  if (editor) {
    try {
      const doc = fig.ownerDocument;
      const prev = fig.previousElementSibling;
      const next = fig.nextElementSibling;
      const range = doc.createRange();
      if (prev)       range.setStartAfter(prev);
      else if (next)  range.setStart(next, 0);
      else            range.setStart(fig.parentNode, 0);
      range.collapse(true);
      const domSel = doc.getSelection ? doc.getSelection() : null;
      if (domSel) { domSel.removeAllRanges(); domSel.addRange(range); }
    } catch { /* selection placement failure is non-fatal */ }
  }
  if (fig.parentNode) fig.parentNode.removeChild(fig);
  if (editor) {
    ensureEditorFloor(editor);
    editor.emit('afterCommand', { command: 'deleteImage', args: [], announce: 'Image deleted' });
  }
}
