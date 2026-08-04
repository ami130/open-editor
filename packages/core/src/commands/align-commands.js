/**
 * Alignment and writing-mode commands. Split out of block-commands.js to keep
 * both files within the 300-line limit.
 *
 * Both store their effect as an inline style on the nearest text block (skipping
 * ul/ol list containers, mirroring style-commands.js) — the sanitizer whitelists
 * style on block elements so they survive setHTML round-trips.
 */

import { getParentBlock } from '../selection/range-utils.js';
import { getSelectedBlocks } from './style-read.js';

function editorEl(editor)   { return editor.getEditorElement(); }
function getSelInfo(editor) { return editor.selection ? editor.selection.get() : null; }

// Resolve the nearest text-content block, skipping ul/ol containers so alignment
// lands on the <li>/<p> rather than the whole list.
const ALIGN_SKIP_TAGS = new Set(['ul', 'ol']);
function currentTextBlock(editor) {
  const info = getSelInfo(editor);
  if (!info) return null;
  const root = editorEl(editor);
  let node = info.startNode;
  while (node && node !== root) {
    if (node.nodeType === 1 && !ALIGN_SKIP_TAGS.has(node.tagName.toLowerCase())) {
      const block = getParentBlock(node, root);
      if (block && !ALIGN_SKIP_TAGS.has(block.tagName.toLowerCase())) return block;
    }
    node = node.parentNode;
  }
  return getParentBlock(info.startNode, root);
}

// A1: every block the selection touches, so alignment covers a multi-paragraph
// selection (was: only the block at the cursor). getSelectedBlocks returns the
// innermost intersecting blocks (incl. <li>) and falls back to the single caret
// block, so a collapsed cursor still aligns exactly one block. ul/ol containers
// are filtered so alignment lands on the <li>/<p>, not the whole list.
function alignTargetBlocks(editor) {
  const blocks = getSelectedBlocks(editor).filter(
    (b) => b && b.nodeType === 1 && !ALIGN_SKIP_TAGS.has(b.tagName.toLowerCase())
  );
  if (blocks.length) return blocks;
  const single = currentTextBlock(editor);
  return single ? [single] : [];
}

// A2: the resolved writing direction for a block — a block/ancestor `dir` attr
// wins, else the editor's configured direction. In RTL the default alignment is
// RIGHT, so an unset text-align must NOT read as "left-active".
function blockDir(block, editor) {
  let n = block;
  while (n && n.nodeType === 1) {
    const d = n.getAttribute && n.getAttribute('dir');
    if (d === 'rtl' || d === 'ltr') return d;
    n = n.parentNode;
  }
  return (editor.getDirection && editor.getDirection()) || 'ltr';
}

// ─── Alignment (4.6) ─────────────────────────────────────────────────────────

function makeAlignCommand(value) {
  return {
    execute(editor) {
      const blocks = alignTargetBlocks(editor);
      if (!blocks.length) return;
      // Toggle semantics across the whole selection: if EVERY target block is
      // already at this value, clear them all (reversible); otherwise set them
      // all to this value — so a mixed selection becomes uniformly aligned.
      const allSet = blocks.every((b) => b.style.textAlign === value);
      for (const b of blocks) b.style.textAlign = allSet ? '' : value;
    },
    isActive(editor) {
      const block = currentTextBlock(editor);
      if (!block) return false;
      const ta = block.style.textAlign;
      if (value === 'left') {
        // A block with no explicit alignment defaults to LEFT only in LTR; in
        // RTL its visual default is right, so don't report Left as active (A2).
        return ta === 'left' || (ta === '' && blockDir(block, editor) !== 'rtl');
      }
      if (value === 'right') {
        // Symmetric: an unset RTL block is visually right-aligned.
        return ta === 'right' || (ta === '' && blockDir(block, editor) === 'rtl');
      }
      return ta === value;
    },
  };
}

export const alignLeftCommand    = makeAlignCommand('left');
export const alignCenterCommand  = makeAlignCommand('center');
export const alignRightCommand   = makeAlignCommand('right');
export const alignJustifyCommand = makeAlignCommand('justify');

// ─── writing-mode (4.24) ─────────────────────────────────────────────────────

export const writingModeCommand = {
  execute(editor, value = 'vertical-rl') {
    const allowed = ['vertical-rl', 'vertical-lr', 'horizontal-tb'];
    if (!allowed.includes(value)) return;
    const block = currentTextBlock(editor);
    if (!block) return;
    // horizontal-tb is the default — clear the inline style instead of leaving
    // a redundant property that lingers through setHTML round-trips.
    if (value === 'horizontal-tb') block.style.writingMode = '';
    else block.style.writingMode = value;
  },
  isActive(editor) {
    const block = currentTextBlock(editor);
    return !!block && !!block.style.writingMode &&
           block.style.writingMode !== 'horizontal-tb';
  },
};
