/**
 * image-plugin.js — Image Plugin entry point (Phase 9).
 *
 * Implements the Phase 8 plugin interface:
 *   { name, install(editor), destroy(), getToolbarButtons(), onKeyDown(e) }
 *
 * Usage:
 *   import { imagePlugin } from './plugins/image/image-plugin.js';
 *   editor.plugins.install(imagePlugin);
 */
import { openImageDialog }            from './image-dialog.js';
import { openImageProperties }        from './image-properties.js';
import { buildAndInsertFigure } from './image-dom.js';
import { injectImageStyles }          from './image-styles.js';
import { ImageSelectionManager }      from './image-selection.js';
import { ImageResizeManager }         from './image-resize.js';
import { ImageActionBar }             from './image-actionbar.js';
import { installDragDrop }            from './image-drag-drop.js';
import { installPaste }               from './image-paste.js';

// SVG icon for the toolbar button (inline — no external resource)
const INSERT_IMAGE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
  <circle cx="8.5" cy="8.5" r="1.5"/>
  <polyline points="21 15 16 10 5 21"/>
</svg>`;

// ─── Plugin factory ───────────────────────────────────────────────────────────

export function createImagePlugin() {
  return {
    name: 'image',

    // Private state — stored directly on the spec so install/destroy are symmetric
    _editor:         null,
    _selection:      null,
    _resize:         null,
    _actionBar:      null,
    _nativeHandlers: null,

    // ─── install ──────────────────────────────────────────────────────────────

    install(editor) {
      this._editor = editor;

      // Inject image CSS once into the document
      const doc = (editor._wrapper && editor._wrapper.ownerDocument) || document;
      injectImageStyles(doc);

      // 9.7 + 9.9 + 9.11 + 9.16 — selection, context menu, keyboard delete
      this._selection = new ImageSelectionManager();
      this._selection.install(editor);
      // 9.1 — dbl-click / context-menu "Image properties…" open the dialog.
      this._selection.onEditProps = (fig) => this._openProperties(fig);

      // 9.8 — resize overlay
      this._resize = new ImageResizeManager();
      this._resize.install(editor);

      // 9.4 — floating quick-action bar on a selected image.
      this._actionBar = new ImageActionBar(editor);
      this._actionBar.onEdit   = (fig) => this._openProperties(fig);
      this._actionBar.onLink   = (fig) => this._selection && this._selection._promptLink(fig);
      this._actionBar.onDelete = (fig) => this._selection && this._selection.deleteFigure(fig);

      // 9.5 — drag-and-drop (registers editor.on listeners via installDragDrop)
      installDragDrop(editor);

      // 9.6 — paste interception
      installPaste(editor);

      const edEl = editor.getEditorElement();
      if (edEl) {
        this._nativeDragBind(editor, edEl);
      }
    },

    // Bridge native drag events on the editor element through editor.emit()
    // so PluginManager-tracked editor.on() listeners receive them.
    _nativeDragBind(editor, edEl) {
      const events = ['dragenter', 'dragover', 'dragleave', 'drop'];
      this._nativeHandlers = {};
      for (const type of events) {
        const fn = (e) => editor.emit(type, e);
        edEl.addEventListener(type, fn);
        this._nativeHandlers[type] = fn;
      }
    },

    // ─── destroy ──────────────────────────────────────────────────────────────

    destroy() {
      const editor = this._editor;

      // Remove native drag bridges
      if (editor && this._nativeHandlers) {
        const edEl = editor.getEditorElement();
        if (edEl) {
          for (const [type, fn] of Object.entries(this._nativeHandlers)) {
            edEl.removeEventListener(type, fn);
          }
        }
      }
      this._nativeHandlers = null;

      if (this._actionBar) { this._actionBar.destroy(); this._actionBar = null; }
      if (this._selection) { this._selection.destroy(); this._selection = null; }
      if (this._resize)    { this._resize.destroy();    this._resize    = null; }

      this._editor = null;
    },

    // ─── 8.4 — toolbar button (9.1) ───────────────────────────────────────────

    getToolbarButtons() {
      return [{
        name:    'insertImage',
        type:    'button',
        icon:    INSERT_IMAGE_ICON,
        tooltip: 'Insert Image',
        onClick: () => this._openInsertDialog(),
      }];
    },

    // ─── 8.6 — keydown hook (9.11 forwards to selection manager) ──────────────

    onKeyDown(e) {
      // Keyboard insert shortcut: Ctrl/Cmd+Shift+I opens the insert dialog.
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'I' || e.key === 'i')) {
        this._openInsertDialog();
        return true;
      }
      return this._selection ? this._selection.onKeyDown(e) : false;
    },

    // ─── Internal: open insert dialog and process result ──────────────────────

    async _openInsertDialog() {
      const editor = this._editor;
      if (!editor) return;

      // Save selection before opening the modal so focus shift doesn't lose it
      const bookmark = editor.selection ? editor.selection.save() : null;

      let result;
      try {
        result = await openImageDialog(editor);
      } catch (err) {
        editor.emit('error', { error: err, context: 'plugin:image:dialog' });
        return;
      }
      if (!result) return; // user cancelled

      const doc    = (editor._wrapper && editor._wrapper.ownerDocument) || document;
      const config = editor._config || {};

      if (bookmark && editor.selection) {
        editor.selection.restore(bookmark);
      } else {
        const edEl = editor.getEditorElement();
        if (edEl) edEl.focus();
      }

      buildAndInsertFigure(editor, result, {
        alt:       result.alt,
        title:     result.title,
        alignment: result.alignment,
      }, config, doc, 'plugin:image:insert');
    },

    // ─── 9.1 — open the Image Properties dialog for an existing figure ────────
    async _openProperties(figure) {
      const editor = this._editor;
      if (!editor || !figure) return;

      // Snapshot BEFORE any mutation so undo returns to the pre-edit state.
      editor.history && editor.history.takeSnapshot();

      let action;
      try {
        action = await openImageProperties(editor, figure);
      } catch (err) {
        editor.emit('error', { error: err, context: 'plugin:image:properties' });
        return;
      }
      if (!action) return; // cancelled — the pre-snapshot is harmless (dedup)

      if (action === 'delete') {
        if (this._selection) this._selection.deleteFigure(figure);
        return;
      }

      // action === 'apply' — props already written by openImageProperties.
      // Reselect the figure so the user can keep working with it (Jodit's
      // selectImageAfterClose), refresh the resize overlay, and fire change.
      if (this._selection) this._selection._selectFigure(figure);
      editor.emit('afterCommand', { command: 'imageProperties', args: [] });
      if (editor._onChangeFn) editor._onChangeFn();
    },
  };
}

// Backward-compatible singleton for single-instance use
export const imagePlugin = createImagePlugin();
