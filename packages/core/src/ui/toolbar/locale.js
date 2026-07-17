/**
 * i18n for the toolbar (7.23 / 7.24).
 * Default 'en' bundle ships here. Integrators pass `locale: 'en'` to use it,
 * or `locale: { bold: 'Gras', ... }` to override any subset of strings.
 */

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
  // 17.11 — plugin-button keys that previously hardcoded their tooltips
  // (exact same strings, so EN rendering is unchanged).
  // 17.5.1 — change case dropdown
  changeCase: 'Case',
  styles: 'Styles',
  textPartLanguage: 'Language',
  caseUpper: 'UPPERCASE',
  caseLower: 'lowercase',
  caseTitle: 'Title Case',
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
  return Object.assign({}, EN_LOCALE);
}

/** Look up a label, falling back to the key itself if missing. */
export function t(locale, key) {
  return (locale && locale[key]) || key;
}
