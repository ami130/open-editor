/**
 * image-link-prompt.js — the "Add / edit link" modal for a selected image
 * (9.16). Split out of image-selection.js to keep it under the 300-line limit.
 * Calls onApplied() after wrapping the figure in a link so the caller can
 * re-emit change/selection.
 */
import { wrapInLink } from './image-dom.js';

export function promptImageLink(editor, fig, onApplied) {
  if (!editor || !editor.ui || !editor.ui.modal) return;
  const doc = editor._wrapper.ownerDocument;

  const wrap = doc.createElement('div');
  wrap.className = 'oe-img-dialog__field';
  const lbl = doc.createElement('label');
  lbl.textContent = 'Link URL';
  lbl.setAttribute('for', 'oe-img-link-url');
  lbl.className = 'oe-img-dialog__label';
  const inp = doc.createElement('input');
  inp.id = 'oe-img-link-url';
  inp.type = 'url';
  inp.className = 'oe-img-dialog__input';
  inp.placeholder = 'https://…';
  const existingA = fig.querySelector('img') && fig.querySelector('img').closest('a');
  if (existingA) inp.value = existingA.href;
  wrap.appendChild(lbl);
  wrap.appendChild(inp);

  editor.ui.modal.open({
    title: 'Image link',
    body: wrap,
    buttons: [
      { label: 'Cancel', value: null },
      { label: 'Apply', value: 'apply', variant: 'primary' },
    ],
  }).then((val) => {
    if (val === 'apply' && inp.value.trim()) {
      // Snapshot BEFORE wrapping so undo cleanly removes/restores the link in one
      // step. onApplied() emits afterCommand, which captures the POST-wrap state;
      // without this pre-snapshot the link was not its own undo step (every other
      // image mutation snapshots first — see image-dom-insert / keyboard-resize).
      if (editor.history && editor.history.takeSnapshot) editor.history.takeSnapshot();
      wrapInLink(fig, inp.value.trim());
      if (typeof onApplied === 'function') onApplied();
    }
  });
}
