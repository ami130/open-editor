/**
 * feature-catalog.js — the FULL editor feature catalog + the mapping from each
 * catalog feature id to the internal primitives it controls (Phase 1).
 *
 * This is the single source of truth used by every gating surface (Phase 2):
 * the main toolbar, the inline/bubble toolbar, the slash menu, keyboard
 * shortcuts, markdown autoformat, and the command registry all resolve
 * "is this primitive allowed?" through here.
 *
 * SHAPE per entry:
 *   id       — dot-namespaced catalog id (`group.feature`), stable + additive.
 *   title    — human label (admin picker + docs).
 *   group    — top-level grouping for the admin tree.
 *   commands — the editor command names this feature owns (the backbone: every
 *              surface ultimately references a command name).
 *   toolbar  — main-toolbar item `name`s (when they differ from the command,
 *              e.g. the `heading` dropdown, `alignment` control, `bgColor`).
 *
 * ADDITIVE-ONLY: never rename/remove an id (it would invalidate issued licenses).
 *
 * NOTE: the ALWAYS-ON core (typing, undo/redo, copy-paste, selection, paragraph,
 * format-cleanup) is intentionally NOT gateable — see ALWAYS_ON in
 * feature-gate.js. Those command names are deliberately omitted from sellable
 * entries below (paragraph/undo/redo/removeFormat/selectAll/cut/copy…).
 *
 * DELIBERATE DESIGN DECISION — gating is AUTHORING-only, not content-level.
 * Gating hides the ability to CREATE a feature (toolbar/command/shortcut/slash/
 * autoformat/plugin). It does NOT strip formatting that already exists or that
 * arrives via PASTE (paste/style-to-semantic.js + the sanitizer allowlist run
 * ungated on purpose). So a user CAN keep bold in a document by pasting already-
 * bold text even if text.bold is withheld — this is the accepted boundary
 * (stripping pasted markup would be destructive/data-loss), NOT a gating leak.
 */

/** @typedef {{ id:string, title:string, group:string, commands?:string[], toolbar?:string[] }} CatalogFeature */

/** @type {CatalogFeature[]} */
export const EDITOR_FEATURES = [
  // ── Text formatting ────────────────────────────────────────────────────────
  { id: 'text.bold', title: 'Bold', group: 'Text formatting', commands: ['bold'], toolbar: ['bold'] },
  { id: 'text.italic', title: 'Italic', group: 'Text formatting', commands: ['italic'], toolbar: ['italic'] },
  { id: 'text.underline', title: 'Underline', group: 'Text formatting', commands: ['underline'], toolbar: ['underline'] },
  { id: 'text.strikethrough', title: 'Strikethrough', group: 'Text formatting', commands: ['strikethrough'], toolbar: ['strikethrough'] },
  { id: 'text.superscript', title: 'Superscript', group: 'Text formatting', commands: ['superscript'], toolbar: ['superscript'] },
  { id: 'text.subscript', title: 'Subscript', group: 'Text formatting', commands: ['subscript'], toolbar: ['subscript'] },
  // inlineCode command is retained (backtick autoformat, paste/markdown round-trip)
  // but the toolbar button was removed by product decision — no `toolbar:` entry.
  { id: 'text.inlineCode', title: 'Inline code', group: 'Text formatting', commands: ['inlineCode'] },
  { id: 'text.decoration', title: 'Overline / dotted underline', group: 'Text formatting', commands: ['overline', 'dottedUnderline'] },
  { id: 'text.changeCase', title: 'Change case', group: 'Text formatting', commands: ['changeCase'], toolbar: ['changeCase'] },
  // textTransform is a CSS text-transform style command (API-only, no toolbar UI
  // today) — mapped so it's gateable and never leaks via editor.commands.execute.
  { id: 'text.transform', title: 'Text-transform (CSS)', group: 'Text formatting', commands: ['textTransform'] },
  // ── Font ─────────────────────────────────────────────────────────────────
  { id: 'font.family', title: 'Font family', group: 'Font', commands: ['fontFamily'], toolbar: ['fontFamily'] },
  { id: 'font.size', title: 'Font size', group: 'Font', commands: ['fontSize'], toolbar: ['fontSize'] },
  { id: 'font.lineHeight', title: 'Line height', group: 'Font', commands: ['lineHeight'], toolbar: ['lineHeight'] },
  { id: 'font.weight', title: 'Font weight', group: 'Font', commands: ['fontWeight'] },
  { id: 'font.spacing', title: 'Letter spacing / indent', group: 'Font', commands: ['letterSpacing', 'textIndent'] },
  // ── Color ──────────────────────────────────────────────────────────────────
  { id: 'color.text', title: 'Text color', group: 'Color', commands: ['textColor'], toolbar: ['textColor'] },
  { id: 'color.background', title: 'Background (highlight) color', group: 'Color', commands: ['backgroundColor'], toolbar: ['bgColor'] },
  // ── Paragraph / headings ─────────────────────────────────────────────────
  { id: 'paragraph.headings', title: 'Headings (H1–H6)', group: 'Paragraph', commands: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'], toolbar: ['heading'] },
  { id: 'paragraph.blockquote', title: 'Block quote', group: 'Paragraph', commands: ['blockquote'], toolbar: ['blockquote'] },
  { id: 'paragraph.codeBlock', title: 'Code block', group: 'Paragraph', commands: ['pre'] },
  { id: 'paragraph.alignment', title: 'Alignment', group: 'Paragraph', commands: ['alignLeft', 'alignCenter', 'alignRight', 'alignJustify', 'writingMode'], toolbar: ['alignment'] },
  { id: 'paragraph.styles', title: 'Named styles', group: 'Paragraph', commands: ['applyStyle'], toolbar: ['styles'] },
  { id: 'paragraph.language', title: 'Text-part language', group: 'Paragraph', commands: ['textPartLanguage'], toolbar: ['textPartLanguage'] },
  // ── Lists ────────────────────────────────────────────────────────────────
  { id: 'list.bullet', title: 'Bullet list', group: 'Lists', commands: ['ul'], toolbar: ['ul'] },
  { id: 'list.ordered', title: 'Numbered list', group: 'Lists', commands: ['ol'], toolbar: ['ol'] },
  { id: 'list.indent', title: 'Indent / outdent', group: 'Lists', commands: ['indent', 'outdent', 'blockIndent', 'blockOutdent'], toolbar: ['indent', 'outdent'] },
  { id: 'list.style', title: 'List style + start', group: 'Lists', commands: ['listStyleType', 'setListStart', 'definitionList'] },
  // ── Insert (mix of core commands + free plugins) ──────────────────────────
  { id: 'insert.hr', title: 'Horizontal rule', group: 'Insert', commands: ['insertHorizontalRule'], toolbar: ['insertHorizontalRule'], plugin: 'horizontalRule' },
  { id: 'insert.pageBreak', title: 'Page break', group: 'Insert', commands: ['insertPageBreak'], toolbar: ['insertPageBreak'] },
  { id: 'insert.html', title: 'Insert raw HTML/text', group: 'Insert', commands: ['insertHTML', 'insertText', 'insertNonBreakingSpace'] },
  // ── View / tools (toolbar chrome) ─────────────────────────────────────────
  { id: 'tools.showBlocks', title: 'Show block outlines', group: 'Tools', commands: ['showBlocks'], toolbar: ['showBlocks'] },
  { id: 'tools.fullscreen', title: 'Fullscreen', group: 'Tools', toolbar: ['fullscreen'] },
  { id: 'tools.print', title: 'Print', group: 'Tools', toolbar: ['print'] },
];

/**
 * Free PLUGIN features — gated by NOT installing the plugin (different mechanism
 * from core suppression). The `plugin` field is the plugin name the host uses.
 * (Premium plugin features already live in the entitlements registry.)
 */
export const PLUGIN_FEATURES = [
  { id: 'insert.link', title: 'Links', group: 'Insert', plugin: 'link' },
  { id: 'insert.image', title: 'Images', group: 'Insert', plugin: 'image' },
  { id: 'insert.table', title: 'Tables', group: 'Insert', plugin: 'table' },
  { id: 'insert.media', title: 'Video / media embeds', group: 'Insert', plugin: 'media' },
  { id: 'insert.emoji', title: 'Emoji', group: 'Insert', plugin: 'emoji' },
  { id: 'insert.specialChars', title: 'Special characters', group: 'Insert', plugin: 'specialChars' },
  { id: 'insert.bookmark', title: 'Bookmarks', group: 'Insert', plugin: 'bookmark', commands: ['insertBookmark', 'removeBookmark'] },
  { id: 'insert.mentions', title: '@Mentions', group: 'Insert', plugin: 'mentions' },
  { id: 'tools.findReplace', title: 'Find & replace', group: 'Tools', plugin: 'findReplace' },
  { id: 'tools.source', title: 'Source view', group: 'Tools', plugin: 'source' },
  { id: 'tools.preview', title: 'Preview', group: 'Tools', plugin: 'preview' },
  { id: 'tools.spellcheck', title: 'Spellcheck', group: 'Tools', plugin: 'spellcheck' },
  { id: 'tools.speech', title: 'Dictation (speech to text)', group: 'Tools', plugin: 'speech' },
  { id: 'tools.formatPainter', title: 'Format painter', group: 'Tools', plugin: 'formatPainter' },
  { id: 'tools.codeBlock', title: 'Code block (plugin)', group: 'Tools', plugin: 'codeBlock' },
  { id: 'tools.slashCommand', title: 'Slash commands', group: 'Tools', plugin: 'slashCommand' },
  { id: 'tools.autoformat', title: 'Markdown autoformat', group: 'Tools', plugin: 'autoformat' },
  { id: 'tools.blockDrag', title: 'Block drag-reorder', group: 'Tools', plugin: 'blockDrag' },
  { id: 'tools.resizeEditor', title: 'Resizable editor', group: 'Tools', plugin: 'resizeEditor' },
  { id: 'edit.todoList', title: 'To-do lists', group: 'Lists', plugin: 'todoList', commands: ['todoList', 'todoListChecked'] },
];

// ── Reverse lookups: primitive → feature id (used by the gating surfaces) ────

const COMMAND_TO_FEATURE = new Map();
const TOOLBAR_TO_FEATURE = new Map();
for (const f of EDITOR_FEATURES) {
  for (const c of f.commands || []) COMMAND_TO_FEATURE.set(c, f.id);
  for (const t of f.toolbar || []) TOOLBAR_TO_FEATURE.set(t, f.id);
}
for (const f of PLUGIN_FEATURES) {
  for (const c of f.commands || []) COMMAND_TO_FEATURE.set(c, f.id);
}

/** The catalog feature id that owns a given command name, or null (ungated). */
export function featureForCommand(commandName) {
  return COMMAND_TO_FEATURE.get(commandName) || null;
}
/** The catalog feature id that owns a given main-toolbar item name, or null. */
export function featureForToolbarItem(itemName) {
  return TOOLBAR_TO_FEATURE.get(itemName) || null;
}
/** The catalog feature id for a plugin name, or null. */
export function featureForPlugin(pluginName) {
  // Search both arrays: most plugins own a PLUGIN_FEATURES entry, but a plugin
  // can also ENHANCE a command/toolbar feature declared in EDITOR_FEATURES (e.g.
  // the horizontal-rule restyle plugin attaches to the built-in `insert.hr`).
  const f = PLUGIN_FEATURES.find((x) => x.plugin === pluginName)
    || EDITOR_FEATURES.find((x) => x.plugin === pluginName);
  return f ? f.id : null;
}

/** All catalog ids (editor + plugin), for the admin picker / drift tests. */
export function allEditorFeatureIds() {
  return [...EDITOR_FEATURES.map((f) => f.id), ...PLUGIN_FEATURES.map((f) => f.id)];
}
