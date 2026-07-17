/**
 * chat-plugin.js — raw spec (gated by index.js). A toolbar button opens the AI
 * Chat panel in a modal. The panel's completions go through the FREE
 * editor.aiComplete() hook WITHOUT auto-inserting (insert:false) — the user
 * chooses when to drop a reply at the caret via the panel's Insert button.
 */
import { buildChatPanel } from './chat-panel.js';

const CHAT_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 10h.01M12 10h.01M16 10h.01"/>
</svg>`;

export function rawChatSpec() {
  let editor = null;

  function docFor() {
    return editor._iframeDoc || (typeof document !== 'undefined' ? document : null);
  }

  function open() {
    if (!editor || !editor.ui || !editor.ui.modal) return;
    const doc = docFor();
    if (!doc) return;
    // Snapshot the caret NOW — the modal will take focus and collapse the
    // editable's selection, so "Insert into document" would otherwise insert
    // nowhere (or at a stale caret). Restore it right before inserting.
    const savedCaret = editor.selection && editor.selection.save ? editor.selection.save() : null;
    const panel = buildChatPanel(doc, {
      // Chat replies do NOT auto-insert; the panel reads them for display and
      // inserts on demand. insert:false keeps aiComplete from touching the doc.
      complete: (o) => editor.aiComplete({ ...o, insert: false }),
      onInsert: (text) => {
        if (!editor.selection) return;
        if (editor.getEditorElement) editor.getEditorElement().focus();
        if (savedCaret && editor.selection.restore) editor.selection.restore(savedCaret);
        editor.selection.insertAtCursor(text);
        if (editor._onChangeFn) editor._onChangeFn();
      },
    });
    editor.ui.modal.open({ title: 'AI Chat', body: panel.node });
    editor.emit('afterCommand', { command: 'aiChat', args: [] });
  }

  return {
    name: 'ai-chat',
    install(ed) {
      editor = ed;
      ed.openAiChat = open;
    },
    destroy() {
      if (editor && editor.openAiChat === open) delete editor.openAiChat;
      editor = null;
    },
    getToolbarButtons() {
      return [{
        name: 'aiChat',
        type: 'button',
        icon: CHAT_ICON,
        tooltip: 'AI Chat',
        readOnlyExempt: true, // opening the panel is safe; inserting is user-driven
        onClick: () => open(),
      }];
    },
  };
}
