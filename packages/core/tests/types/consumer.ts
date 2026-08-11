/**
 * 17.3 — consumer-side type check. This file never runs; it must COMPILE under
 * `tsc --strict` against index.d.ts. It exercises the frozen surface the way a
 * real TypeScript consumer would — if a declaration drifts from something this
 * file uses, the compile (and therefore the unit gate) fails.
 */
import {
  OpenEditor,
  VERSION,
  sanitize,
  debounce,
  createImagePlugin,
  createTablePlugin,
  createTodoListPlugin,
  type OpenEditorConfig,
  type EditorPlugin,
  type SelectionInfo,
  type EditorJSON,
} from 'openeditor-text';

const config: OpenEditorConfig = {
  theme: 'dark',
  placeholder: 'Type…',
  maxLength: 5000,
  imageUploadUrl: 'https://api.example.com/upload',
  autosave: { storage: 'localStorage', key: 'draft', interval: 10_000 },
  onChange: ({ html, text }) => { void html; void text; },
  mentions: { source: async (q) => [{ id: 1, label: q }] },
  locale: { bold: 'Gras' },
  textTransformations: { smartQuotes: false },
  styles: [{ label: 'Callout', element: 'p', classes: ['callout'] }],
  textPartLanguages: [{ code: 'ar', label: 'العربية' }],
};

const editor = new OpenEditor('#app', config);

// content
const html: string = editor.getHTML();
editor.setHTML('<p>hi</p>');
const json: EditorJSON = editor.getJSON();
editor.setJSON(json);
const words: number = editor.getWordCount();
const md: string = editor.getMarkdown();
void md;
const empty: boolean = editor.isEmpty();

// state
editor.setTheme('minimal');
editor.setDirection('rtl');
editor.setCSSVar('--oe-primary', '#336');
const theme: string = editor.getTheme();
const ro: boolean = editor.isReadOnly();
const ok: boolean = editor.reset();

// history
editor.undo();
const can: boolean = editor.canRedo();

// typed events — payload types must narrow per event name
editor.on('onChange', (p) => { const h: string = p.html; void h; });
editor.on('themeChange', (p) => { const t: string = p.theme; void t; });
editor.on('beforeCommand', (p) => { if (p.command === 'bold') p.preventDefault(); });
editor.on('error', (p) => { const msg: string = p.error.message; void msg; });
editor.on('some-plugin-event', (p) => { void p; }); // non-frozen names stay open

// selection
const sel: SelectionInfo | null = editor.selection.get();
if (sel && !sel.collapsed) { const t: string = editor.selection.getText(); void t; }

// commands
editor.commands.register('shout', {
  execute(ed) { ed.setHTML(ed.getHTML().toUpperCase()); },
  isActive: () => false,
});
editor.commands.execute('shout');
const active: boolean = editor.commands.isActive('bold');

// shortcuts — register binds a COMMAND NAME; matches emit the 'shortcut' event
editor.shortcuts.register('mod+shift+g', 'shout', 'Shout');
editor.on('shortcut', (p) => { void p; });
editor.shortcuts.unregister('mod+shift+g');

// plugins
const table: EditorPlugin = createTablePlugin();
editor.plugins.install(table);
editor.plugins.install(createImagePlugin());
editor.plugins.install(createTodoListPlugin());

// package-level helpers
const clean: string = sanitize('<p onclick="x">hi</p>');
const saveLater = debounce((s: string) => { void s; }, 300);
saveLater(html);
saveLater.cancel();

void VERSION; void words; void empty; void theme; void ro; void ok; void can; void active; void clean;
editor.destroy();

// T12 (§1.6) — a customer-owned upload flow must typecheck end to end.
const s3Config: OpenEditorConfig = {
  imageUploadHandler: async (file, { signal, onProgress }) => {
    const { uploadUrl, publicUrl } = await fetch('/api/sign', {
      method: 'POST', body: JSON.stringify({ name: file.name }), signal: signal ?? undefined,
    }).then((r) => r.json());
    onProgress(50);
    await fetch(uploadUrl, { method: 'PUT', body: file, signal: signal ?? undefined });
    onProgress(100);
    return { url: publicUrl, width: 1200, height: 800 };
  },
};
void s3Config;
