/**
 * slash-command-data.js — Phase 16.6.1: the curated slash-menu entry list.
 *
 * Two kinds of entry:
 *  - COMMAND entries { id, label, keywords, command, arg? } run straight through
 *    `editor.commands.execute(command, arg)` (headings, lists, quote, code, hr).
 *  - ACTION entries { id, label, keywords, action } trigger a plugin's INSERT
 *    flow (image/table/link) by activating that plugin's toolbar button — those
 *    insertions open their own dialog and aren't in the command registry, so the
 *    slash plugin clicks the button by its data-name (see _applyPick). `action`
 *    is the toolbar button's `name` (e.g. 'insertImage'). Availability is gated
 *    on the button actually existing, so these only show when the plugin is
 *    installed and its feature granted.
 */
export const SLASH_COMMANDS = [
  { id: 'paragraph', label: 'Text', keywords: ['paragraph', 'p', 'plain'], command: 'paragraph' },
  { id: 'h1', label: 'Heading 1', keywords: ['h1', 'title', 'heading'], command: 'h1' },
  { id: 'h2', label: 'Heading 2', keywords: ['h2', 'subheading', 'heading'], command: 'h2' },
  { id: 'h3', label: 'Heading 3', keywords: ['h3', 'heading'], command: 'h3' },
  { id: 'ul', label: 'Bulleted list', keywords: ['ul', 'bullet', 'list', 'unordered'], command: 'ul' },
  { id: 'ol', label: 'Numbered list', keywords: ['ol', 'number', 'list', 'ordered'], command: 'ol' },
  { id: 'blockquote', label: 'Quote', keywords: ['quote', 'blockquote', 'citation'], command: 'blockquote' },
  { id: 'pre', label: 'Code block', keywords: ['code', 'pre', 'snippet'], command: 'pre' },
  { id: 'hr', label: 'Divider', keywords: ['hr', 'divider', 'rule', 'line'], command: 'insertHorizontalRule' },
  { id: 'image', label: 'Image', keywords: ['image', 'img', 'picture', 'photo', 'upload'], action: 'insertImage' },
  { id: 'table', label: 'Table', keywords: ['table', 'grid', 'rows', 'columns'], action: 'insertTable' },
  { id: 'link', label: 'Link', keywords: ['link', 'url', 'anchor', 'href'], action: 'insertLink' },
];

/** Filter entries whose label/keywords match the (lowercased) query. */
export function filterSlashCommands(query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return SLASH_COMMANDS;
  return SLASH_COMMANDS.filter((entry) =>
    entry.label.toLowerCase().includes(q) ||
    entry.keywords.some((k) => k.includes(q))
  );
}
