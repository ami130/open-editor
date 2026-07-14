/**
 * link-commands.js — command + active-state helpers for the Link plugin.
 *
 * NOTE on architecture: the *insert/edit* flow opens an async modal, so it must
 * NOT be a CommandManager command — execute() is synchronous and would restore
 * its selection bookmark before the dialog resolves. That flow is driven by the
 * plugin directly (onKeyDown / toolbar onClick) with its own bookmark handling.
 *
 * Only the synchronous `unlink` operation is a real command here, and
 * `linkIsActive` is the toolbar button's active-state predicate.
 */
import { findLinkAt, unwrapLink } from './link-dom.js';
import { CommandManager } from '../../commands/command-manager.js';

/** True when the caret/selection is inside an <a> (drives toolbar highlight). */
export function linkIsActive(editor) {
  const sel = editor.selection && editor.selection.get();
  if (!sel || !sel.startNode) return false;
  return !!findLinkAt(sel.startNode, editor.getEditorElement());
}

/**
 * Synchronous unlink command: removes the <a> at the caret, keeping its text.
 * Returns false (no-op) when the caret is not inside a link.
 */
export const unlinkCommand = {
  execute(editor) {
    const sel = editor.selection && editor.selection.get();
    if (!sel || !sel.startNode) return;
    const a = findLinkAt(sel.startNode, editor.getEditorElement());
    if (!a) return;
    editor.history && editor.history.takeSnapshot();
    unwrapLink(editor, a);
    // unwrapLink placed the caret itself; returning SKIP_RESTORE stops the
    // CommandManager from restoring the pre-unwrap bookmark, which pointed into
    // the now-removed <a> and clobbered the caret (audit MEDIUM).
    return CommandManager.SKIP_RESTORE;
  },
  isActive: linkIsActive,
  isEnabled: linkIsActive,
};
