/**
 * Text / inline commands: bold, italic, underline, strikethrough,
 * superscript, subscript, inline code, clipboard, and insert helpers.
 *
 * Rules:
 *  - Never use execCommand for formatting — it requires browser focus at the
 *    exact moment of the call, which is not guaranteed after toolbar clicks.
 *    Use direct DOM range manipulation instead.
 *  - Always walk the DOM via walkUp() to detect active state.
 */

import { walkUp } from '../selection/range-utils.js';
import { CommandManager } from './command-manager.js';
import { rangeCrossesBlocks, wrapBlocksInline } from './inline-block-wrap.js';
import { selectionFullyFormatted, unwrapAcrossRange, denestSameTag } from './inline-toggle-range.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function editorEl(editor) { return editor.getEditorElement(); }
function selMgr(editor)   { return editor.selection; }
function getDoc(editor)   { return editor._iframeDoc || document; }

function insideTag(editor, tagName) {
  const sel = selMgr(editor);
  if (!sel) return false;
  const info = sel.get();
  if (!info) return false;
  return !!walkUp(info.startNode, editorEl(editor), (n) =>
    n.nodeType === 1 && n.tagName.toLowerCase() === tagName
  );
}

function getWin(editor) {
  return editor.selection && typeof editor.selection.getWindow === 'function'
    ? editor.selection.getWindow() : null;
}

/**
 * Toggle an inline semantic element (strong, em, u, s, sup, sub) around the
 * current selection using DOM range operations — no execCommand needed.
 *
 * - Selection already inside the target element → unwrap it.
 * - Non-collapsed selection not yet wrapped → wrap the selected range.
 * - Collapsed cursor not yet wrapped → insert an empty element and drop the
 *   cursor inside it, so the next typed characters are formatted (Jodit/Word
 *   "pending format" behaviour). Re-invoking on the still-empty element removes
 *   it, so the toggle is reversible before typing.
 */
function toggleInlineDom(editor, tag) {
  const sel = selMgr(editor);
  if (!sel) return;
  const info = sel.get();
  if (!info) return;

  const root = editorEl(editor);
  const doc  = getDoc(editor);
  const win  = getWin(editor);
  if (!win) return;

  const nativeSel = win.getSelection();
  if (!nativeSel || nativeSel.rangeCount === 0) return;
  const range = nativeSel.getRangeAt(0).cloneRange();

  // Check if the cursor/selection is already inside this tag.
  const existing = walkUp(info.startNode, root, (n) =>
    n.nodeType === 1 && n.tagName.toLowerCase() === tag
  );

  // Toggle-OFF only when the WHOLE selection is already formatted. Deciding
  // purely on `existing` (start node inside the tag) was wrong in two ways:
  //  - BUG-3: a selection spanning several already-formatted BLOCKS only found
  //    the first block's wrapper, so unwrap left later blocks still formatted
  //    (toggle not reversible across blocks).
  //  - BUG-4: a selection that STARTS in the tag but extends into unformatted
  //    text unwrapped instead of extending the format (Word/Jodit add it to the
  //    whole selection). Now a partial/mixed selection falls through to ADD.
  if (existing) {
    if (range.collapsed) {
      // Collapsed cursor inside element → unwrap the whole element, place cursor after content.
      const parent = existing.parentNode;
      if (parent) {
        let lastChild = null;
        while (existing.firstChild) { lastChild = existing.firstChild; parent.insertBefore(lastChild, existing); }
        parent.removeChild(existing);
        if (lastChild) {
          try {
            const r = doc.createRange();
            r.setStartAfter(lastChild); r.collapse(true);
            nativeSel.removeAllRanges(); nativeSel.addRange(r);
          } catch { /* ignore */ }
        }
      }
      return;
    }
    if (selectionFullyFormatted(range, root, tag)) {
      unwrapAcrossRange(range, root, tag, doc, nativeSel);
      return;
    }
    // Partial / mixed / cross-block coverage → fall through to ADD below.
  }

  // Collapsed cursor → create an empty wrapper and place the caret inside it so
  // the next typed text is formatted. Use a zero-width space so the empty inline
  // element has a text node the caret can sit in (browsers collapse truly empty
  // inline elements). The ZWSP is stripped on serialization elsewhere.
  if (info.collapsed) {
    try {
      const wrapper = doc.createElement(tag);
      const zwsp = doc.createTextNode('​');
      wrapper.appendChild(zwsp);
      // On an EMPTY block the caret sits on the <br> placeholder, and a raw
      // range.insertNode there lands the wrapper in an invalid spot (inside/beside
      // the <br>) that the browser discards on reflow — so the next typed char
      // came out UNformatted. Replace the lone <br> with the wrapper so the caret
      // is in a valid, editable position. startNode is either the <br> itself
      // (empty editor) or a block whose only child is that <br>.
      const sn = info.startNode;
      let brPlaceholder = null;
      if (sn && sn.nodeType === 1 && sn.nodeName === 'BR') {
        brPlaceholder = sn;
      } else if (sn && sn.nodeType === 1 && sn.childNodes.length === 1
        && sn.firstChild && sn.firstChild.nodeName === 'BR') {
        brPlaceholder = sn.firstChild;
      }
      if (brPlaceholder && brPlaceholder.parentNode) {
        brPlaceholder.parentNode.replaceChild(wrapper, brPlaceholder);
      } else {
        range.insertNode(wrapper);
      }
      const r = doc.createRange();
      r.setStart(zwsp, 1);
      r.collapse(true);
      nativeSel.removeAllRanges();
      nativeSel.addRange(r);
    } catch { /* ignore */ }
    return;
  }

  // Non-collapsed selection → wrap it.
  // If the selection CROSSES A BLOCK BOUNDARY (spans ≥2 block elements) the
  // range contains block elements; wrapping them in an inline tag produces
  // invalid HTML (<strong><p>…</p></strong>). Apply the format inside each block
  // instead. C2 fix: this used to only trigger when commonAncestor === root, so
  // a cross-block selection inside a <div>/<td>/<blockquote> slipped through and
  // wrapped the blocks. Now we detect block-crossing structurally.
  if (rangeCrossesBlocks(range, root)) {
    try {
      wrapBlocksInline(root, range, tag, doc, nativeSel);
    } catch { /* ignore */ }
    return;
  }
  try {
    const wrapper = doc.createElement(tag);
    // extractContents moves the selected DOM nodes into a DocumentFragment.
    const fragment = range.extractContents();
    wrapper.appendChild(fragment);
    // BUG-4: a mixed selection (part already in `tag`) would leave the old inner
    // tag nested in the new wrapper — flatten those redundant same-tag children.
    denestSameTag(wrapper, tag);
    range.insertNode(wrapper);
    // Re-select the wrapper contents so the user can see the change.
    const newRange = doc.createRange();
    newRange.selectNodeContents(wrapper);
    nativeSel.removeAllRanges();
    nativeSel.addRange(newRange);
  } catch { /* ignore range errors */ }
}


// ─── Bold (4.3) ───────────────────────────────────────────────────────────────

export const boldCommand = {
  execute(editor) { toggleInlineDom(editor, 'strong'); return CommandManager.SKIP_RESTORE; },
  isActive(editor) { return insideTag(editor, 'strong'); },
};

// ─── Italic (4.3) ─────────────────────────────────────────────────────────────

export const italicCommand = {
  execute(editor) { toggleInlineDom(editor, 'em'); return CommandManager.SKIP_RESTORE; },
  isActive(editor) { return insideTag(editor, 'em'); },
};

// ─── Underline (4.3) ──────────────────────────────────────────────────────────

export const underlineCommand = {
  execute(editor) { toggleInlineDom(editor, 'u'); return CommandManager.SKIP_RESTORE; },
  isActive(editor) { return insideTag(editor, 'u'); },
};

// ─── Strikethrough (4.3) ──────────────────────────────────────────────────────

export const strikethroughCommand = {
  execute(editor) { toggleInlineDom(editor, 's'); return CommandManager.SKIP_RESTORE; },
  isActive(editor) {
    return insideTag(editor, 's') || insideTag(editor, 'del') || insideTag(editor, 'strike');
  },
};

// ─── Superscript / Subscript (4.3) — mutually exclusive ───────────────────────
// Turning one ON removes the other first (Word/CKEditor semantics): you can't be
// both super- and sub-script at once. When the target is already active this is a
// plain toggle-off, so we only clear the opposite when ADDING.

// True if the opposite tag appears ANYWHERE the selection touches — not just at
// the start node. I6: a selection that STARTS in plain text but extends into a
// <sub> must still drop the sub before applying sup, or both end up applied.
function oppositeInSelection(editor, opposite) {
  const sel = selMgr(editor);
  const info = sel && sel.get();
  if (!info) return false;
  if (info.collapsed || !info.range) return insideTag(editor, opposite);
  // Scan the selected sub-tree for the opposite tag intersecting the range.
  const scopeNode = info.range.commonAncestorContainer;
  const scope = scopeNode.nodeType === 1 ? scopeNode : scopeNode.parentNode;
  if (!scope) return insideTag(editor, opposite);
  if (scope.tagName && scope.tagName.toLowerCase() === opposite) return true;
  for (const el of Array.from(scope.querySelectorAll(opposite))) {
    try { if (!info.range.intersectsNode || info.range.intersectsNode(el)) return true; }
    catch { return true; }
  }
  return insideTag(editor, opposite);
}

function toggleVerticalAlign(editor, tag, opposite) {
  if (!insideTag(editor, tag) && oppositeInSelection(editor, opposite)) {
    // Remove the opposite EVERYWHERE in the selection (range-aware), not just at
    // the caret's ancestor — insideTag alone missed a partial-into-opposite range.
    const sel = selMgr(editor);
    const info = sel && sel.get();
    const win = (sel && typeof sel.getWindow === 'function') ? sel.getWindow() : null;
    const nativeSel = win && win.getSelection();
    if (info && info.range && nativeSel) {
      unwrapAcrossRange(info.range, editorEl(editor), opposite, getDoc(editor), nativeSel);
    } else {
      toggleInlineDom(editor, opposite);
    }
  }
  toggleInlineDom(editor, tag);
  return CommandManager.SKIP_RESTORE;
}

export const superscriptCommand = {
  execute(editor) { return toggleVerticalAlign(editor, 'sup', 'sub'); },
  isActive(editor) { return insideTag(editor, 'sup'); },
};

export const subscriptCommand = {
  execute(editor) { return toggleVerticalAlign(editor, 'sub', 'sup'); },
  isActive(editor) { return insideTag(editor, 'sub'); },
};

// ─── Inline code span (4.4) ───────────────────────────────────────────────────

export const inlineCodeCommand = {
  execute(editor) { toggleInlineDom(editor, 'code'); return CommandManager.SKIP_RESTORE; },
  isActive(editor) { return insideTag(editor, 'code'); },
};

// removeFormat lives in its own module (kept text-commands.js under 300 lines);
// re-export it so existing importers (setup-commands.js) keep their import path.
export { removeFormatCommand } from './remove-format.js';

