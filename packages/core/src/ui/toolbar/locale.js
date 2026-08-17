/**
 * i18n for the toolbar (7.23 / 7.24).
 * Default 'en' bundle ships here. Integrators pass `locale: 'es'` to select a
 * shipped pack, or `locale: { bold: 'Gras', ... }` to override any subset of
 * strings.
 */
import { es } from '../../locales/es.js';
import { fr } from '../../locales/fr.js';
import { de } from '../../locales/de.js';
import { ar } from '../../locales/ar.js';

/**
 * Packs selectable by code. Deliberately a plain object rather than a lazy
 * import: under runtime delivery the whole engine arrives as ONE file, so there
 * is no separate chunk to defer — a dynamic import here would add asynchrony to
 * a synchronous call for no payload saving whatsoever.
 */
const SHIPPED_LOCALES = { es, fr, de, ar };

export const EN_LOCALE = {
  bold: 'Bold',
  italic: 'Italic',
  underline: 'Underline',
  strikethrough: 'Strikethrough',
  superscript: 'Superscript',
  subscript: 'Subscript',
  inlineCode: 'Code (inline)',
  removeFormat: 'Clear formatting',
  ul: 'Bulleted list',
  ol: 'Numbered list',
  indent: 'Indent',
  outdent: 'Outdent',
  alignment: 'Alignment',
  alignLeft: 'Align left',
  alignCenter: 'Align center',
  alignRight: 'Align right',
  alignJustify: 'Justify',
  blockquote: 'Quote',
  undo: 'Undo',
  redo: 'Redo',
  insertHorizontalRule: 'Horizontal rule',
  insertPageBreak: 'Page break',
  textColor: 'Text color',
  bgColor: 'Background color',
  fullscreen: 'Fullscreen',
  print: 'Print',
  showBlocks: 'Show blocks',
  a11yHelp: 'Keyboard shortcuts',
  spellcheck: 'Spellcheck',
  specialChars: 'Special characters',
  emoji: 'Emoji',
  preview: 'Preview',
  formatPainter: 'Format painter',
  findReplace: 'Find and replace',
  media: 'Embed video',
  codeBlock: 'Code block',
  source: 'Source code',
  speech: 'Dictate (speech to text)',
  // 17.11 — plugin-button keys that previously hardcoded their tooltips
  // (exact same strings, so EN rendering is unchanged).
  // 17.5.1 — change case dropdown
  changeCase: 'Case',
  styles: 'Styles',
  textPartLanguage: 'Language',
  caseUpper: 'UPPERCASE',
  caseLower: 'lowercase',
  caseTitle: 'Title Case',
  defaultValue: 'Default',
  insertImage: 'Insert Image',
  insertLink: 'Insert Link',
  insertTable: 'Insert Table',
  todoList: 'To-do list',
  heading: 'Format',
  paragraph: 'Paragraph',
  h1: 'Heading 1',
  h2: 'Heading 2',
  h3: 'Heading 3',
  h4: 'Heading 4',
  h5: 'Heading 5',
  h6: 'Heading 6',
  pre: 'Preformatted',
  fontFamily: 'Font',
  fontSize: 'Size',
  lineHeight: 'Line height',
  listDisc: 'Bullet (Disc)',
  listCircle: 'Circle',
  listSquare: 'Square',
  listDecimal: 'Numbered (1, 2, 3)',
  listLowerAlpha: 'Lower Alpha (a, b, c)',
  listLowerGreek: 'Lower Greek (α, β, γ)',
  listLowerRoman: 'Lower Roman (i, ii, iii)',
  listUpperAlpha: 'Upper Alpha (A, B, C)',
  listUpperRoman: 'Upper Roman (I, II, III)',
  words: 'words',
  chars: 'chars',
  selected: 'selected',
  line: 'Ln',
  col: 'Col',
  // Phase 12 — paste engine (ask-on-paste dialog)
  cancel: 'Cancel',
  close: 'Close',
  save: 'Save',
  remove: 'Remove',
  bookmark: 'Bookmark',
  bookmarkName: 'Name',
  bookmarkNameInvalid: 'Use letters, numbers, and dashes; start with a letter.',
  bookmarkNameTaken: 'That name is already used in this document.',
  bookmarkNameRequired: 'Enter a name for this bookmark.',
  bookmarkEdit: 'Edit bookmark',
  bookmarkCopyLink: 'Copy link (#name)',
  bookmarkIcon: 'Icon',
  bookmarkColor: 'Color',
  bookmarksPanel: 'Bookmarks',
  bookmarksEmpty: 'No bookmarks yet',
  pasteKeepFormatting: 'Keep',
  pasteAsText: 'Insert as Text',
  pasteClean: 'Clean',
  pasteOnlyText: 'Insert only Text',
  pasteDialogTitleHtml: 'Paste as HTML',
  pasteDialogTitleWord: 'Word Paste Detected',
  pasteDialogMessageHtml: 'The pasted content is rich HTML. Keep its formatting, or clean it up?',
  pasteDialogMessageWord: 'The pasted content is coming from Microsoft Word/Excel. Keep the format or clean it up?',
};

/**
 * Resolve a locale config value into a complete string bundle.
 * - 'en' (or any string) → built-in EN bundle.
 * - plain object → EN bundle with the object's keys overridden.
 * Returns a fresh object so callers can't mutate the shared default.
 */
export function resolveLocale(localeConfig) {
  if (localeConfig && typeof localeConfig === 'object' && !Array.isArray(localeConfig)) {
    return Object.assign({}, EN_LOCALE, localeConfig);
  }
  /**
   * A STRING code selects a shipped pack — `locale: 'es'`.
   *
   * ─── WHY THIS EXISTS ──────────────────────────────────────────────────────
   * Under runtime delivery there is no way to IMPORT a pack: the engine is
   * downloaded at page load, so `import { localeEs } from 'openeditor-text'`
   * has nothing on disk to bind to and `openeditor-text/locales/*` does not
   * resolve. The four packs were still compiled into the bundle, but nothing
   * could select them — Spanish, French, German and Arabic were shipped and
   * unreachable, and `locale: 'es'` silently fell through to English rather
   * than saying so.
   *
   * Matching by code closes that: the packs travel WITH the engine, so the
   * mechanism that made them unimportable is the same one that makes a code
   * sufficient.
   *
   * Case-insensitive, and a region suffix is honoured by its base language
   * (`'es-MX'` → Spanish), because an integrator reading `navigator.language`
   * gets region-tagged values and would otherwise silently get English.
   */
  if (typeof localeConfig === 'string') {
    const base = localeConfig.trim().toLowerCase().split(/[-_]/)[0];
    const pack = SHIPPED_LOCALES[base];
    if (pack) return Object.assign({}, EN_LOCALE, pack);
  }
  // Unknown code, null, or anything else → English. Never throws: a typo'd
  // locale must degrade to a working editor, not a broken one.
  return Object.assign({}, EN_LOCALE);
}

/** Look up a label, falling back to the key itself if missing. */
export function t(locale, key) {
  return (locale && locale[key]) || key;
}
