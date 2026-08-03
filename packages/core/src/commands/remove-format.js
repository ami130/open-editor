/**
 * remove-format.js — the "clear formatting" command, split out of text-commands.js
 * to keep both files under the 300-line limit.
 *
 * Strips inline formatting from the current selection (unwrapping strong/em/u/s/
 * sup/sub/code/span/mark/font/… and their style/class/color attributes). On a
 * COLLAPSED caret it escapes the outermost enclosing inline-format element so the
 * "bold → clear format → keep typing plain" flow works (previously a no-op).
 */
import { walkUp } from '../selection/range-utils.js';
import { CommandManager } from './command-manager.js';
import { unwrapInline } from './inline-unwrap.js';

function editorEl(editor) { return editor.getEditorElement(); }
function selMgr(editor)   { return editor.selection; }
function getDoc(editor)   { return editor._iframeDoc || document; }
function getWin(editor) {
  return editor.selection && typeof editor.selection.getWindow === 'function'
    ? editor.selection.getWindow() : null;
}

// The inline tags removeFormat unwraps. Exported so the sanitizer/other callers
// share ONE definition of "inline formatting".
export const INLINE_FMT_TAGS = new Set(['strong','b','em','i','u','s','del','strike','sup','sub','code','span','mark','abbr','cite','q','small','ins','font']);

export const removeFormatCommand = {
  execute(editor) {
    const sel = selMgr(editor);
    if (!sel) return;
    const info = sel.get();
    if (!info) return;
    const win = getWin(editor);
    if (!win) return;
    const nativeSel = win.getSelection();
    if (!nativeSel || nativeSel.rangeCount === 0) return;
    const root = editorEl(editor);
    const doc = getDoc(editor);

    // COLLAPSED CARET ("bold → clear format → type plain"): escape the OUTERMOST
    // enclosing inline-format element (caret after it → next char unformatted).
    if (info.collapsed) {
      let outer = null;
      for (let n = info.startNode; n && n !== root; n = n.parentNode) {
        if (n.nodeType === 1 && INLINE_FMT_TAGS.has(n.tagName.toLowerCase())) outer = n;
      }
      if (outer && outer.parentNode) {
        try {
          const r = doc.createRange();
          r.setStartAfter(outer); r.collapse(true);
          nativeSel.removeAllRanges(); nativeSel.addRange(r);
          if ((outer.textContent || '').replace(/[\u200B\uFEFF]/g, '') === '') outer.parentNode.removeChild(outer);
        } catch { /* stale range */ }
      }
      return CommandManager.SKIP_RESTORE;
    }

    // STEP 1 (C1 fix): unwrap inline-format ANCESTORS that ENCLOSE the selection
    // first — cloneContents() below only sees tags INSIDE the range, so a
    // selection inside <strong> would otherwise re-insert into the surviving
    // <strong> (silent no-op). unwrapInline is the same partial-aware unwrap.
    let guard = 0;
    for (;;) {
      if (++guard > 20) break; // safety — never loop unbounded
      const cur = nativeSel.getRangeAt(0);
      const startEl = cur.startContainer.nodeType === 1
        ? cur.startContainer : cur.startContainer.parentNode;
      const enclosing = walkUp(startEl, root, (n) =>
        n.nodeType === 1 && INLINE_FMT_TAGS.has(n.tagName.toLowerCase()));
      if (!enclosing) break;
      unwrapInline(enclosing, cur, enclosing.tagName.toLowerCase(), doc, nativeSel);
    }

    // STEP 2: clone the (now-unenclosed) selection, strip inline tags +
    // formatting attributes CONTAINED within it, re-insert.
    const range = nativeSel.getRangeAt(0);
    const fragment = range.cloneContents();
    function stripInline(node) {
      Array.from(node.childNodes).forEach((child) => {
        if (child.nodeType === 1) {
          const tag = child.tagName.toLowerCase();
          if (INLINE_FMT_TAGS.has(tag)) {
            stripInline(child);
            // Unwrap: lift children out, drop the formatting element entirely.
            while (child.firstChild) node.insertBefore(child.firstChild, child);
            node.removeChild(child);
          } else {
            // Non-inline element kept as-is — strip styling attributes so
            // removeFormat actually clears it.
            child.removeAttribute('style');
            child.removeAttribute('class');
            child.removeAttribute('color');
            child.removeAttribute('face');
            child.removeAttribute('size');
            stripInline(child);
          }
        }
      });
    }
    stripInline(fragment);
    range.deleteContents();
    const lastNode = fragment.lastChild; // place caret after the re-inserted content
    range.insertNode(fragment);
    try {
      if (lastNode) {
        range.setStartAfter(lastNode);
        range.collapse(true);
        nativeSel.removeAllRanges();
        nativeSel.addRange(range);
      }
    } catch { /* range went stale — leave selection as-is */ }
    return CommandManager.SKIP_RESTORE;
  },
};
