/**
 * Block-level commands: headings, paragraph, blockquote, pre/code block.
 * Uses direct DOM range ops, not execCommand('formatBlock') (fails inside <li>
 * on Firefox). Block styles (alignment/line-height) are inline styles the
 * sanitizer whitelists, so they round-trip. Quote is a TOGGLE: re-clicking it
 * inside a quote unwraps ONE level (via paragraphCommand); it does not re-nest.
 */

import { walkUp, getParentBlock, isInsideTag } from '../selection/range-utils.js';
import { CommandManager } from './command-manager.js';
import { getSelectedBlocks } from './style-read.js';

function placeCursorAt(node, editor) {
  const win = editor.selection && editor.selection.getWindow();
  if (!win) return;
  const doc = editor._iframeDoc || document;
  const range = doc.createRange();
  range.setStart(node, 0);
  range.collapse(true);
  const sel = win.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Attributes carried across a block-tag conversion (heading↔paragraph↔pre).
// I10: dir/lang/align were previously dropped — dir loss silently changes a
// block's default alignment, and align/lang are legitimate authored attributes.
const BLOCK_KEEP_ATTRS = ['class', 'style', 'id', 'dir', 'lang', 'align'];

function editorEl(editor) { return editor.getEditorElement(); }
function getDoc(editor)   { return editor._iframeDoc || document; }

function getSelInfo(editor) {
  return editor.selection ? editor.selection.get() : null;
}

/**
 * Apply formatBlock via direct DOM replacement — replaces the nearest block
 * ancestor with a new element of `tag`, preserving children + attributes (more
 * reliable than the deprecated, focus-dependent execCommand('formatBlock')).
 * Target tags: p, h1-h6, pre. For blockquote, use blockquoteCommand.
 */
export function applyFormatBlock(editor, tag) {
  const doc = getDoc(editor);
  const info = getSelInfo(editor);
  if (!info) return;

  const root = editorEl(editor);
  const win  = editor.selection && editor.selection.getWindow();

  // Guard: inside a list item, converting the block to a heading/paragraph is
  // not meaningful and the old fallback appended a stray empty block at root
  // (H-5). Bail cleanly so the list is left intact rather than corrupted. Use
  // the list command to leave a list before applying a block format.
  const inListItem = walkUp(info.startNode, root, (n) =>
    n.nodeType === 1 && n.tagName.toLowerCase() === 'li'
  );
  if (inListItem) return;

  // MULTI-BLOCK: convert EVERY selected paragraph (was: only the caret's block),
  // preserving each block's children + class/style/id.
  const selected = getSelectedBlocks(editor).filter(
    (b) => ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'div'].includes(b.tagName.toLowerCase())
  );
  if (selected.length > 1) {
    for (const b of selected) {
      if (b.tagName.toLowerCase() === tag) continue;
      const el = doc.createElement(tag);
      // I10: also carry dir/lang/align — dropping dir silently flips a block's
      // default alignment; align/lang are legitimate authored attributes.
      for (const a of BLOCK_KEEP_ATTRS) if (b.getAttribute(a)) el.setAttribute(a, b.getAttribute(a));
      while (b.firstChild) el.appendChild(b.firstChild);
      b.parentNode.replaceChild(el, b);
    }
    return;
  }

  // Find the block to replace — skip blockquote so we act on the inner block.
  const block = walkUp(info.startNode, root, (n) => {
    if (n.nodeType !== 1) return false;
    const t = n.tagName.toLowerCase();
    return t !== 'blockquote' &&
      ['p','h1','h2','h3','h4','h5','h6','pre','div'].includes(t);
  });

  if (!block || block === root) {
    // I9: a bare-text blockquote (no inner <p>) has no inner block to convert —
    // the old fallback appended a stray empty heading at root. Instead wrap the
    // quote's direct inline content into the target block IN PLACE.
    const bq = walkUp(info.startNode, root, (n) =>
      n.nodeType === 1 && n.tagName.toLowerCase() === 'blockquote');
    if (bq && bq.firstChild && !bq.querySelector('p,h1,h2,h3,h4,h5,h6,pre,div,ul,ol,blockquote')) {
      const inner = doc.createElement(tag);
      while (bq.firstChild) inner.appendChild(bq.firstChild);
      bq.appendChild(inner);
      placeCursorAt(inner.firstChild || inner, editor);
      return;
    }
    // No suitable block found — fall back to creating a new block at root level
    const newEl = doc.createElement(tag);
    newEl.innerHTML = '<br>';
    root.appendChild(newEl);
    placeCursorAt(newEl, editor);
    return;
  }

  // Already the right tag — nothing to do
  if (block.tagName.toLowerCase() === tag) return;

  // Create replacement element, copy children and style
  const newEl = doc.createElement(tag);

  // Copy formatting attributes (I10: incl. dir/lang/align — dropping dir flips
  // default alignment; align/lang are legitimate authored attributes).
  for (const a of BLOCK_KEEP_ATTRS) {
    if (block.getAttribute(a)) newEl.setAttribute(a, block.getAttribute(a));
  }

  // Move all children
  while (block.firstChild) newEl.appendChild(block.firstChild);

  // Replace in DOM
  block.parentNode.replaceChild(newEl, block);

  // Restore cursor: try to put it back at the same text offset
  if (win) {
    const nativeSel = win.getSelection();
    if (nativeSel) {
      // Find a suitable text node or use the element itself
      const target = newEl.firstChild || newEl;
      try {
        const range = doc.createRange();
        if (target.nodeType === 3) {
          range.setStart(target, Math.min(info.startOffset, target.nodeValue.length));
        } else {
          range.setStart(target, 0);
        }
        range.collapse(true);
        nativeSel.removeAllRanges();
        nativeSel.addRange(range);
      } catch { /* ignore positioning errors */ }
    }
  }
}

/**
 * Find the nearest block ancestor of the current selection start, skipping
 * <blockquote> ancestors — used by isActive() for paragraph and heading commands
 * so they correctly identify the inner block
 * (p, h1, h2, …) even when the cursor is nested inside a blockquote.
 */
export function currentInnerBlock(editor) {
  const info = getSelInfo(editor);
  if (!info) return null;
  const root = editorEl(editor);
  return walkUp(info.startNode, root, (n) => {
    if (n.nodeType !== 1) return false;
    const tag = n.tagName.toLowerCase();
    return tag !== 'blockquote' &&
      ['p','h1','h2','h3','h4','h5','h6','pre','li','td','th','div'].includes(tag);
  });
}

// ─── Paragraph (4.5) — inside a blockquote it peels ONE quote level (the ──────
// inverse of the quote toggle); otherwise formats the current block as <p>.

export const paragraphCommand = {
  execute(editor) {
    const info = getSelInfo(editor);
    const root = editorEl(editor);
    const innermostBQ = info && walkUp(info.startNode, root, (n) =>
      n.nodeType === 1 && n.tagName.toLowerCase() === 'blockquote'
    );
    if (innermostBQ && innermostBQ.parentNode) {
      // Unwrap one level: lift the blockquote's children into its parent.
      // M-9: if the parent is a list item (<li>), <p> children are invalid HTML.
      // In that case, unwrap each <p> child to its text/inline content first so
      // we don't produce <li><p>...</p></li>.
      const parent = innermostBQ.parentNode;
      const parentTag = parent.tagName ? parent.tagName.toLowerCase() : '';
      if (parentTag === 'li') {
        const doc = editor._iframeDoc || (typeof document !== 'undefined' ? document : null);
        // Flatten <p>/<div> children inside the blockquote before hoisting.
        const blockKids = Array.from(innermostBQ.childNodes);
        for (const kid of blockKids) {
          if (kid.nodeType === 1 && ['p','div','h1','h2','h3','h4','h5','h6'].includes(kid.tagName.toLowerCase())) {
            const next = kid.nextSibling;
            while (kid.firstChild) innermostBQ.insertBefore(kid.firstChild, kid);
            innermostBQ.removeChild(kid);
            if (doc && next) innermostBQ.insertBefore(doc.createElement('br'), next);
          }
        }
      }
      const first = innermostBQ.firstChild;
      while (innermostBQ.firstChild) parent.insertBefore(innermostBQ.firstChild, innermostBQ);
      parent.removeChild(innermostBQ);
      if (first) placeCursorAt(first, editor);
      return CommandManager.SKIP_RESTORE;
    }
    applyFormatBlock(editor, 'p');
    // applyFormatBlock repositions the cursor itself — signal CommandManager not
    // to clobber it by restoring the (now-stale) pre-command path bookmark.
    return CommandManager.SKIP_RESTORE;
  },
  isActive(editor) {
    const block = currentInnerBlock(editor);
    return !!block && block.tagName.toLowerCase() === 'p';
  },
};

// Heading h1–h6 commands live in heading-commands.js (kept under the 300-line
// limit). Re-exported so setup-commands.js's import path stays valid.
export { h1Command, h2Command, h3Command, h4Command, h5Command, h6Command }
  from './heading-commands.js';

// ─── Blockquote (4.5, 4.22) — a TOGGLE: inside a quote it unwraps one level ───
export const blockquoteCommand = {
  execute(editor) {
    const info = getSelInfo(editor);
    if (!info) return;
    const root = editorEl(editor);

    const existingBQ = walkUp(info.startNode, root, (n) =>
      n.nodeType === 1 && n.tagName.toLowerCase() === 'blockquote'
    );

    if (existingBQ) {
      // Toggle off: unwrap one blockquote level (same as paragraphCommand)
      return paragraphCommand.execute(editor);
    }
    const doc = getDoc(editor);

    // MULTI-BLOCK: wrap ALL selected paragraphs into ONE blockquote (Docs/Notion)
    // — was: only the first. Only when they're siblings and none is an li/quote.
    const selected = getSelectedBlocks(editor);
    if (selected.length > 1
      && selected.every((b) => b.parentNode === selected[0].parentNode
        && b.tagName.toLowerCase() !== 'li' && b.tagName.toLowerCase() !== 'blockquote')) {
      const bq = doc.createElement('blockquote');
      selected[0].parentNode.insertBefore(bq, selected[0]);
      for (const b of selected) bq.appendChild(b); // move each block into the quote
      placeCursorAt(selected[0].firstChild || selected[0], editor);
      return CommandManager.SKIP_RESTORE;
    }

    // Manual DOM wrap — execCommand('formatBlock','blockquote') silently fails
    // on headings, list items, and pre blocks in many browsers. Find the current
    // block and wrap it directly so blockquote works reliably everywhere.
    const block = getParentBlock(info.startNode, root);
    if (block && block !== root) {
      const blockTag = block.tagName.toLowerCase();
      if (blockTag === 'li') {
        // M-2: wrapping the <li> itself yields invalid <ul><blockquote><li>.
        // Instead wrap the list item's CONTENTS in a blockquote inside the li,
        // producing valid <li><blockquote>…</blockquote></li>.
        const bq = doc.createElement('blockquote');
        while (block.firstChild) bq.appendChild(block.firstChild);
        block.appendChild(bq);
        placeCursorAt(bq.firstChild || bq, editor);
      } else {
        const bq = doc.createElement('blockquote');
        block.parentNode.insertBefore(bq, block);
        bq.appendChild(block);
        placeCursorAt(block.firstChild || block, editor);
      }
    } else {
      // Fallback for bare text nodes / edge cases
      applyFormatBlock(editor, 'blockquote');
    }
    return CommandManager.SKIP_RESTORE;
  },
  isActive(editor) {
    const info = getSelInfo(editor);
    if (!info) return false;
    return isInsideTag(info.startNode, 'blockquote', editorEl(editor));
  },
};

// handleBlockquoteEnter lives in blockquote-enter.js (kept under the 300-line
// limit). Re-exported here so existing import paths keep working.
export { handleBlockquoteEnter } from './blockquote-enter.js';

// ─── Pre / code block (4.5) ──────────────────────────────────────────────────

export const preCommand = {
  execute(editor) {
    applyFormatBlock(editor, 'pre');
    return CommandManager.SKIP_RESTORE;
  },
  isActive(editor) {
    const block = currentInnerBlock(editor);
    return !!block && block.tagName.toLowerCase() === 'pre';
  },
};
