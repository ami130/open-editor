/**
 * color-picker-seed.js — read the color already applied at the caret so the
 * picker opens seeded to it. Extracted from color-picker.js (300-line limit).
 *
 * Returns { hex, alpha } where hex is '#rrggbb' and alpha is 0..1. Understands
 * every CSS color form the DOM can hand back — rgb()/rgba(), hsl()/hsla(),
 * named colors, and hex (C2) — not just numeric rgb(). Alpha is preserved so
 * reopening a translucent color keeps its opacity. Returns null when no color
 * is set on any ancestor up to the editor root.
 */
import { parseCssColor } from './color-picker-parse.js';

export function findColorAtSelection(editor, command) {
  try {
    const info = editor.selection && editor.selection.get();
    if (!info || !info.startNode) return null;
    const edEl = editor.getEditorElement();
    let node = info.startNode;
    while (node && node !== edEl) {
      if (node.nodeType === 1 && node.style) {
        const prop = command === 'textColor' ? node.style.color : node.style.backgroundColor;
        const parsed = prop && parseCssColor(prop);
        if (parsed) return parsed;
      }
      node = node.parentNode;
    }
  } catch { /* non-critical — picker just opens at its default */ }
  return null;
}
