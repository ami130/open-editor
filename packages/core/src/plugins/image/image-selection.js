/**
 * image-selection.js — Click-to-select, keyboard delete, and context menu
 * for image islands (9.7, 9.9, 9.11, 9.16).
 *
 * Exported as a plain object so the plugin entry point can call install/destroy
 * directly, and onKeyDown can be forwarded from the plugin's onKeyDown hook.
 */
import { applyAlignment, wrapInLink } from './image-dom.js';
import { ensureEditorFloor } from '../../editing/block-editing.js';

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

    // undo/redo/setHTML replace innerHTML wholesale — the selected figure's
    // DOM node is destroyed, so a stale reference must be dropped (mirrors
    // media-selection.js's identical fix).
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
    // Arrow keys: deselect and let default cursor movement proceed
    if (e.key.startsWith('Arrow')) {
      this._deselectAll();
      return false;
    }
    // Escape: deselect
    if (e.key === 'Escape') {
      this._deselectAll();
      return true;
    }
    return false;
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

  _handleContextMenu(e) {
    const fig = e.target && e.target.closest
      ? e.target.closest('[data-oe-island="image"]')
      : null;
    if (!fig) return;

    e.preventDefault();
    this._selectFigure(fig);

    const ed = this._editor;
    if (!ed || !ed.ui || !ed.ui.contextMenu) return;

    // Position relative to the editor wrapper
    const wRect = ed._wrapper.getBoundingClientRect();
    const x = e.clientX - wRect.left;
    const y = e.clientY - wRect.top;

    ed.ui.contextMenu.show(x, y, this._buildContextMenuItems(fig));
  }

  _buildContextMenuItems(fig) {
    return [
      { label: 'Float left',   action: () => { applyAlignment(fig, 'left');   this._emit(); } },
      { label: 'Center',       action: () => { applyAlignment(fig, 'center'); this._emit(); } },
      { label: 'Float right',  action: () => { applyAlignment(fig, 'right');  this._emit(); } },
      { label: 'Inline',       action: () => { applyAlignment(fig, 'inline'); this._emit(); } },
      { separator: true },
      // 9.1 — full properties dialog
      { label: 'Image properties…', action: () => {
        if (typeof this.onEditProps === 'function') this.onEditProps(fig);
      } },
      // 9.16 — wrap in link
      { label: 'Add / edit link…', action: () => this._promptLink(fig) },
      { separator: true },
      { label: 'Delete image',  action: () => this._deleteSelected() },
    ];
  }

  /** Public: remove a figure via the standard delete path (used by 9.1 Delete). */
  deleteFigure(fig) {
    if (fig && fig !== this._selectedFigure) this._selectFigure(fig);
    this._deleteSelected();
  }

  _promptLink(fig) {
    const ed = this._editor;
    if (!ed || !ed.ui || !ed.ui.modal) return;
    const doc  = ed._wrapper.ownerDocument;

    const wrap  = doc.createElement('div');
    wrap.className = 'oe-img-dialog__field';
    const lbl  = doc.createElement('label');
    lbl.textContent = 'Link URL';
    lbl.setAttribute('for', 'oe-img-link-url');
    lbl.className = 'oe-img-dialog__label';
    const inp  = doc.createElement('input');
    inp.id = 'oe-img-link-url';
    inp.type = 'url';
    inp.className = 'oe-img-dialog__input';
    inp.placeholder = 'https://…';
    // Pre-fill existing link if present
    const existingA = fig.querySelector('img')  && fig.querySelector('img').closest('a');
    if (existingA) inp.value = existingA.href;
    wrap.appendChild(lbl);
    wrap.appendChild(inp);

    ed.ui.modal.open({
      title:   'Image link',
      body:    wrap,
      buttons: [
        { label: 'Cancel', value: null },
        { label: 'Apply',  value: 'apply', variant: 'primary' },
      ],
    }).then((val) => {
      if (val === 'apply' && inp.value.trim()) {
        wrapInLink(fig, inp.value.trim());
        this._emit();
      }
    });
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
    const ed = this._editor;
    // Snapshot BEFORE mutation so undo can return to pre-delete state
    if (ed) ed.history && ed.history.takeSnapshot();
    this._deselectAll();
    // Place cursor on the previous sibling or parent before removing figure
    if (ed) {
      try {
        const doc  = fig.ownerDocument;
        const prev = fig.previousElementSibling;
        const next = fig.nextElementSibling;
        const range = doc.createRange();
        if (prev) {
          range.setStartAfter(prev);
        } else if (next) {
          range.setStart(next, 0);
        } else {
          range.setStart(fig.parentNode, 0);
        }
        range.collapse(true);
        const domSel = doc.getSelection ? doc.getSelection() : null;
        if (domSel) { domSel.removeAllRanges(); domSel.addRange(range); }
      } catch { /* selection placement failure is non-fatal */ }
    }
    fig.parentNode && fig.parentNode.removeChild(fig);
    // Restore canonical floor if editor is now empty
    if (ed) {
      ensureEditorFloor(ed);
      ed.emit('afterCommand', { command: 'deleteImage', args: [] });
    }
  }

  _emit() {
    this._editor && this._editor.emit('afterCommand', { command: 'imageAligned', args: [] });
  }
}
