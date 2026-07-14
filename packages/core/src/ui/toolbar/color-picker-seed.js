/**
 * color-picker-seed.js — read the color already applied at the caret so the
 * picker opens seeded to it. Extracted from color-picker.js (300-line limit).
 *
 * Returns { hex, alpha } where hex is '#rrggbb' and alpha is 0..1 (parsed from
 * an rgba() value if present — fixing the audit LOW where alpha was write-only
 * and reopening a translucent color reset it to 100%). Returns null when no
 * color is set on any ancestor up to the editor root.
 */
import { rgbToHex } from './color-picker-convert.js';

export function findColorAtSelection(editor, command) {
  try {
    const info = editor.selection && editor.selection.get();
    if (!info || !info.startNode) return null;
    const edEl = editor.getEditorElement();
    let node = info.startNode;
    while (node && node !== edEl) {
      if (node.nodeType === 1 && node.style) {
        const prop = command === 'textColor' ? node.style.color : node.style.backgroundColor;
        if (prop) {
          const nums = prop.match(/[\d.]+/g);
          if (nums && nums.length >= 3) {
            const hex = rgbToHex({ r: +nums[0], g: +nums[1], b: +nums[2] });
            // 4th number (if any) is the alpha channel of an rgba() value.
            const alpha = nums.length >= 4 ? Math.max(0, Math.min(1, +nums[3])) : 1;
            return { hex, alpha };
          }
        }
      }
      node = node.parentNode;
    }
  } catch { /* non-critical — picker just opens at its default */ }
  return null;
}
