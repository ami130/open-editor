/**
 * emoji-plugin.js — Phase 13.4: insert an emoji from a categorized grid.
 *
 * Reuses the shared buildCharGrid (with category tabs + search) and the shared
 * char-grid styles — the only difference from Special Characters (13.3) is the
 * dataset and that category tabs are enabled. Picking an emoji inserts it at
 * the caret with the same selection save/restore pattern.
 *
 * A built-in emoji picker is BEYOND standard Jodit — a deliberate differentiator.
 *
 * Config: `emojis` — override the default emoji set.
 * Implements { name, install, destroy, getToolbarButtons }.
 */
import { buildCharGrid } from '../chars/char-grid.js';
import { injectCharStyles } from '../chars/char-styles.js';
import { resolveEmojis, EMOJI_CATEGORIES } from './emoji-data.js';
import { escapeLinkBoundary } from '../chars/char-insert-utils.js';

const EMOJI_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <circle cx="12" cy="12" r="10"/>
  <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
  <line x1="9" y1="9" x2="9.01" y2="9"/>
  <line x1="15" y1="9" x2="15.01" y2="9"/>
</svg>`;

export function createEmojiPlugin() {
  return {
    name: 'emoji',
    _editor: null,

    install(editor) {
      this._editor = editor;
      const doc = (typeof document !== 'undefined') ? document : null;
      if (doc) injectCharStyles(doc);
    },

    destroy() { this._editor = null; },

    getToolbarButtons() {
      return [{
        name:    'emoji',
        type:    'button',
        icon:    EMOJI_ICON,
        tooltip: 'Emoji',
        onClick: () => this._open(),
      }];
    },

    async _open() {
      const editor = this._editor;
      if (!editor || !editor.ui || !editor.ui.modal) return;
      const doc = editor._iframeDoc || document;

      const items = resolveEmojis(editor._config && editor._config.emojis);
      const bookmark = editor.selection ? editor.selection.save() : null;

      let picked = null;
      const grid = buildCharGrid(doc, items, (ch) => {
        picked = ch;
        editor.ui.modal.close(ch);
      }, {
        columns: 8,
        categories: EMOJI_CATEGORIES,
        searchPlaceholder: 'Search emoji…',
      });

      const result = await editor.ui.modal.open({
        title: 'Emoji',
        body: grid.node,
      });

      if (result == null && picked == null) return; // cancelled
      const ch = picked != null ? picked : result;
      if (!ch) return;

      if (bookmark && editor.selection) editor.selection.restore(bookmark);
      escapeLinkBoundary(editor); // don't silently extend a link the caret is inside
      editor.history && editor.history.takeSnapshot();
      if (editor.selection && typeof editor.selection.insertAtCursor === 'function') {
        editor.selection.insertAtCursor(ch);
      }
      editor.emit('afterCommand', { command: 'insertEmoji', args: [ch] });
      if (editor._onChangeFn) editor._onChangeFn();
    },
  };
}

export const emojiPlugin = createEmojiPlugin();
