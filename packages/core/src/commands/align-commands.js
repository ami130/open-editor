/**
 * Alignment and writing-mode commands. Split out of block-commands.js to keep
 * both files within the 300-line limit.
 *
 * Both store their effect as an inline style on the nearest text block (skipping
 * ul/ol list containers, mirroring style-commands.js) — the sanitizer whitelists
 * style on block elements so they survive setHTML round-trips.
 */

import { getParentBlock } from '../selection/range-utils.js';

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

// ─── Alignment (4.6) ─────────────────────────────────────────────────────────

function makeAlignCommand(value) {
  return {
    execute(editor) {
      const block = currentTextBlock(editor);
      if (!block) return;
      // Toggle off when already set to this value (clears the inline style)
      // rather than re-writing it, so alignment is reversible.
      block.style.textAlign = block.style.textAlign === value ? '' : value;
    },
    isActive(editor) {
      const block = currentTextBlock(editor);
      if (!block) return false;
      const ta = block.style.textAlign;
      // A block with no explicit alignment is left-aligned by default.
      if (value === 'left') return ta === 'left' || ta === '';
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
