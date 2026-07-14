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
import { unwrapInline } from './inline-unwrap.js';
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
      range.insertNode(wrapper);
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

// ─── Superscript (4.3) ────────────────────────────────────────────────────────

export const superscriptCommand = {
  execute(editor) { toggleInlineDom(editor, 'sup'); return CommandManager.SKIP_RESTORE; },
  isActive(editor) { return insideTag(editor, 'sup'); },
};

// ─── Subscript (4.3) ──────────────────────────────────────────────────────────

export const subscriptCommand = {
  execute(editor) { toggleInlineDom(editor, 'sub'); return CommandManager.SKIP_RESTORE; },
  isActive(editor) { return insideTag(editor, 'sub'); },
};

// ─── Inline code span (4.4) ───────────────────────────────────────────────────

export const inlineCodeCommand = {
  execute(editor) { toggleInlineDom(editor, 'code'); return CommandManager.SKIP_RESTORE; },
  isActive(editor) { return insideTag(editor, 'code'); },
};

// ─── removeFormat (4.10) ──────────────────────────────────────────────────────
// Remove all inline formatting from the selected range by unwrapping any
// span/strong/em/u/s/sup/sub/code elements inside the selection.

const INLINE_FMT_TAGS = new Set(['strong','b','em','i','u','s','del','strike','sup','sub','code','span','mark','abbr','cite','q','small','ins','font']);

export const removeFormatCommand = {
  execute(editor) {
    const sel = selMgr(editor);
    if (!sel) return;
    const info = sel.get();
    if (!info || info.collapsed) return;
    const win = getWin(editor);
    if (!win) return;
    const nativeSel = win.getSelection();
    if (!nativeSel || nativeSel.rangeCount === 0) return;
    const root = editorEl(editor);
    const doc = getDoc(editor);

    // STEP 1 (C1 fix): unwrap inline formatting ANCESTORS that ENCLOSE the
    // selection. cloneContents() below only sees tags *inside* the range, so a
    // selection sitting inside <strong> would otherwise clone a bare text node
    // and re-insert it right back into the surviving <strong> — a silent no-op.
    // Unwrapping each enclosing inline tag across the range (via the same
    // partial-aware unwrapInline used by toggles) lifts the selection out first.
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
    const INLINE_TAGS = INLINE_FMT_TAGS;
    function stripInline(node) {
      Array.from(node.childNodes).forEach((child) => {
        if (child.nodeType === 1) {
          const tag = child.tagName.toLowerCase();
          if (INLINE_TAGS.has(tag)) {
            stripInline(child);
            // Unwrap: lift children out, drop the formatting element entirely.
            while (child.firstChild) node.insertBefore(child.firstChild, child);
            node.removeChild(child);
          } else {
            // Non-inline element (e.g. a block kept as-is) — strip the
            // formatting attributes that carry styling so removeFormat actually
            // clears it: style, class, color, face, size.
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
    // Track the last inserted node so we can place the caret after it.
    const lastNode = fragment.lastChild;
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
