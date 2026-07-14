/**
 * media-selection.js — click-to-select, keyboard delete, and context menu for
 * video embed islands. Adapted from image-selection.js: same island contract
 * and event shape (mediaSelected/mediaDeselected mirror imageSelected/
 * imageDeselected) so the shared resize overlay & actionbar patterns apply
 * unchanged. Simplified relative to images — no figcaption, no link-wrap, no
 * properties dialog (a video embed has nothing to edit but its URL, which
 * means delete-and-re-embed, same as CKEditor).
 */
import { applyAlignment } from './media-dom.js';
import { ensureEditorFloor } from '../../editing/block-editing.js';

const SELECTED_CLASS = 'oe-embed--selected';

export class MediaSelectionManager {
  constructor() {
    this._editor           = null;
    this._selectedFigure   = null;
    this._onEditorClick    = null;
    this._onSelChange      = null;
    this._onContextMenu    = null;
    this._onContentReplaced = null;
  }

  install(editor) {
    this._editor = editor;

    this._onEditorClick = (e) => this._handleClick(e);
    editor.on('mousedown', this._onEditorClick);

    this._onSelChange = () => this._handleSelectionChange();
    editor.on('selectionChange', this._onSelChange);

    // undo/redo/setHTML replace the editor's innerHTML wholesale — the
    // selected figure's DOM node is destroyed, so any stale reference to it
    // must be dropped (a later click on the NEW node would otherwise be a
    // silent no-op: _selectFigure would still think something is selected).
    this._onContentReplaced = () => this._deselectAll();
    editor.on('undo', this._onContentReplaced);
    editor.on('redo', this._onContentReplaced);
    editor.on('setHTML', this._onContentReplaced);

    // contextmenu on contenteditable="false" doesn't bubble to the editor
    // element (same fix as image-selection.js) — wire it on the root directly.
    this._onContextMenu = (e) => this._handleContextMenu(e);
    const editorEl = editor.getEditorElement && editor.getEditorElement();
    if (editorEl) {
      editorEl.addEventListener('contextmenu', this._onContextMenu);
      this._contextMenuTarget = editorEl;
    } else {
      editor.on('contextmenu', this._onContextMenu);
      this._contextMenuTarget = null;
    }
  }

  destroy() {
    if (this._editor) {
      this._editor.off('mousedown', this._onEditorClick);
      this._editor.off('selectionChange', this._onSelChange);
      this._editor.off('undo', this._onContentReplaced);
      this._editor.off('redo', this._onContentReplaced);
      this._editor.off('setHTML', this._onContentReplaced);
      if (this._contextMenuTarget) {
        this._contextMenuTarget.removeEventListener('contextmenu', this._onContextMenu);
      } else {
        this._editor.off('contextmenu', this._onContextMenu);
      }
    }
    this._deselectAll();
    this._editor = null;
    this._selectedFigure = null;
  }

  onKeyDown(e) {
    if (!this._selectedFigure) return false;
    if (e.key === 'Backspace' || e.key === 'Delete') {
      this._deleteSelected();
      return true;
    }
    if (e.key.startsWith('Arrow')) {
      this._deselectAll();
      return false;
    }
    if (e.key === 'Escape') {
      this._deselectAll();
      return true;
    }
    return false;
  }

  getSelected() { return this._selectedFigure; }

  _handleClick(e) {
    const fig = e.target && e.target.closest
      ? e.target.closest('[data-oe-island="video"]')
      : null;
    if (!fig) { this._deselectAll(); return; }
    e.preventDefault(); // prevent native caret placement inside island
    this._selectFigure(fig);
  }

  _handleSelectionChange() {
    if (!this._selectedFigure) return;
    const ed = this._editor;
    if (!ed) return;
    const sel = ed.selection && ed.selection.get();
    if (!sel || !sel.startNode) { this._deselectAll(); return; }
    if (this._selectedFigure.contains(sel.startNode)) return;
    this._deselectAll();
  }

  _handleContextMenu(e) {
    const fig = e.target && e.target.closest
      ? e.target.closest('[data-oe-island="video"]')
      : null;
    if (!fig) return;

    e.preventDefault();
    this._selectFigure(fig);

    const ed = this._editor;
    if (!ed || !ed.ui || !ed.ui.contextMenu) return;

    const wRect = ed._wrapper.getBoundingClientRect();
    const x = e.clientX - wRect.left;
    const y = e.clientY - wRect.top;
    ed.ui.contextMenu.show(x, y, this._buildContextMenuItems(fig));
  }

  _buildContextMenuItems(fig) {
    return [
      { label: 'Float left',  action: () => { applyAlignment(fig, 'left');   this._emit(); } },
      { label: 'Center',      action: () => { applyAlignment(fig, 'center'); this._emit(); } },
      { label: 'Float right', action: () => { applyAlignment(fig, 'right');  this._emit(); } },
      { label: 'Inline',      action: () => { applyAlignment(fig, 'inline'); this._emit(); } },
      { separator: true },
      { label: 'Delete video', action: () => this._deleteSelected() },
    ];
  }

  /** Public: remove a figure via the standard delete path. */
  deleteFigure(fig) {
    if (fig && fig !== this._selectedFigure) this._selectFigure(fig);
    this._deleteSelected();
  }

  _selectFigure(fig) {
    if (this._selectedFigure === fig) return;
    this._deselectAll();
    this._selectedFigure = fig;
    fig.classList.add(SELECTED_CLASS);
    this._editor && this._editor.emit('mediaSelected', { figure: fig });
  }

  _deselectAll() {
    if (this._selectedFigure) {
      this._selectedFigure.classList.remove(SELECTED_CLASS);
      this._editor && this._editor.emit('mediaDeselected', { figure: this._selectedFigure });
      this._selectedFigure = null;
    }
    if (this._editor) {
      const root = this._editor.getEditorElement && this._editor.getEditorElement();
      if (root) root.querySelectorAll('.' + SELECTED_CLASS).forEach((f) => f.classList.remove(SELECTED_CLASS));
    }
  }

  _deleteSelected() {
    const fig = this._selectedFigure;
    if (!fig) return;
    const ed = this._editor;
    if (ed) ed.history && ed.history.takeSnapshot();
    this._deselectAll();
    if (ed) {
      try {
        const doc = fig.ownerDocument;
        const prev = fig.previousElementSibling;
        const next = fig.nextElementSibling;
        const range = doc.createRange();
        if (prev) range.setStartAfter(prev);
        else if (next) range.setStart(next, 0);
        else range.setStart(fig.parentNode, 0);
        range.collapse(true);
        const domSel = doc.getSelection ? doc.getSelection() : null;
        if (domSel) { domSel.removeAllRanges(); domSel.addRange(range); }
      } catch { /* selection placement failure is non-fatal */ }
    }
    fig.parentNode && fig.parentNode.removeChild(fig);
    if (ed) {
      ensureEditorFloor(ed);
      ed.emit('afterCommand', { command: 'deleteMedia', args: [] });
    }
  }

  _emit() {
    this._editor && this._editor.emit('afterCommand', { command: 'mediaAligned', args: [] });
  }
}
