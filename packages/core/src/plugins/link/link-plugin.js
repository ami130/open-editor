/**
 * link-plugin.js — Link Plugin entry point (Phase 10).
 *
 * Implements the Phase 8 plugin interface:
 *   { name, install(editor), destroy(), getToolbarButtons(), onKeyDown(e) }
 *
 * The insert/edit flow is ASYNC (opens a modal), so it is NOT a CommandManager
 * command — execute() is synchronous and would restore its bookmark before the
 * dialog resolves. Ctrl/Cmd+K and the toolbar button call _openDialog() directly
 * with their own bookmark save/restore. Only the synchronous `unlink` is a real
 * command.
 *
 * Usage:
 *   import { linkPlugin } from './plugins/link/link-plugin.js';
 *   editor.plugins.install(linkPlugin);
 */
import { openLinkDialog }      from './link-dialog.js';
import { injectLinkStyles }    from './link-styles.js';
import { LinkPopover }         from './link-popover.js';
import { unlinkCommand, linkIsActive } from './link-commands.js';
import {
  findLinkAt, wrapSelectionInLink, updateLink, unwrapLink,
} from './link-dom.js';
import {
  installPasteAutolink, installTypedAutolink, installDblClickOpen, installReadonlyNavGuard,
} from './link-behaviors.js';

const INSERT_LINK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
</svg>`;

export function createLinkPlugin() {
  return {
    name: 'link',

    _editor:            null,
    _popover:           null,
    _behaviorCleanups:  null,
    _onSelChange:       null,

    // ─── install ──────────────────────────────────────────────────────────────

    install(editor) {
      this._editor = editor;

      const doc = (editor._wrapper && editor._wrapper.ownerDocument) || document;
      injectLinkStyles(doc);

      // Only the synchronous unlink is a real command. Insert/edit is async and
      // driven via onKeyDown / toolbar onClick (see _openDialog).
      editor.commands.register('unlink', unlinkCommand);

      // Hover popover; wire Edit/Unlink to the plugin's own handlers.
      this._popover = new LinkPopover(editor);
      this._popover.onEdit = (a) => this._openDialog(a);
      this._popover.onUnlink = (a) => {
        if (editor.isReadOnly && editor.isReadOnly()) return; // readonly: don't mutate
        editor.history && editor.history.takeSnapshot();
        unwrapLink(editor, a);
        editor.emit('afterCommand', { command: 'unlink', args: [] });
        if (editor._onChangeFn) editor._onChangeFn();
      };

      // Auxiliary behaviours. Paste uses editor.on (auto-cleaned); click/dblclick
      // are not core events, so those return cleanup fns we run on destroy.
      installPasteAutolink(editor);
      installTypedAutolink(editor);
      this._behaviorCleanups = [
        installDblClickOpen(editor),
        installReadonlyNavGuard(editor),
      ];

      // Show the popover when the caret enters an <a>; hide when it leaves.
      this._onSelChange = () => {
        const pop = this._popover;
        if (!pop) return;
        const sel = editor.selection && editor.selection.get();
        const node = sel && sel.startNode;
        const a = node ? findLinkAt(node, editor.getEditorElement()) : null;
        if (a) pop.showFor(a);
        else pop.hide();
      };
      editor.on('selectionChange', this._onSelChange);
    },

    // ─── destroy ──────────────────────────────────────────────────────────────

    destroy() {
      const editor = this._editor;
      if (editor) {
        if (this._onSelChange) editor.off('selectionChange', this._onSelChange);
        editor.commands && editor.commands.unregister('unlink');
      }
      if (this._behaviorCleanups) {
        for (const fn of this._behaviorCleanups) { try { fn(); } catch { /* ignore */ } }
      }
      if (this._popover) { this._popover.destroy(); this._popover = null; }
      this._behaviorCleanups = null;
      this._onSelChange = null;
      this._editor = null;
    },

    // ─── toolbar button ─────────────────────────────────────────────────────────

    getToolbarButtons() {
      return [{
        name:     'insertLink',
        type:     'button',
        icon:     INSERT_LINK_ICON,
        tooltip:  'Insert Link',
        onClick:  () => this._openDialog(null),
        isActive: (ed) => linkIsActive(ed),
      }];
    },

    // ─── keydown: Ctrl/Cmd+K opens the dialog ─────────────────────────────────

    onKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'k' || e.key === 'K')) {
        const editor = this._editor;
        const sel = editor && editor.selection && editor.selection.get();
        const existing = sel && sel.startNode
          ? findLinkAt(sel.startNode, editor.getEditorElement())
          : null;
        this._openDialog(existing || null);
        return true;
      }
      return false;
    },

    // ─── async insert/edit ──────────────────────────────────────────────────────

    async _openDialog(existingLink) {
      const editor = this._editor;
      if (!editor) return;
      // Readonly: link insert/edit mutates content — refuse. (Ctrl+K and the
      // toolbar button are already blocked upstream, but the popover Edit path
      // and direct calls reach here too.)
      if (editor.isReadOnly && editor.isReadOnly()) return;

      const bookmark = editor.selection ? editor.selection.save() : null;

      let result;
      try {
        result = await openLinkDialog(editor, existingLink);
      } catch (err) {
        editor.emit('error', { error: err, context: 'plugin:link:dialog' });
        return;
      }
      if (!result) return; // cancelled

      if (bookmark && editor.selection) editor.selection.restore(bookmark);
      else { const el = editor.getEditorElement(); if (el) el.focus(); }

      editor.history && editor.history.takeSnapshot();

      // Unlink button in the (edit-mode) dialog.
      if (result.unlink) {
        if (existingLink) {
          unwrapLink(editor, existingLink);
          this._popover && this._popover.hide();
          editor.emit('afterCommand', { command: 'unlink', args: [] });
          if (editor._onChangeFn) editor._onChangeFn();
        }
        return;
      }

      const attrs = {
        href:      result.href,
        target:    result.target,
        nofollow:  result.nofollow,
        className: result.className,
        ariaLabel: result.ariaLabel,
        color:     result.color,
      };

      if (existingLink) updateLink(existingLink, attrs, result.text);
      else wrapSelectionInLink(editor, attrs, result.text);

      editor.emit('afterCommand', { command: existingLink ? 'updateLink' : 'insertLink', args: [] });
      if (editor._onChangeFn) editor._onChangeFn();
    },
  };
}

export const linkPlugin = createLinkPlugin();
