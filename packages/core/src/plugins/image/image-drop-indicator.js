/**
 * image-drop-indicator.js — IMG15: a thin caret line showing WHERE a dragged
 * image file will land, updated live on dragover. Without it the drop point is
 * invisible until release, so users guess (and often drop in the wrong place).
 *
 * The line is derived from the same caret the drop uses (caretRangeFromPoint /
 * caretPositionFromPoint), so what the user sees is exactly where it inserts.
 * It's a wrapper-level overlay element (never in getHTML) positioned relative to
 * the editor wrapper, mirroring block-drag's oe-block-drop-indicator.
 */

export class ImageDropIndicator {
  constructor(editor) {
    this._editor = editor;
    this._el = null;
    const wrapper = editor && editor._wrapper;
    if (!wrapper) return;
    const doc = wrapper.ownerDocument || document;
    const el = doc.createElement('div');
    el.className = 'oe-img-drop-indicator';
    el.hidden = true;
    // Purely decorative; keep it out of the a11y tree and off pointer hit-testing.
    el.setAttribute('aria-hidden', 'true');
    wrapper.appendChild(el);
    this._el = el;
  }

  /** Position the caret line at (clientX, clientY); hides if the point isn't editable. */
  update(clientX, clientY) {
    const ed = this._editor;
    const el = this._el;
    if (!el || !ed || !ed._wrapper) return;
    const root = ed.getEditorElement && ed.getEditorElement();
    const doc = ed._wrapper.ownerDocument;
    if (!root || !doc) return;

    let range = null;
    if (typeof doc.caretRangeFromPoint === 'function') {
      range = doc.caretRangeFromPoint(clientX, clientY);
    } else if (typeof doc.caretPositionFromPoint === 'function') {
      const pos = doc.caretPositionFromPoint(clientX, clientY);
      if (pos) { range = doc.createRange(); range.setStart(pos.offsetNode, pos.offset); range.collapse(true); }
    }
    if (!range || !root.contains(range.startContainer)) { this.hide(); return; }

    // A collapsed caret range can report a zero-size rect on empty lines; fall
    // back to the nearest block's rect so the line still has a sensible width.
    let cRect = range.getBoundingClientRect();
    if ((!cRect || (!cRect.width && !cRect.height))) {
      const node = range.startContainer;
      const blockEl = node.nodeType === 1 ? node : node.parentElement;
      const block = blockEl && blockEl.closest && blockEl.closest('*');
      if (block) cRect = block.getBoundingClientRect();
    }
    if (!cRect) { this.hide(); return; }

    const wRect = ed._wrapper.getBoundingClientRect();
    const width = Math.max(cRect.width, 24);
    el.style.left = `${cRect.left - wRect.left + ed._wrapper.scrollLeft}px`;
    el.style.top = `${cRect.bottom - wRect.top + ed._wrapper.scrollTop - 1}px`;
    el.style.width = `${width}px`;
    el.hidden = false;
  }

  hide() { if (this._el) this._el.hidden = true; }

  destroy() {
    if (this._el && this._el.parentNode) this._el.parentNode.removeChild(this._el);
    this._el = null;
    this._editor = null;
  }
}
