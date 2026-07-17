/**
 * quick-actions-plugin.js — raw spec (gated by index.js). A toolbar button
 * opens the editor's context menu listing AI Quick Actions; picking one takes
 * the current selection, removes it, and streams the transformed text in its
 * place via the FREE editor.aiComplete() hook. Requires aiEndpoint (free tier);
 * if absent, aiComplete emits aiError:no-endpoint (surfaced, not silent).
 */
import { QUICK_ACTIONS } from './prompts.js';

const AI_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15l-1.9-4.1L5.5 9l4.6-1.4L12 3z"/><path d="M19 14l.9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14z"/>
</svg>`;

export function rawQuickActionsSpec(config = {}) {
  let editor = null;
  const actions = config.actions || QUICK_ACTIONS;
  let busy = false;

  /**
   * Run one quick action against the selection.
   * @param {object} action
   * @param {*} [saved] a selection bookmark captured when the menu opened.
   *   Clicking a menu item collapses the editable's selection, so we MUST
   *   restore this snapshot before reading/replacing — otherwise the text is
   *   empty and the action silently no-ops (the bug the user hit). When called
   *   imperatively (no menu), `saved` is absent and we use the live selection.
   */
  async function run(action, saved) {
    if (!editor || editor._destroyed || busy) return;
    const sel = editor.selection;
    if (saved && sel && sel.restore) {
      if (editor.getEditorElement) editor.getEditorElement().focus();
      sel.restore(saved);
    }
    const info = sel && sel.get ? sel.get() : null;
    const text = sel && sel.getText ? sel.getText().trim() : '';
    if (!text) { editor.emit('aiError', { reason: 'no-selection' }); return; }
    const { system, prompt } = action.build(text);

    busy = true;
    editor.emit('aiQuickAction', { id: action.id, text });
    try {
      // Replace the selection: delete its contents (caret stays there), then
      // let aiComplete stream the replacement in at that caret.
      if (info && info.range) info.range.deleteContents();
      await editor.aiComplete({ prompt, system });
    } finally {
      busy = false;
    }
  }

  /** Open the action menu near a given element (the toolbar button). */
  function openMenu(anchorEl) {
    if (!editor || !editor.ui || !editor.ui.contextMenu) return;
    // Snapshot the selection NOW, before the menu steals focus/collapses it.
    const saved = editor.selection && editor.selection.save ? editor.selection.save() : null;
    const r = anchorEl && anchorEl.getBoundingClientRect
      ? anchorEl.getBoundingClientRect()
      : { left: 0, bottom: 0 };
    const items = actions.map((a) => ({ label: a.label, action: () => run(a, saved) }));
    editor.ui.contextMenu.show(r.left, r.bottom, items);
  }

  return {
    name: 'ai-quick-actions',
    install(ed) {
      editor = ed;
      // Imperative API: run an action by id (used by tests / integrators).
      ed.aiQuickAction = (id) => {
        const a = actions.find((x) => x.id === id);
        return a ? run(a) : Promise.resolve();
      };
    },
    destroy() {
      if (editor && editor.aiQuickAction) delete editor.aiQuickAction;
      editor = null;
    },
    getToolbarButtons() {
      return [{
        name: 'aiQuickActions',
        type: 'button',
        icon: AI_ICON,
        tooltip: 'AI Quick Actions',
        onClick: (ed, el) => openMenu(el),
      }];
    },
  };
}
