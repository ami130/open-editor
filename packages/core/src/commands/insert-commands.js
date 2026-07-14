/**
 * Insert / clipboard commands: selectAll, cut, copyAsPlainText, insertHTML,
 * insertText, insertHorizontalRule, insertNonBreakingSpace.
 *
 * Split out of text-commands.js to keep both files within the 300-line limit.
 * These all operate through SelectionManager.insertAtCursor and the clipboard
 * util — no execCommand.
 */

import { copyToClipboard } from '../utils/clipboard.js';
import { CommandManager } from './command-manager.js';

function editorEl(editor) { return editor.getEditorElement(); }
function selMgr(editor)   { return editor.selection; }
function getDoc(editor)   { return editor._iframeDoc || document; }
function getWin(editor) {
  return editor.selection && typeof editor.selection.getWindow === 'function'
    ? editor.selection.getWindow() : null;
}

// ─── selectAll (4.10) ─────────────────────────────────────────────────────────

export const selectAllCommand = {
  execute(editor) {
    const sel = selMgr(editor);
    if (sel) sel.selectAll();
    return CommandManager.SKIP_RESTORE;
  },
};

// ─── cut (4.10) ───────────────────────────────────────────────────────────────

export const cutCommand = {
  execute(editor) {
    const sel = selMgr(editor);
    if (!sel) return;
    const info = sel.get();
    // Nothing selected → nothing to cut.
    if (!info || info.collapsed) return CommandManager.SKIP_RESTORE;

    const text = sel.getSelectedText ? sel.getSelectedText() : '';
    if (!text) return CommandManager.SKIP_RESTORE;

    // Capture the live range up front so we can delete the EXACT content that
    // was copied (the selection may otherwise drift before the promise settles).
    const win = getWin(editor);
    const nativeSel = win ? win.getSelection() : null;
    const range = (nativeSel && nativeSel.rangeCount > 0 && !nativeSel.getRangeAt(0).collapsed)
      ? nativeSel.getRangeAt(0).cloneRange()
      : null;

    // Only delete AFTER a confirmed clipboard write — otherwise a failed copy
    // would destroy the user's content with no copy made (data loss). On
    // failure we keep the selection intact and emit clipboardError.
    copyToClipboard(text, getDoc(editor)).then((ok) => {
      if (editor && editor.isDestroyed && editor.isDestroyed()) return;
      if (!ok) {
        editor.emit('clipboardError', { operation: 'cut' });
        return;
      }
      if (range) {
        try {
          range.deleteContents();
          range.collapse(true);
          const s = win && win.getSelection();
          if (s) { s.removeAllRanges(); s.addRange(range); }
        } catch { /* range went stale — leave content untouched */ }
        // Reflect the deletion in placeholder / onChange.
        if (typeof editor._updatePlaceholder === 'function') editor._updatePlaceholder();
        if (editor._onChangeFn) editor._onChangeFn();
      }
    });

    return CommandManager.SKIP_RESTORE;
  },
};

// ─── copyAsPlainText (4.10) ───────────────────────────────────────────────────

export const copyAsPlainTextCommand = {
  execute(editor) {
    const sel = selMgr(editor);
    if (!sel) return;
    const text = sel.getSelectedText();
    if (!text) return;
    copyToClipboard(text, getDoc(editor)).then((ok) => {
      if (!ok && editor && !editor.isDestroyed()) {
        editor.emit('clipboardError', { operation: 'copy' });
      }
    });
    return CommandManager.SKIP_RESTORE;
  },
};

// ─── insertHTML (4.9) ─────────────────────────────────────────────────────────

export const insertHTMLCommand = {
  execute(editor, html = '') {
    if (typeof html !== 'string' || html === '') return CommandManager.SKIP_RESTORE;
    // SECURITY: insertHTML is a raw-HTML sink. Sanitize through the editor's own
    // sanitizer (respecting its config) before insertion so callers cannot inject
    // scripts / event handlers / dangerous URLs. Opt out only when the editor was
    // configured with sanitize:false.
    const clean = (editor._config && editor._config.sanitize === false)
      ? html
      : (typeof editor._sanitizeHTML === 'function' ? editor._sanitizeHTML(html) : html);
    const sel = selMgr(editor);
    if (sel) sel.insertAtCursor(clean);
    return CommandManager.SKIP_RESTORE;
  },
};

// ─── insertText (4.9) ─────────────────────────────────────────────────────────

export const insertTextCommand = {
  execute(editor, text = '') {
    const node = getDoc(editor).createTextNode(text);
    const sel = selMgr(editor);
    if (sel) sel.insertAtCursor(node);
    return CommandManager.SKIP_RESTORE;
  },
};

// ─── insertHorizontalRule (4.9) ───────────────────────────────────────────────

export const insertHorizontalRuleCommand = {
  execute(editor) {
    const doc = getDoc(editor);
    const root = editorEl(editor);
    if (!root) return;
    const hr = doc.createElement('hr');
    const p  = doc.createElement('p');
    p.appendChild(doc.createElement('br'));
    const sel = selMgr(editor);
    if (!sel) return;
    sel.insertAtCursor(hr);
    // M-01 fix: after insertAtCursor, hr.parentNode may be a detached fragment
    // if the selection range container was also removed (e.g. empty editor).
    // Fall back to appending directly to the editor element.
    const insertParent = hr.parentNode;
    if (!insertParent || !root.contains(hr)) {
      root.appendChild(hr);
      root.appendChild(p);
    } else {
      insertParent.insertBefore(p, hr.nextSibling);
    }
    // Place cursor in the <p> after the <hr>.
    const range = doc.createRange();
    range.setStart(p, 0);
    range.collapse(true);
    const win = editor.selection.getWindow();
    if (win) {
      const nativeSel = win.getSelection();
      if (nativeSel) { nativeSel.removeAllRanges(); nativeSel.addRange(range); }
    }
    return CommandManager.SKIP_RESTORE;
  },
};

// ─── insertNonBreakingSpace (4.9) ─────────────────────────────────────────────

export const insertNonBreakingSpaceCommand = {
  execute(editor) {
    const doc = getDoc(editor);
    const sel = selMgr(editor);
    // U+00A0 NON-BREAKING SPACE — not a regular U+0020 space.
    if (sel) sel.insertAtCursor(doc.createTextNode(' '));
    return CommandManager.SKIP_RESTORE;
  },
};
