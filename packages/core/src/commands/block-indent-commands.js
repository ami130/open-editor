/**
 * Phase 4.5.9 — Block indent / outdent for non-list blocks.
 *
 * blockIndent:  wraps the current block in a <blockquote> (one level per press).
 * blockOutdent: unwraps one <blockquote> level (mirrors paragraphCommand's unwrap).
 *
 * For list items these delegate to the existing indent/outdent commands so the
 * commands work uniformly regardless of context.
 */

import { walkUp, getParentBlock } from '../selection/range-utils.js';
import { CommandManager } from './command-manager.js';

function editorEl(editor)   { return editor.getEditorElement(); }
function getDoc(editor)     { return editor._iframeDoc || (typeof document !== 'undefined' ? document : null); }
function getSelInfo(editor) { return editor.selection ? editor.selection.get() : null; }

function placeCursorAt(node, editor) {
  const win = editor.selection && editor.selection.getWindow();
  if (!win) return;
  const doc = getDoc(editor);
  if (!doc) return;
  try {
    const range = doc.createRange();
    range.setStart(node, 0);
    range.collapse(true);
    const sel = win.getSelection();
    if (sel) { sel.removeAllRanges(); sel.addRange(range); }
  } catch { /* stale node */ }
}

export const blockIndentCommand = {
  execute(editor) {
    const info = getSelInfo(editor);
    if (!info) return;
    const root = editorEl(editor);
    const doc  = getDoc(editor);
    if (!doc) return;

    const block = getParentBlock(info.startNode, root);
    if (!block || block === root) return;

    const tag = block.tagName.toLowerCase();

    // List items: delegate to the indent command (Tab behaviour)
    if (tag === 'li') {
      if (editor.commands) editor.commands.execute('indent');
      return CommandManager.SKIP_RESTORE;
    }

    // Wrap block in a new <blockquote>
    const bq = doc.createElement('blockquote');
    block.parentNode.insertBefore(bq, block);
    bq.appendChild(block);
    placeCursorAt(block.firstChild || block, editor);
    return CommandManager.SKIP_RESTORE;
  },
  isActive() { return false; },
  isEnabled(editor) {
    const info = getSelInfo(editor);
    if (!info) return false;
    const root  = editorEl(editor);
    const block = getParentBlock(info.startNode, root);
    return !!(block && block !== root);
  },
};

export const blockOutdentCommand = {
  execute(editor) {
    const info = getSelInfo(editor);
    if (!info) return;
    const root = editorEl(editor);
    const doc  = getDoc(editor);
    if (!doc) return;

    const block = getParentBlock(info.startNode, root);
    if (!block || block === root) return;

    const tag = block.tagName.toLowerCase();

    // List items: delegate to the outdent command (Shift+Tab behaviour)
    if (tag === 'li') {
      if (editor.commands) editor.commands.execute('outdent');
      return CommandManager.SKIP_RESTORE;
    }

    // Find the nearest blockquote ancestor
    const bq = walkUp(info.startNode, root,
      (n) => n.nodeType === 1 && n.tagName.toLowerCase() === 'blockquote'
    );
    if (!bq) return; // nothing to outdent

    // Lift blockquote's children one level
    const parent = bq.parentNode;
    const first  = bq.firstChild;
    while (bq.firstChild) parent.insertBefore(bq.firstChild, bq);
    parent.removeChild(bq);
    if (first) placeCursorAt(first, editor);
    return CommandManager.SKIP_RESTORE;
  },
  isActive() { return false; },
  isEnabled(editor) {
    const info = getSelInfo(editor);
    if (!info) return false;
    const root = editorEl(editor);
    const bq   = walkUp(info.startNode, root,
      (n) => n.nodeType === 1 && n.tagName.toLowerCase() === 'blockquote'
    );
    return !!bq;
  },
};
