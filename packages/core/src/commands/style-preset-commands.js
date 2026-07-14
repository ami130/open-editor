/**
 * style-preset-commands.js — 17.5.8: config-driven named style presets.
 *
 * config.styles: [{ label, element?, classes: [] }]
 *  - element = block tag (p/h1..h6/blockquote/pre): converts the current block
 *    (via the existing per-tag command) and applies the classes to it.
 *  - element absent or 'span': wraps the selection in a classed <span>.
 * Re-applying the same preset toggles its classes off; applying a different
 * block preset replaces sibling-preset classes (one named style at a time).
 * v1 limitation (documented): inline presets apply within a single block.
 */
import { getParentBlock, walkUp } from '../selection/range-utils.js';

const BLOCK_ELEMENTS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre']);
const BLOCK_COMMAND = { p: 'paragraph', h1: 'h1', h2: 'h2', h3: 'h3', h4: 'h4', h5: 'h5', h6: 'h6', blockquote: 'blockquote', pre: 'pre' };

function presets(editor) {
  const s = editor._config.styles;
  return Array.isArray(s) ? s : [];
}

function hasAllClasses(el, classes) {
  return classes.length > 0 && classes.every((c) => el.classList.contains(c));
}

/** All classes used by any BLOCK preset (for one-at-a-time replacement). */
function allPresetClasses(editor) {
  const out = new Set();
  for (const p of presets(editor)) {
    if (p.element && BLOCK_ELEMENTS.has(p.element)) (p.classes || []).forEach((c) => out.add(c));
  }
  return out;
}

function applyBlockPreset(editor, preset) {
  const info = editor.selection && editor.selection.get();
  if (!info) return false;
  const root = editor.getEditorElement();
  let block = getParentBlock(info.startNode, root);
  if (!block) return false;

  const classes = preset.classes || [];
  const wasActive = block.tagName.toLowerCase() === preset.element && hasAllClasses(block, classes);

  if (block.tagName.toLowerCase() !== preset.element) {
    editor.commands.execute(BLOCK_COMMAND[preset.element]);
    const after = editor.selection && editor.selection.get();
    block = after ? getParentBlock(after.startNode, root) : null;
    if (!block) return false;
  }

  // One named style at a time: clear every sibling-preset class first.
  for (const c of allPresetClasses(editor)) block.classList.remove(c);
  if (!wasActive) classes.forEach((c) => block.classList.add(c));
  if (block.getAttribute('class') === '') block.removeAttribute('class');
  return true;
}

function applyInlinePreset(editor, preset) {
  const info = editor.selection && editor.selection.get();
  if (!info) return false;
  const root = editor.getEditorElement();
  const classes = preset.classes || [];
  if (!classes.length) return false;

  // Toggle OFF: caret/selection inside a span carrying exactly this preset.
  const host = walkUp(info.startNode, root, (n) =>
    n.nodeType === 1 && n.tagName.toLowerCase() === 'span' && hasAllClasses(n, classes));
  if (host) {
    const parent = host.parentNode;
    while (host.firstChild) parent.insertBefore(host.firstChild, host);
    parent.removeChild(host);
    return true;
  }

  if (info.collapsed) return false;
  // v1: single-block inline application only.
  const sb = getParentBlock(info.startNode, root);
  const eb = getParentBlock(info.endNode, root);
  if (!sb || sb !== eb) return false;

  const doc = root.ownerDocument;
  const span = doc.createElement('span');
  span.className = classes.join(' ');
  span.appendChild(info.range.extractContents());
  info.range.insertNode(span);
  editor.selection.set(span, 0, span, span.childNodes.length);
  return true;
}

export function registerStylePresetCommands(editor) {
  editor.commands.register('applyStyle', {
    execute(ed, index) {
      const preset = presets(ed)[index];
      if (!preset) return false;
      const el = preset.element && String(preset.element).toLowerCase();
      if (el && BLOCK_ELEMENTS.has(el)) return applyBlockPreset(ed, { ...preset, element: el });
      if (!el || el === 'span') return applyInlinePreset(ed, preset);
      return false;
    },
  });
}
