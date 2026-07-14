/**
 * table-plugin.js — Table Plugin entry point (Phase 11).
 *
 * Phase 11.A slice: toolbar button → grid-picker (NxM) → insert a clean
 * <table> at the cursor. Later sub-phases add navigation/key-guard (11.B),
 * selection + merge/split (11.C), and styling (11.D).
 *
 * Mirrors the image/link plugins: a createTablePlugin() factory returning a
 * fresh spec (per-instance state), plus a backward-compatible singleton.
 */
import { injectTableStyles }   from './table-styles.js';
import { buildGridPicker }     from './table-grid-picker.js';
import { createTable, insertTable } from './table-dom.js';
import { handleTableKey }      from './table-keyboard.js';
import { buildTableMenuItems } from './table-contextmenu.js';
import { TableSelectionManager } from './table-selection.js';
import { TableResizeManager } from './table-resize.js';

const INSERT_TABLE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <rect x="3" y="3" width="18" height="18" rx="1"/>
  <line x1="3" y1="9" x2="21" y2="9"/>
  <line x1="3" y1="15" x2="21" y2="15"/>
  <line x1="9" y1="3" x2="9" y2="21"/>
  <line x1="15" y1="3" x2="15" y2="21"/>
</svg>`;

export function createTablePlugin() {
  return {
    name: 'table',

    _editor: null,
    _selection: null,
    _resize: null,

    install(editor) {
      this._editor = editor;
      const doc = (editor._wrapper && editor._wrapper.ownerDocument) || document;
      injectTableStyles(doc);

      // 11.16 — click-drag rectangular cell selection (basis for merge/range ops).
      this._selection = new TableSelectionManager();
      this._selection.install(editor);

      // 11.8 — drag a column border to resize (mouse + touch).
      this._resize = new TableResizeManager();
      this._resize.install(editor);

      // 11.6/11.7 — right-click inside a cell opens the table context menu.
      // editor.on() is auto-cleaned by PluginManager on uninstall.
      editor.on('contextmenu', (e) => this._onContextMenu(e));
    },

    destroy() {
      if (this._selection) { this._selection.destroy(); this._selection = null; }
      if (this._resize)    { this._resize.destroy();    this._resize    = null; }
      this._editor = null;
    },

    getToolbarButtons() {
      return [{
        name:    'insertTable',
        type:    'button',
        icon:    INSERT_TABLE_ICON,
        tooltip: 'Insert Table',
        onClick: () => this._openPicker(),
      }];
    },

    // 11.19 + 11.3/11.4/11.5 — cell key-guard + Tab/arrow navigation. Runs before
    // the block-editing handlers (PluginManager calls onKeyDown first), so a
    // consumed key never reaches the Enter-split / Backspace-merge logic.
    onKeyDown(e) {
      const editor = this._editor;
      if (!editor) return false;
      return handleTableKey(editor, e);
    },

    _onContextMenu(e) {
      const editor = this._editor;
      if (!editor || !editor.ui || !editor.ui.contextMenu) return;
      const root = editor.getEditorElement();
      const cell = e.target && e.target.closest
        ? (e.target.closest('td') || e.target.closest('th'))
        : null;
      if (!cell || !root || !root.contains(cell)) return; // not a table cell
      e.preventDefault();
      const wRect = editor._wrapper.getBoundingClientRect();
      const selected = this._selection ? this._selection.getSelectedCells() : [];
      editor.ui.contextMenu.show(
        e.clientX - wRect.left,
        e.clientY - wRect.top,
        buildTableMenuItems(editor, cell, selected)
      );
    },

    // Open the grid-picker in a modal; on pick, insert the table.
    async _openPicker() {
      const editor = this._editor;
      if (!editor || !editor.ui || !editor.ui.modal) return;
      const doc = (editor._wrapper && editor._wrapper.ownerDocument) || document;

      // Save the caret so the modal's focus shift doesn't lose the insert point.
      const bookmark = editor.selection ? editor.selection.save() : null;

      const config = editor._config || {};
      let dims = null;
      const picker = buildGridPicker(doc, (rows, cols) => {
        dims = { rows, cols };
        // Close the modal as soon as a size is chosen.
        editor.ui.modal.close('picked');
      }, { presets: config.tableAvailableClasses || [] });

      await editor.ui.modal.open({
        title: 'Insert Table',
        body:  picker.panel,
        buttons: [{ label: 'Cancel', value: null }],
        closeOnBackdrop: true,
        closeOnEscape:   true,
      });

      if (!dims) return; // closed/cancelled without choosing a size

      if (bookmark && editor.selection) editor.selection.restore(bookmark);
      else { const el = editor.getEditorElement(); if (el) el.focus(); }

      // 11.18 — a chosen preset class wins; else the configured default.
      const preset = picker.getClassName();
      const table = createTable(doc, dims.rows, dims.cols, {
        headerRow: config.tableDefaultHeaderRow === true,
        className: preset || config.tableDefaultClass || '',
      });
      insertTable(editor, table);
    },
  };
}

export const tablePlugin = createTablePlugin();
