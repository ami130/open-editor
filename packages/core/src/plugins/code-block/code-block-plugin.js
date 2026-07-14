/**
 * code-block-plugin.js — Phase 13.7: insert a fenced code block with a language
 * selector, and make Tab insert spaces (not change focus) inside code.
 *
 * A dedicated code-block plugin is BEYOND standard Jodit (which only offers a
 * plain <pre> via the format dropdown — no language, no Tab-indent).
 *
 * Tab handling relies on the editor running plugin onKeyDown BEFORE its built-in
 * Tab handler (list-indent/table-nav). We consume Tab ONLY when the caret is
 * inside a <pre> — everywhere else we return false so list/table Tab is
 * untouched (verified interaction with Phase 4.5 block-editing + Phase 11).
 *
 * Config: `codeBlockLanguages` — [{value,label}] for the language selector.
 * Implements { name, install, destroy, getToolbarButtons, onKeyDown }.
 */
import { getClosestTag } from '../../selection/range-utils.js';
import { insertCodeBlock, tabInCode, shiftTabInCode, newlineInCode } from './code-block-dom.js';

const CODE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
</svg>`;

const DEFAULT_LANGS = [
  { value: '', label: 'Plain text' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'json', label: 'JSON' },
  { value: 'python', label: 'Python' },
  { value: 'bash', label: 'Bash' },
  { value: 'sql', label: 'SQL' },
];

export function createCodeBlockPlugin() {
  return {
    name: 'codeBlock',
    _editor: null,

    install(editor) { this._editor = editor; },
    destroy() { this._editor = null; },

    getToolbarButtons() {
      return [{
        name: 'codeBlock', type: 'button', icon: CODE_ICON,
        tooltip: 'Code block',
        onClick: () => this._open(),
        isActive: (ed) => this._inCode(ed),
      }];
    },

    _inCode(editor) {
      const info = editor.selection && editor.selection.get();
      if (!info || !info.startNode) return false;
      return !!getClosestTag(info.startNode, 'pre', editor.getEditorElement());
    },

    onKeyDown(e) {
      if (this._isComposing) return false;
      const editor = this._editor;
      // Only act when the caret is inside a code block; otherwise let list/table
      // Tab and block-editing Enter run as normal (verified non-interference).
      if (!editor || !this._inCode(editor)) return false;

      if (e.key === 'Tab') {
        // Inside code: Tab inserts spaces, Shift+Tab outdents. Consume.
        if (e.shiftKey) shiftTabInCode(editor);
        else tabInCode(editor);
        return true;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        // Inside code: a plain Enter inserts a NEWLINE — it must NOT reach
        // handleEnterSplit (which would split the <pre> into two blocks). <pre>
        // renders "\n" as a line break and it round-trips cleanly. Consuming here
        // works because plugin onKeyDown runs before the block-editing handlers.
        newlineInCode(editor);
        return true;
      }
      return false;
    },

    async _open() {
      const editor = this._editor;
      if (!editor || !editor.ui || !editor.ui.modal) return;
      const doc = editor._iframeDoc || document;

      const langs = (editor._config && Array.isArray(editor._config.codeBlockLanguages) && editor._config.codeBlockLanguages.length)
        ? editor._config.codeBlockLanguages : DEFAULT_LANGS;

      const wrap = doc.createElement('div');
      wrap.className = 'oe-codeblock-dialog';
      const label = doc.createElement('label');
      label.textContent = 'Language';
      label.className = 'oe-codeblock-dialog__label';
      const select = doc.createElement('select');
      select.className = 'oe-codeblock-dialog__select';
      for (const l of langs) {
        const opt = doc.createElement('option');
        opt.value = l.value; opt.textContent = l.label;
        select.appendChild(opt);
      }
      label.appendChild(select);
      wrap.appendChild(label);

      const bookmark = editor.selection ? editor.selection.save() : null;
      const res = await editor.ui.modal.open({
        title: 'Insert code block',
        body: wrap,
        buttons: [
          { label: 'Insert', value: 'ok', variant: 'primary' },
          { label: 'Cancel', value: null },
        ],
      });
      if (res !== 'ok') return;

      if (bookmark && editor.selection) editor.selection.restore(bookmark);
      editor.history && editor.history.takeSnapshot();
      insertCodeBlock(editor, select.value);
      editor.emit('afterCommand', { command: 'insertCodeBlock', args: [select.value] });
      if (editor._onChangeFn) editor._onChangeFn();
    },
  };
}

export const codeBlockPlugin = createCodeBlockPlugin();
