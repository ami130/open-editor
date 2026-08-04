/**
 * image-selection.js — Click-to-select, keyboard delete, and context menu
 * for image islands (9.7, 9.9, 9.11, 9.16).
 *
 * Exported as a plain object so the plugin entry point can call install/destroy
 * directly, and onKeyDown can be forwarded from the plugin's onKeyDown hook.
 */
import { keyboardResizeImage, replaceFigureWithText, deleteFigureFromDoc } from './image-keyboard-resize.js';
import { promptImageLink } from './image-link-prompt.js';
import { handleImageContextMenu, openImageMenuForSelected } from './image-context-menu.js';

const SELECTED_CLASS = 'oe-figure--selected';

export class ImageSelectionManager {
  constructor() {
    this._editor          = null;
    this._selectedFigure  = null;
    this._onEditorClick   = null;
    this._onSelChange     = null;
    this._onContextMenu   = null;
    this._onDblClick      = null;
    this._onContentReplaced = null;
    // 9.1 — the plugin sets this to open the Image Properties dialog for a figure.
    this.onEditProps      = null;
  }

  // ─── Install / Destroy ───────────────────────────────────────────────────────

  install(editor) {
    this._editor = editor;

    // 9.7 — click inside editor selects the figure island
    this._onEditorClick = (e) => this._handleClick(e);
    editor.on('mousedown', this._onEditorClick);

    // Deselect when cursor moves elsewhere (text selection)
    this._onSelChange = () => this._handleSelectionChange();
    editor.on('selectionChange', this._onSelChange);

    // undo/redo/setHTML replace innerHTML wholesale — the selected figure's DOM
    // node is destroyed, so drop the stale reference (mirrors media-selection.js).
    this._onContentReplaced = () => this._deselectAll();
    editor.on('undo', this._onContentReplaced);
    editor.on('redo', this._onContentReplaced);
    editor.on('setHTML', this._onContentReplaced);

    // BUG-4 fix: contextmenu on contenteditable="false" doesn't bubble to the
    // editor element, so wire it on the root element directly.
    this._onContextMenu = (e) => this._handleContextMenu(e);
    const editorEl = editor.getEditorElement && editor.getEditorElement();
    if (editorEl) {
      editorEl.addEventListener('contextmenu', this._onContextMenu);
      this._contextMenuTarget = editorEl;
      // 9.1 — double-click a figure opens Image Properties (config-gated).
      this._onDblClick = (e) => this._handleDblClick(e);
      editorEl.addEventListener('dblclick', this._onDblClick);
      // IMG1-3 (a11y): Tab-focusing an image island selects it (keyboard entry).
      this._onFocusIn = (e) => this._handleFocusIn(e);
      editorEl.addEventListener('focusin', this._onFocusIn);
      // TOUCH (#7): a tap on a phone only synthesizes a delayed, easily-preempted
      // mousedown on a contenteditable=false island, so selection was unreliable.
      // Handle touchend directly to select the tapped figure (mirrors _handleClick).
      this._onTouchEnd = (e) => this._handleTouchEnd(e);
      editorEl.addEventListener('touchend', this._onTouchEnd);
    } else {
      editor.on('contextmenu', this._onContextMenu);
      this._contextMenuTarget = null;
    }
  }

  _handleDblClick(e) {
    const cfg = this._editor && this._editor._config;
    if (cfg && cfg.imageOpenOnDblClick === false) return;
    const fig = e.target && e.target.closest
      ? e.target.closest('[data-oe-island="image"]') : null;
    if (!fig) return;
    // Don't hijack a double-click inside the editable caption.
    if (e.target.closest && e.target.closest('[data-oe-caption]')) return;
    e.preventDefault();
    this._selectFigure(fig);
    if (typeof this.onEditProps === 'function') this.onEditProps(fig);
  }

  // IMG1-3 (a11y): keyboard-focusing the figure selects it (not when focusing the
  // editable figcaption — that's captioning).
  _handleFocusIn(e) {
    const t = e.target;
    if (!t || !t.closest) return;
    if (t.closest('[data-oe-caption]')) return;          // captioning, not selecting
    const fig = t.closest('[data-oe-island="image"]');
    if (fig && fig !== this._selectedFigure) this._selectFigure(fig);
  }

  destroy() {
    if (this._editor) {
      this._editor.off('mousedown',       this._onEditorClick);
      this._editor.off('selectionChange', this._onSelChange);
      this._editor.off('undo',            this._onContentReplaced);
      this._editor.off('redo',            this._onContentReplaced);
      this._editor.off('setHTML',         this._onContentReplaced);
      if (this._contextMenuTarget) {
        this._contextMenuTarget.removeEventListener('contextmenu', this._onContextMenu);
        if (this._onDblClick) this._contextMenuTarget.removeEventListener('dblclick', this._onDblClick);
        if (this._onFocusIn) this._contextMenuTarget.removeEventListener('focusin', this._onFocusIn);
        if (this._onTouchEnd) this._contextMenuTarget.removeEventListener('touchend', this._onTouchEnd);
      } else {
        this._editor.off('contextmenu', this._onContextMenu);
      }
    }
    this._deselectAll();
    this._editor         = null;
    this._selectedFigure = null;
  }

  // ─── Public: plugin onKeyDown hook (9.11) ────────────────────────────────────

  /**
   * Returns true if it handled the key (prevents default + stops propagation).
   */
  onKeyDown(e) {
    if (!this._selectedFigure) return false;
    if (e.key === 'Backspace' || e.key === 'Delete') {
      this._deleteSelected();
      return true;
    }
    // IMG1-3 (a11y): Enter opens Image Properties.
    if (e.key === 'Enter' && typeof this.onEditProps === 'function') {
      e.preventDefault();
      this.onEditProps(this._selectedFigure);
      return true;
    }
    // A11Y (#6): ContextMenu key / Shift+F10 opens the actions menu (align, link,
    // properties, delete) — the keyboard equivalent of the mouse-only action bar
    // and right-click menu. The menu itself is arrow/Enter/Escape navigable.
    if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
      if (this._openContextMenuForSelected()) { e.preventDefault(); return true; }
    }
    // IMG1-3 (a11y): arrow keys RESIZE the selected image (Shift = 10px, else 1px).
    if (e.key.startsWith('Arrow')) {
      if (this._keyboardResize(e)) { e.preventDefault(); return true; }
      this._deselectAll();
      return false;
    }
    // Escape: deselect and return focus to the editable so typing continues.
    if (e.key === 'Escape') {
      const wasSelected = this._selectedFigure;
      this._deselectAll();
      const el = this._editor && this._editor.getEditorElement && this._editor.getEditorElement();
      if (el && el.focus) el.focus();
      return !!wasSelected;
    }
    // IMG20: a printable key over a selected image REPLACES it with that text
    // (Docs/Word). Ignore modifier combos + non-printing keys.
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const fig = this._selectedFigure;
      this._deselectAll();
      if (replaceFigureWithText(this._editor, fig, e.key)) { e.preventDefault(); return true; }
    }
    return false;
  }

  // Keyboard resize of the selected image (delegates to image-keyboard-resize.js).
  _keyboardResize(e) {
    return keyboardResizeImage(this._editor, this._selectedFigure, e);
  }

  // ─── Selected figure accessor ────────────────────────────────────────────────

  getSelected() { return this._selectedFigure; }

  // ─── Private ─────────────────────────────────────────────────────────────────

  _handleClick(e) {
    const fig = e.target && e.target.closest
      ? e.target.closest('[data-oe-island="image"]')
      : null;

    // Click outside any figure — deselect
    if (!fig) { this._deselectAll(); return; }

    // Click inside figcaption — deselect figure, let text cursor work
    const caption = e.target.closest('[data-oe-caption]');
    if (caption) { this._deselectAll(); return; }

    e.preventDefault(); // prevent native caret placement inside island
    this._selectFigure(fig);
  }

  // TOUCH (#7): select the tapped figure. Ignore multi-touch (pinch-zoom) and taps
  // inside the editable caption (that should place the text caret, not select).
  _handleTouchEnd(e) {
    if (e.touches && e.touches.length > 1) return;
    const t = (e.changedTouches && e.changedTouches[0]) || e.target;
    const target = (t && t.target) || e.target;
    const node = target && target.closest ? target
      : (target && target.parentElement) || null;
    if (!node || !node.closest) return;
    if (node.closest('[data-oe-caption]')) return;   // caption edit, not select
    const fig = node.closest('[data-oe-island="image"]');
    if (!fig) return;
    e.preventDefault();                              // stop the synthetic click/caret
    this._selectFigure(fig);
  }

  _handleSelectionChange() {
    if (!this._selectedFigure) return;
    const ed = this._editor;
    if (!ed) return;
    const sel = ed.selection && ed.selection.get();
    if (!sel || !sel.startNode) { this._deselectAll(); return; }
    // If cursor moved into the figcaption, deselect figure so Backspace edits caption text
    const startEl = sel.startNode.nodeType === 1
      ? sel.startNode
      : sel.startNode.parentElement;
    const inCaption = startEl && startEl.closest('[data-oe-caption]');
    if (inCaption && this._selectedFigure.contains(inCaption)) {
      this._deselectAll();
      return;
    }
    if (this._selectedFigure.contains(sel.startNode)) return;
    this._deselectAll();
  }

  _handleContextMenu(e) { handleImageContextMenu(this, e); }

  // A11Y (#6): keyboard-invoked actions menu for the selected figure.
  _openContextMenuForSelected() { return openImageMenuForSelected(this); }

  /** Public: remove a figure via the standard delete path (used by 9.1 Delete). */
  deleteFigure(fig) {
    if (fig && fig !== this._selectedFigure) this._selectFigure(fig);
    this._deleteSelected();
  }

  _promptLink(fig) {
    promptImageLink(this._editor, fig, () => this._emit());
  }

  _selectFigure(fig) {
    if (this._selectedFigure === fig) return;
    this._deselectAll();
    this._selectedFigure = fig;
    fig.classList.add(SELECTED_CLASS);
    this._editor && this._editor.emit('imageSelected', { figure: fig });
  }

  _deselectAll() {
    if (this._selectedFigure) {
      this._selectedFigure.classList.remove(SELECTED_CLASS);
      this._editor && this._editor.emit('imageDeselected', { figure: this._selectedFigure });
      this._selectedFigure = null;
    }
    // Belt-and-suspenders: remove from any stale figures in the DOM
    if (this._editor) {
      const root = this._editor.getEditorElement && this._editor.getEditorElement();
      if (root) root.querySelectorAll('.' + SELECTED_CLASS).forEach((f) => f.classList.remove(SELECTED_CLASS));
    }
  }

  _deleteSelected() {
    const fig = this._selectedFigure;
    if (!fig) return;
    this._deselectAll();
    deleteFigureFromDoc(this._editor, fig);   // caret placement + floor + snapshot
  }

  _emit(announce) {
    this._editor && this._editor.emit('afterCommand',
      { command: 'imageAligned', args: [], announce: announce || 'Alignment changed' });
  }
}
