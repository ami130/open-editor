/**
 * special-chars-plugin.js — Phase 13.3: insert a special character from a grid.
 *
 * Toolbar button opens a modal with a searchable character grid (buildCharGrid).
 * Picking a character inserts it at the caret. Because the modal steals focus,
 * we bookmark the selection before opening and restore it before inserting —
 * the same pattern the link dialog uses.
 *
 * Config: `specialCharacters` — an array of single-char strings (Jodit-style)
 * or rich {ch,label} entries; falls back to the built-in DEFAULT set.
 *
 * Implements { name, install, destroy, getToolbarButtons }.
 */
import { buildCharGrid } from './char-grid.js';
import { resolveSpecialChars, hasCategories, SPECIAL_CHAR_CATEGORIES } from './char-data.js';
import { injectCharStyles } from './char-styles.js';
import { escapeLinkBoundary } from './char-insert-utils.js';

const CHARS_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M4 20V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v14"/>
  <path d="M4 13h8"/>
  <path d="M15 8h5"/>
  <path d="M17.5 8v12"/>
</svg>`;

export function createSpecialCharsPlugin() {
  return {
    name: 'specialChars',
    _editor: null,

    install(editor) {
      this._editor = editor;
      // iframe-aware: styles must land in the document the editable lives in.
      const doc = editor._iframeDoc || ((typeof document !== 'undefined') ? document : null);
      if (doc) injectCharStyles(doc);
    },

    destroy() { this._editor = null; },

    getToolbarButtons() {
      return [{
        name:    'specialChars',
        type:    'button',
        icon:    CHARS_ICON,
        tooltip: 'Special characters',
        onClick: () => this._open(),
      }];
    },

    async _open() {
      const editor = this._editor;
      if (!editor || !editor.ui || !editor.ui.modal) return;
      const doc = editor._iframeDoc || document;

      const items = resolveSpecialChars(editor._config && editor._config.specialCharacters);
      const bookmark = editor.selection ? editor.selection.save() : null;

      // Build the grid; picking a char resolves the modal with that char.
      // Category tabs are shown only for the built-in set (every item has a
      // `cat`); a custom flat `specialCharacters` config stays a flat grid.
      let picked = null;
      const grid = buildCharGrid(doc, items, (ch) => {
        picked = ch;
        editor.ui.modal.close(ch); // resolve the open() promise
      }, {
        columns: 9,
        searchPlaceholder: 'Search characters…',
        gridLabel: 'Special characters',
        categories: hasCategories(items) ? SPECIAL_CHAR_CATEGORIES : null,
      });

      const result = await editor.ui.modal.open({
        title: 'Special characters',
        body: grid.node,
        // no footer buttons — clicking a cell closes; backdrop/Escape cancels
      });
      // focus the search after open (open() resolves only on close, so we can't
      // focus here reliably; the grid is usable via mouse regardless)

      if (result == null && picked == null) return; // cancelled
      const ch = picked != null ? picked : result;
      if (!ch) return;

      if (bookmark && editor.selection) editor.selection.restore(bookmark);
      escapeLinkBoundary(editor); // don't silently extend a link the caret is inside
      editor.history && editor.history.takeSnapshot();
      if (editor.selection && typeof editor.selection.insertAtCursor === 'function') {
        editor.selection.insertAtCursor(ch);
      }
      editor.emit('afterCommand', { command: 'insertSpecialChar', args: [ch] });
      if (editor._onChangeFn) editor._onChangeFn();
    },
  };
}

export const specialCharsPlugin = createSpecialCharsPlugin();
