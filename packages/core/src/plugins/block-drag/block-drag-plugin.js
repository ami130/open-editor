/**
 * block-drag-plugin.js — Phase 16.6.4: hover a block's left margin to reveal a
 * drag handle; dragging it reorders the block among its top-level siblings.
 *
 * Hover/position math needs real layout (getBoundingClientRect), so the DOM/
 * event wiring here is verified end-to-end in Playwright (16.6.5); the pure
 * reorder logic (block-reorder.js) has full jsdom unit coverage. One history
 * snapshot is taken on drop, not per intermediate drag frame.
 *
 * Implements { name, install, destroy }.
 */
import { injectBlockDragStyles } from './block-drag-styles.js';
import { isReorderableBlock, getReorderableBlocks, moveBlockBefore } from './block-reorder.js';

const HANDLE_ICON = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
  <circle cx="9" cy="6" r="1.2" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="9" cy="18" r="1.2" fill="currentColor" stroke="none"/>
  <circle cx="15" cy="6" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="18" r="1.2" fill="currentColor" stroke="none"/>
</svg>`;

export function createBlockDragPlugin() {
  return {
    name: 'blockDrag',
    _editor: null,
    _handle: null,
    _indicator: null,
    _hoveredBlock: null,
    _dragBlock: null,
    _dropTarget: undefined, // undefined = no valid drop position tracked yet

    install(editor) {
      this._editor = editor;
      const doc = editor._iframeDoc || (typeof document !== 'undefined' ? document : null);
      const el = editor.getEditorElement();
      if (!doc || !el) return;
      injectBlockDragStyles(doc);

      this._handle = doc.createElement('div');
      this._handle.className = 'oe-block-handle';
      this._handle.innerHTML = HANDLE_ICON;
      this._handle.setAttribute('contenteditable', 'false');
      this._handle.setAttribute('aria-hidden', 'true'); // decorative; keyboard reordering is out of scope for a mouse-drag affordance
      this._handle.hidden = true;

      this._indicator = doc.createElement('div');
      this._indicator.className = 'oe-block-drop-indicator';
      this._indicator.hidden = true;

      const wrapper = editor._wrapper || el.parentNode;
      wrapper.appendChild(this._handle);
      wrapper.appendChild(this._indicator);

      this._onMouseMove = (e) => this._onHoverMove(e);
      this._onHandleDown = (e) => this._startDrag(e);
      el.addEventListener('mousemove', this._onMouseMove);
      this._handle.addEventListener('mousedown', this._onHandleDown);
    },

    destroy() {
      const editor = this._editor;
      const el = editor && editor.getEditorElement();
      if (el && this._onMouseMove) el.removeEventListener('mousemove', this._onMouseMove);
      if (this._handle) {
        if (this._onHandleDown) this._handle.removeEventListener('mousedown', this._onHandleDown);
        if (this._handle.parentNode) this._handle.parentNode.removeChild(this._handle);
      }
      if (this._indicator && this._indicator.parentNode) this._indicator.parentNode.removeChild(this._indicator);
      this._endDragListeners();
      this._editor = null;
      this._handle = null;
      this._indicator = null;
      this._hoveredBlock = null;
    },

    _onHoverMove(e) {
      const editor = this._editor;
      const el = editor.getEditorElement();
      const doc = el.ownerDocument;
      const target = doc.elementFromPoint ? doc.elementFromPoint(e.clientX, e.clientY) : e.target;
      let block = target;
      while (block && block !== el && !isReorderableBlock(block, el)) block = block.parentNode;
      if (!block || block === el) { this._hoveredBlock = null; this._handle.hidden = true; return; }

      this._hoveredBlock = block;
      const wrapper = editor._wrapper;
      const wRect = wrapper.getBoundingClientRect();
      const bRect = block.getBoundingClientRect();
      this._handle.style.left = (bRect.left - wRect.left - 22) + 'px';
      this._handle.style.top = (bRect.top - wRect.top + (bRect.height - 22) / 2) + 'px';
      this._handle.hidden = false;
    },

    _startDrag(e) {
      e.preventDefault();
      const editor = this._editor;
      const el = editor.getEditorElement();
      if (!this._hoveredBlock) return;
      this._dragBlock = this._hoveredBlock;
      this._dragBlock.classList.add('oe-block-drag-source');
      el.classList.add('oe-editor--block-dragging');
      this._dropTarget = undefined;

      const doc = el.ownerDocument;
      this._onDragMove = (ev) => this._onDrag(ev);
      this._onDragEnd = () => this._finishDrag();
      doc.addEventListener('mousemove', this._onDragMove);
      doc.addEventListener('mouseup', this._onDragEnd);
    },

    _onDrag(e) {
      const editor = this._editor;
      const el = editor.getEditorElement();
      const blocks = getReorderableBlocks(el).filter((b) => b !== this._dragBlock);
      const wrapper = editor._wrapper;
      const wRect = wrapper.getBoundingClientRect();

      let target = null; // block to insert BEFORE; null = insert at end
      for (const b of blocks) {
        const r = b.getBoundingClientRect();
        if (e.clientY < r.top + r.height / 2) { target = b; break; }
      }
      this._dropTarget = target;

      const indicatorRect = target
        ? target.getBoundingClientRect()
        : (blocks.length ? blocks[blocks.length - 1].getBoundingClientRect() : el.getBoundingClientRect());
      const y = target ? indicatorRect.top : indicatorRect.bottom;
      this._indicator.style.left = (indicatorRect.left - wRect.left) + 'px';
      this._indicator.style.width = indicatorRect.width + 'px';
      this._indicator.style.top = (y - wRect.top - 1.5) + 'px';
      this._indicator.hidden = false;
    },

    _finishDrag() {
      const editor = this._editor;
      const el = editor.getEditorElement();
      const moved = this._dropTarget !== undefined &&
        moveBlockBefore(el, this._dragBlock, this._dropTarget);
      this._endDragListeners();
      if (this._dragBlock) this._dragBlock.classList.remove('oe-block-drag-source');
      el.classList.remove('oe-editor--block-dragging');
      this._indicator.hidden = true;
      this._dragBlock = null;
      this._dropTarget = undefined;
      if (moved) {
        // ONE snapshot for the whole drag, taken after the drop completes —
        // never per intermediate frame.
        if (editor.history) editor.history.takeSnapshot();
        if (editor._onChangeFn) editor._onChangeFn();
      }
    },

    _endDragListeners() {
      const editor = this._editor;
      const el = editor && editor.getEditorElement();
      const doc = el ? el.ownerDocument : (typeof document !== 'undefined' ? document : null);
      if (doc && this._onDragMove) doc.removeEventListener('mousemove', this._onDragMove);
      if (doc && this._onDragEnd) doc.removeEventListener('mouseup', this._onDragEnd);
    },
  };
}

export const blockDragPlugin = createBlockDragPlugin();
