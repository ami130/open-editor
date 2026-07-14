/**
 * Block-level commands: headings, paragraph, blockquote (with nesting),
 * pre/code block, alignment, writing-mode.
 *
 * Rules:
 *  - execCommand('formatBlock') fails inside <li> on Firefox.
 *    Always detect list context and exit first.
 *  - Alignment stores as inline style (text-align). The sanitizer whitelists
 *    style attributes on block elements so they survive setHTML round-trips.
 *  - Nested blockquote: re-applying 'blockquote' command when already inside
 *    one increases depth. Applying 'paragraph' unwraps one level.
 */

import { walkUp, getParentBlock, isInsideTag } from '../selection/range-utils.js';
import { CommandManager } from './command-manager.js';

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

function editorEl(editor) { return editor.getEditorElement(); }
function getDoc(editor)   { return editor._iframeDoc || document; }

function getSelInfo(editor) {
  return editor.selection ? editor.selection.get() : null;
}

/**
 * Apply formatBlock via direct DOM replacement.
 * Replaces the nearest block ancestor with a new element of the given tag,
 * preserving all children and inline styles. This is more reliable than
 * doc.execCommand('formatBlock') which requires browser focus and is
 * deprecated in modern browsers.
 *
 * Allowed target tags: p, h1-h6, pre. For blockquote, use blockquoteCommand.
 */
function applyFormatBlock(editor, tag) {
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

  // Find the block to replace — skip blockquote so we act on the inner block.
  const block = walkUp(info.startNode, root, (n) => {
    if (n.nodeType !== 1) return false;
    const t = n.tagName.toLowerCase();
    return t !== 'blockquote' &&
      ['p','h1','h2','h3','h4','h5','h6','pre','div'].includes(t);
  });

  if (!block || block === root) {
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

  // Copy class and style attributes if present
  if (block.getAttribute('class')) newEl.setAttribute('class', block.getAttribute('class'));
  if (block.getAttribute('style')) newEl.setAttribute('style', block.getAttribute('style'));
  if (block.getAttribute('id'))    newEl.setAttribute('id',    block.getAttribute('id'));

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
function currentInnerBlock(editor) {
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

// ─── Paragraph (4.5) ─────────────────────────────────────────────────────────
//
// When inside a blockquote, 'paragraph' peels ONE blockquote level (the
// symmetric inverse of blockquoteCommand's nesting). Otherwise it formats the
// current block as <p>. Without this, nesting was one-way: formatBlock('p')
// alone does not unwrap a blockquote ancestor.

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

// ─── Headings h1–h6 (4.5) ────────────────────────────────────────────────────

function makeHeadingCommand(level) {
  const tag = `h${level}`;
  return {
    execute(editor) {
      applyFormatBlock(editor, tag);
      return CommandManager.SKIP_RESTORE;
    },
    isActive(editor) {
      const block = currentInnerBlock(editor);
      return !!block && block.tagName.toLowerCase() === tag;
    },
  };
}

export const h1Command = makeHeadingCommand(1);
export const h2Command = makeHeadingCommand(2);
export const h3Command = makeHeadingCommand(3);
export const h4Command = makeHeadingCommand(4);
export const h5Command = makeHeadingCommand(5);
export const h6Command = makeHeadingCommand(6);

// ─── Blockquote with nesting (4.5, 4.22) ─────────────────────────────────────
//
// Re-applying blockquote when already inside one → wraps in another <blockquote>.
// Applying 'paragraph' or outdent → removes one level.

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
    // Manual DOM wrap — execCommand('formatBlock','blockquote') silently fails
    // on headings, list items, and pre blocks in many browsers. Find the current
    // block and wrap it directly so blockquote works reliably everywhere.
    const doc = getDoc(editor);
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
