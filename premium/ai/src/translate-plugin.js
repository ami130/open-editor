/**
 * translate-plugin.js — raw spec (gated by index.js). A toolbar button opens a
 * language menu; picking one takes the current selection and streams the
 * translation in its place via the FREE editor.aiComplete() hook. Same
 * selection-replace pattern as Quick Actions.
 */
import { translatePrompt, TRANSLATE_LANGUAGES } from './prompts.js';

const TR_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M4 5h7M9 3v2c0 4-2 7-5 8"/><path d="M6 9c0 2 2 4 5 5"/><path d="M13 20l4-9 4 9M14.5 17h5"/>
</svg>`;

export function rawTranslateSpec(config = {}) {
  let editor = null;
  const languages = config.languages || TRANSLATE_LANGUAGES;
  let busy = false;

  // `saved` = a selection bookmark from when the menu opened; restore it before
  // reading, since the menu-item click collapsed the editable's selection.
  async function run(language, saved) {
    if (!editor || editor._destroyed || busy) return;
    const sel = editor.selection;
    if (saved && sel && sel.restore) {
      if (editor.getEditorElement) editor.getEditorElement().focus();
      sel.restore(saved);
    }
    const info = sel && sel.get ? sel.get() : null;
    const text = sel && sel.getText ? sel.getText().trim() : '';
    if (!text) { editor.emit('aiError', { reason: 'no-selection' }); return; }
    const { system, prompt } = translatePrompt(text, language);
    busy = true;
    editor.emit('aiTranslate', { language, text });
    try {
      if (info && info.range) info.range.deleteContents();
      await editor.aiComplete({ prompt, system });
    } finally {
      busy = false;
    }
  }

  function openMenu(anchorEl) {
    if (!editor || !editor.ui || !editor.ui.contextMenu) return;
    const saved = editor.selection && editor.selection.save ? editor.selection.save() : null;
    const r = anchorEl && anchorEl.getBoundingClientRect
      ? anchorEl.getBoundingClientRect() : { left: 0, bottom: 0 };
    editor.ui.contextMenu.show(r.left, r.bottom, languages.map((lang) => ({
      label: lang, action: () => run(lang, saved),
    })));
  }

  return {
    name: 'ai-translate',
    install(ed) {
      editor = ed;
      ed.aiTranslate = (language) => run(language);
    },
    destroy() {
      if (editor && editor.aiTranslate) delete editor.aiTranslate;
      editor = null;
    },
    getToolbarButtons() {
      return [{
        name: 'aiTranslate',
        type: 'button',
        icon: TR_ICON,
        tooltip: 'AI Translate',
        onClick: (ed, el) => openMenu(el),
      }];
    },
  };
}
