import { OpenEditor, VERSION, createImagePlugin, createLinkPlugin, createTablePlugin, createSpellcheckPlugin, createSpecialCharsPlugin, createEmojiPlugin, createPreviewPlugin, createFormatPainterPlugin, createResizeEditorPlugin, createFindReplacePlugin, createMediaPlugin, createCodeBlockPlugin, createSourcePlugin, createSlashCommandPlugin, createAutoformatPlugin, createMentionsPlugin, createBlockDragPlugin, createTodoListPlugin, createBookmarkPlugin } from '@open-editor-hq/core';
import { localeEs, localeFr, localeDe, localeAr } from '@open-editor-hq/core';

// Fixture user list for the @mentions e2e (16.6.5) — a real async source.
const DEMO_USERS = [
  { id: 1, label: 'alice' },
  { id: 2, label: 'alan' },
  { id: 3, label: 'bob' },
];

document.querySelector('.pg-version').textContent = `v${VERSION}`;

const editor = new OpenEditor('#editor', {
  debug: true,
  placeholder: 'Start typing…',
  minHeight: 300,
  defaultContent: '',
  imageAllowDataUri: true,
  tableAvailableClasses: [
    { value: 'table-bordered', label: 'Bordered' },
    { value: 'table-striped', label: 'Striped' },
  ],
  mentions: {
    source: (query) => Promise.resolve(
      DEMO_USERS.filter((u) => u.label.toLowerCase().includes((query || '').toLowerCase()))
    ),
  },
});

// Expose for Playwright tests immediately — 'ready' fires synchronously
// during construction so an on('ready') handler registered here would miss it.
window.__openEditorInstance = editor;
// Constructor exposed for the memory-leak e2e (16.5.6): create/destroy cycles.
window.__OpenEditor = OpenEditor;
// 17.11 — locale packs exposed for the RTL/i18n e2e (locale-rtl.test.js).
window.__OpenEditorLocales = { es: localeEs, fr: localeFr, de: localeDe, ar: localeAr };
window.__playgroundFactories = { todo: createTodoListPlugin };

// Install plugins immediately — 'ready' already fired synchronously above.
// Use the factory so each editor instance gets its own plugin state.
editor.plugins.install(createImagePlugin());
editor.plugins.install(createLinkPlugin());
editor.plugins.install(createTablePlugin());
editor.plugins.install(createSpellcheckPlugin());
editor.plugins.install(createSpecialCharsPlugin());
editor.plugins.install(createEmojiPlugin());
editor.plugins.install(createPreviewPlugin());
editor.plugins.install(createFormatPainterPlugin());
editor.plugins.install(createResizeEditorPlugin());
editor.plugins.install(createFindReplacePlugin());
editor.plugins.install(createMediaPlugin());
editor.plugins.install(createCodeBlockPlugin());
editor.plugins.install(createSourcePlugin());
editor.plugins.install(createSlashCommandPlugin());
editor.plugins.install(createAutoformatPlugin());
editor.plugins.install(createMentionsPlugin());
editor.plugins.install(createBlockDragPlugin());
editor.plugins.install(createTodoListPlugin());
editor.plugins.install(createBookmarkPlugin());

editor.on('ready', () => {
  console.log('[Playground] Editor ready');
});

editor.on('onChange', ({ html }) => {
  console.log('[onChange]', html);
});
