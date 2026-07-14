/**
 * slash-command-data.js — Phase 16.6.1: the curated slash-menu entry list.
 *
 * Deliberately scoped to CORE commands only (always registered, never plugin-
 * dependent) — headings, lists, blockquote, code block (`pre`), horizontal
 * rule. Table/image/media/link insertion trigger their own dialogs via a
 * direct onClick on their toolbar button (not the command registry), so they
 * are out of scope for this milestone; see README Phase 16.6.1.
 *
 * Each entry: { id, label, keywords, command, arg? } — `command`/`arg` are
 * passed straight to `editor.commands.execute(command, arg)`.
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
