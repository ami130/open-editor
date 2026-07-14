/**
 * paste-dialog.js — Phase 12.12: the "ask on paste" dialog — Jodit's signature
 * paste behavior. When rich HTML (or Word/Excel HTML) is pasted, prompt the
 * user how to insert it:
 *
 *   Keep            — insert the cleaned HTML (formatting preserved)
 *   Insert as Text  — (Word: "Clean") insert as escaped text, line breaks kept
 *   Insert only Text — strip everything to plain text
 *   Cancel          — do nothing
 *
 * Config surface mirrors Jodit exactly:
 *   askBeforePasteHTML      (default true)  — prompt on generic rich HTML
 *   askBeforePasteFromWord  (default true)  — prompt on Word/Excel HTML
 *   defaultActionOnPaste          (default 'keep')  — action when not prompting
 *   defaultActionOnPasteFromWord  (default null → falls back to the above)
 *
 * Returns a Promise resolving to an action string: 'keep' | 'text' | 'only' |
 * null (cancelled). Built on the editor's ModalManager (editor.ui.modal.open),
 * which resolves with the clicked button's `value`.
 */
import { t } from '../ui/toolbar/locale.js';

export const PASTE_ACTIONS = { KEEP: 'keep', TEXT: 'text', ONLY: 'only' };

/** Should we prompt for this paste? (source: 'word' | 'gdocs' | 'generic') */
export function shouldAskOnPaste(config, source) {
  if (!config) return false;
  if (source === 'word') return config.askBeforePasteFromWord !== false;
  return config.askBeforePasteHTML !== false;
}

/** The non-interactive default action for a source (when not prompting). */
export function defaultPasteAction(config, source) {
  if (!config) return PASTE_ACTIONS.KEEP;
  if (source === 'word' && config.defaultActionOnPasteFromWord) {
    return config.defaultActionOnPasteFromWord;
  }
  return config.defaultActionOnPaste || PASTE_ACTIONS.KEEP;
}

/**
 * Open the ask-on-paste dialog. Returns Promise<'keep'|'text'|'only'|null>.
 * `source` selects the wording ('word' gets the Word-specific message and the
 * middle button reads "Clean" instead of "Insert as Text").
 */
export function askPasteAction(editor, source, locale) {
  const modal = editor && editor.ui && editor.ui.modal;
  if (!modal || typeof modal.open !== 'function') {
    return Promise.resolve(defaultPasteAction(editor._config, source));
  }
  const L = locale || {};
  const isWord = source === 'word';

  const title = isWord
    ? t(L, 'pasteDialogTitleWord')
    : t(L, 'pasteDialogTitleHtml');
  const message = isWord
    ? t(L, 'pasteDialogMessageWord')
    : t(L, 'pasteDialogMessageHtml');

  const buttons = [
    { label: t(L, 'pasteKeepFormatting'), value: PASTE_ACTIONS.KEEP, variant: 'primary' },
    { label: isWord ? t(L, 'pasteClean') : t(L, 'pasteAsText'), value: PASTE_ACTIONS.TEXT },
    { label: t(L, 'pasteOnlyText'), value: PASTE_ACTIONS.ONLY },
    { label: t(L, 'cancel'), value: null },
  ];

  return modal.open({ title, body: `<p>${message}</p>`, buttons });
}
