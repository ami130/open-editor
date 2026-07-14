/**
 * style-read.js — read the effective CSS value at the current selection, for
 * toolbar dropdowns that highlight the active option (font family/size, line
 * height). Extracted from style-commands.js to keep it within the 300-line
 * limit. Read-only: these never mutate the DOM.
 */
import { walkUp, getParentBlock } from '../selection/range-utils.js';

function editorEl(editor) { return editor.getEditorElement(); }
function selMgr(editor)   { return editor.selection; }

// ul/ol are structural containers — skip them when walking up to a text block.
const STYLE_SKIP_TAGS = new Set(['ul', 'ol']);

export function getBlockInfo(editor) {
  const sel = selMgr(editor);
  if (!sel) return null;
  const info = sel.get();
  if (!info) return null;
  const root = editorEl(editor);
  let node = info.startNode;
  while (node && node !== root) {
    if (node.nodeType === 1) {
      const tag = node.tagName.toLowerCase();
      if (!STYLE_SKIP_TAGS.has(tag)) {
        const block = getParentBlock(node, root);
        if (block && !STYLE_SKIP_TAGS.has(block.tagName.toLowerCase())) return block;
      }
    }
    node = node.parentNode;
  }
  return getParentBlock(info.startNode, root);
}

export function getComputedAtCursor(editor, prop) {
  const sel = selMgr(editor);
  if (!sel) return '';
  const info = sel.get();
  if (!info) return '';
  const root = editorEl(editor);
  // Walk up from the cursor node looking for an inline style on a span first.
  const span = walkUp(info.startNode, root,
    (n) => n.nodeType === 1 && n.tagName.toLowerCase() === 'span' && n.style[prop]
  );
  if (span) return span.style[prop] || '';
  // Fall back to getComputedStyle on the cursor's element node.
  const node = info.startNode.nodeType === 1 ? info.startNode : info.startNode.parentElement;
  if (!node) return '';
  try {
    const cs = (typeof window !== 'undefined' ? window : null);
    if (cs && cs.getComputedStyle) return cs.getComputedStyle(node)[prop] || '';
  } catch { /* headless */ }
  return '';
}

export function getBlockLinHeight(editor) {
  const block = getBlockInfo(editor);
  if (!block) return '';
  if (block.style.lineHeight) return block.style.lineHeight;
  try {
    const cs = (typeof window !== 'undefined' ? window : null);
    if (cs && cs.getComputedStyle) {
      const computed = cs.getComputedStyle(block);
      const lh = computed.lineHeight || '';
      // LOW fix: computed line-height resolves to px ("24px") even for a unitless
      // multiplier, so the unitless dropdown options never matched. Convert to a
      // ratio against font-size, rounded to 2dp, so it lines up with an option.
      const m = /^([\d.]+)px$/.exec(lh);
      const fs = parseFloat(computed.fontSize);
      if (m && fs > 0) return String(Math.round((parseFloat(m[1]) / fs) * 100) / 100);
      return lh;
    }
  } catch { /* headless */ }
  return '';
}
