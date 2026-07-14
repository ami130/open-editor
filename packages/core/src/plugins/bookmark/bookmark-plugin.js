/**
 * bookmark-plugin.js — 17.5.7: named in-text anchors (CKEditor free, v44).
 *
 * Inserts `<a id="name" class="oe-bookmark" contenteditable="false"></a>` at
 * the caret — an inline island rendered as a small flag (CSS ::before), zero
 * text footprint, sanitizer-round-trip-safe (a[id] allowlisted). Clicking a
 * bookmark opens the same dialog to rename or remove it. The link dialog
 * lists existing anchors so `#name` links are one pick away.
 *
 * Implements { name, install, destroy, getToolbarButtons }.
 */
import { injectBookmarkStyles } from './bookmark-styles.js';
import { t, resolveLocale } from '../../ui/toolbar/locale.js';

const NAME_RE = /^[A-Za-z][\w-]*$/;

const BOOKMARK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
</svg>`;

/** All bookmark anchors currently in the document. */
export function listBookmarks(editor) {
  return Array.from(editor.getEditorElement().querySelectorAll('a.oe-bookmark[id]'));
}

export function createBookmarkPlugin() {
  return {
    name: 'bookmark',
    _editor: null,

    install(editor) {
      this._editor = editor;
      const doc = (typeof document !== 'undefined') ? document : null;
      if (doc) injectBookmarkStyles(doc);
      this._locale = resolveLocale(editor._config.locale);

      // Click a bookmark → manage dialog (rename / remove).
      this._onClick = (e) => {
        const mark = e.target && e.target.closest && e.target.closest('a.oe-bookmark');
        if (mark && editor.getEditorElement().contains(mark)) {
          e.preventDefault();
          this._openDialog(mark);
        }
      };
      editor.getEditorElement().addEventListener('click', this._onClick);
    },

    destroy() {
      if (this._editor) {
        this._editor.getEditorElement().removeEventListener('click', this._onClick);
      }
      this._editor = null;
    },

    getToolbarButtons() {
      return [{
        name: 'bookmark',
        type: 'button',
        icon: BOOKMARK_ICON,
        tooltip: 'Bookmark',
        onClick: () => this._openDialog(null),
      }];
    },

    /** existing = the <a.oe-bookmark> being edited, or null to insert. */
    async _openDialog(existing) {
      const editor = this._editor;
      if (!editor || editor.isReadOnly()) return;
      const doc = editor.getEditorElement().ownerDocument;
      const locale = this._locale;

      const body = doc.createElement('div');
      const label = doc.createElement('label');
      label.className = 'oe-bookmark-dialog__label';
      label.textContent = t(locale, 'bookmarkName');
      const input = doc.createElement('input');
      input.type = 'text';
      input.className = 'oe-bookmark-dialog__input';
      input.value = existing ? existing.id : '';
      input.placeholder = 'section-1';
      label.appendChild(input);
      body.appendChild(label);
      const err = doc.createElement('div');
      err.className = 'oe-bookmark-dialog__error';
      body.appendChild(err);

      // Save the caret BEFORE the modal steals focus (insert mode needs it).
      const bookmark = !existing && editor.selection ? editor.selection.save() : null;

      const buttons = existing
        ? [{ label: t(locale, 'remove'), value: 'remove' },
           { label: t(locale, 'save'), value: 'save', variant: 'primary' }]
        : [{ label: t(locale, 'cancel'), value: null },
           { label: t(locale, 'save'), value: 'save', variant: 'primary' }];

      const choice = await editor.ui.modal.open({ title: t(locale, 'bookmark'), body, buttons });

      if (choice === 'remove' && existing) {
        existing.remove();
        if (editor._onChangeFn) editor._onChangeFn();
        return;
      }
      if (choice !== 'save') return;

      const name = input.value.trim();
      const taken = listBookmarks(editor).some((b) => b.id === name && b !== existing);
      if (!NAME_RE.test(name) || taken) {
        // Reopen with the invalid value so the user can correct it. (Modal has
        // closed by now; a lightweight retry keeps the flow simple.)
        return this._openDialog(existing);
      }

      if (existing) {
        existing.id = name;
      } else {
        if (bookmark && editor.selection) editor.selection.restore(bookmark);
        const a = doc.createElement('a');
        a.id = name;
        a.className = 'oe-bookmark';
        a.setAttribute('contenteditable', 'false');
        editor.selection.insertAtCursor(a);
      }
      if (editor._onChangeFn) editor._onChangeFn();
    },
  };
}

export const bookmarkPlugin = createBookmarkPlugin();
