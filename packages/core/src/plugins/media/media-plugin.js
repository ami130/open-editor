/**
 * media-plugin.js — Phase 13.5: embed YouTube/Vimeo video by URL.
 *
 * Toolbar button opens a small dialog for a video URL. parseMediaUrl (pure)
 * validates it against a strict provider allowlist and returns a safe HTTPS
 * embed src; the plugin builds a SANDBOXED iframe (sandbox tokens limited to
 * playback — no top-navigation/popups) inside a <figure>, and inserts it.
 *
 * SECURITY (defense in depth): even though the plugin only ever produces a
 * safe embed, the SANITIZER independently re-validates every iframe on the way
 * in and out (isSafeEmbedIframe) — so a hand-crafted or pasted iframe cannot
 * slip through, and the plugin's output is re-checked too. `sandbox` is
 * mandatory and host-restricted at BOTH layers.
 *
 * Implements { name, install, destroy, getToolbarButtons }.
 */
import { parseMediaUrl } from './media-providers.js';
import { injectMediaStyles } from './media-styles.js';
import { insertEmbed } from './media-dom.js';
import { installPasteAutoEmbed } from './media-paste.js';
import { MediaSelectionManager } from './media-selection.js';
import { MediaResizeManager } from './media-resize.js';
import { MediaActionBar } from './media-actionbar.js';

const MEDIA_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <rect x="2" y="4" width="20" height="16" rx="2"/><path d="m10 9 5 3-5 3Z"/>
</svg>`;

export function createMediaPlugin() {
  return {
    name: 'media',
    _editor: null,
    _selection: null,
    _resize: null,
    _actionBar: null,

    install(editor) {
      this._editor = editor;
      const doc = (typeof document !== 'undefined') ? document : null;
      if (doc) injectMediaStyles(doc);
      installPasteAutoEmbed(editor);

      this._selection = new MediaSelectionManager();
      this._selection.install(editor);
      this._resize = new MediaResizeManager();
      this._resize.install(editor);
      this._actionBar = new MediaActionBar(editor);
      this._actionBar.onDelete = (fig) => this._selection.deleteFigure(fig);
    },

    destroy() {
      if (this._actionBar) { this._actionBar.destroy(); this._actionBar = null; }
      if (this._resize) { this._resize.destroy(); this._resize = null; }
      if (this._selection) { this._selection.destroy(); this._selection = null; }
      this._editor = null;
    },

    /** Forwarded from the editor's keydown hook — Backspace/Delete/Escape on a
     *  selected video, same contract as the image plugin's onKeyDown. */
    onKeyDown(e) {
      return this._selection ? this._selection.onKeyDown(e) : false;
    },

    getToolbarButtons() {
      return [{
        name: 'media', type: 'button', icon: MEDIA_ICON,
        tooltip: 'Embed video',
        onClick: () => this._open(),
      }];
    },

    async _open() {
      const editor = this._editor;
      if (!editor || !editor.ui || !editor.ui.modal) return;
      const doc = editor._iframeDoc || document;

      const wrap = doc.createElement('div');
      wrap.className = 'oe-embed-dialog';
      const input = doc.createElement('input');
      input.type = 'url';
      input.className = 'oe-embed-dialog__input';
      input.setAttribute('placeholder', 'Paste a YouTube or Vimeo URL');
      input.setAttribute('aria-label', 'Video URL');
      const note = doc.createElement('div');
      note.className = 'oe-embed-dialog__note';
      note.textContent = 'Only YouTube and Vimeo links are supported.';
      wrap.append(input, note);

      const bookmark = editor.selection ? editor.selection.save() : null;
      const ok = await editor.ui.modal.open({
        title: 'Embed video',
        body: wrap,
        buttons: [
          { label: 'Embed', value: 'ok', variant: 'primary' },
          { label: 'Cancel', value: null },
        ],
      });
      if (ok !== 'ok') return;

      const spec = parseMediaUrl(input.value);
      if (!spec) {
        editor.emit('error', { error: new Error('Unsupported or invalid video URL'), context: 'plugin:media:parse' });
        return;
      }

      if (bookmark && editor.selection) editor.selection.restore(bookmark);
      editor.history && editor.history.takeSnapshot();
      insertEmbed(editor, spec);
    },
  };
}

export const mediaPlugin = createMediaPlugin();
