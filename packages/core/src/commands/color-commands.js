/**
 * Text/background color commands (toolbar 7.10) plus their "clear color"
 * counterparts. Split out of style-commands.js to keep both within the
 * 300-line limit. Reuses wrapInSpan + isSafeCSSValue from style-commands.js so
 * the CSS-injection guard and span-wrapping behaviour stay identical.
 */

import { walkUp } from '../selection/range-utils.js';
import { CommandManager } from './command-manager.js';
import { wrapInSpan, isSafeCSSValue } from './style-commands.js';
import { splitStyledSpan } from './span-split.js';

function editorEl(editor) { return editor.getEditorElement(); }
function selMgr(editor)   { return editor.selection; }
function getDoc(editor)   { return editor._iframeDoc || document; }

// True when EVERY character of `tn` lies within `range` — i.e. the text node is
// fully selected, not merely touched. Uses comparePoint (start<=0 && end>=0);
// falls back to a conservative false if comparePoint is unavailable.
function textNodeFullyInRange(range, tn) {
  try {
    if (typeof range.comparePoint === 'function') {
      const len = tn.nodeValue ? tn.nodeValue.length : 0;
      // Fully inside ⇔ node start is at/after range start (>=0) AND node end is
      // at/before range end (<=0). comparePoint: -1 before, 0 within, +1 after.
      return range.comparePoint(tn, 0) >= 0 && range.comparePoint(tn, len) <= 0;
    }
  } catch { /* boundary outside range document — treat as not fully covered */ }
  return false;
}

// Split a partially-selected styled span so that ONLY the selected slice loses
// `propName`, leaving the surrounding text still wrapped in the original span.
function splitAndClear(editor, span, propName, range) {
  splitStyledSpan(getDoc(editor), span, range, (slice) => { slice.style[propName] = ''; });
}

// Clear an inline CSS property from every styled span overlapping the current
// selection (or, when collapsed, the nearest styled ancestor). Used by the
// color picker's "Clear color" so it goes through the command pipeline and is
// captured by history/onChange — unlike a manual DOM walk.
function clearStyleProp(editor, propName) {
  const sel = selMgr(editor);
  if (!sel) return false;
  const info = sel.get();
  if (!info) return false;
  const root = editorEl(editor);

  // Collect candidate elements: ancestors of the start node plus any descendant
  // elements of the selection range that carry the property.
  const cleared = [];
  // 1) ancestor chain from the start node.
  //    For a collapsed selection (cursor), clear the nearest styled ancestor —
  //    this is intentional "clear at cursor" behaviour.
  //    For a non-collapsed selection, only clear an ancestor span if it is
  //    FULLY contained within the range; otherwise clearing it would remove the
  //    property from text that was never selected.
  const partial = []; // ancestor spans only PARTIALLY covered → split, don't clear whole
  let node = info.startNode;
  while (node && node !== root) {
    if (node.nodeType === 1 && node.style && node.style[propName]) {
      if (info.collapsed) {
        cleared.push(node);
      } else if (info.range) {
        // Clear an ancestor span WHOLE only when the selection fully covers all
        // of its text; if it is only PARTIALLY covered, splitting is required so
        // the property is removed from just the selected slice (H2 fix: the old
        // code used intersectsNode, which is true for partial overlap, so it
        // wrongly cleared the entire span — e.g. removing color from "hello" in
        // "hello world" wiped " world" too).
        try {
          const r = info.range;
          const textNodes = [];
          (function gatherText(n) {
            if (n.nodeType === 3) { textNodes.push(n); return; }
            for (const ch of Array.from(n.childNodes)) gatherText(ch);
          })(node);
          if (textNodes.length === 0) {
            cleared.push(node);
          } else {
            const allFull = textNodes.every((tn) => textNodeFullyInRange(r, tn));
            const anyHit = textNodes.some((tn) => (r.intersectsNode ? r.intersectsNode(tn) : true));
            if (allFull) cleared.push(node);
            else if (anyHit) partial.push(node);
          }
        } catch { cleared.push(node); }
      }
    }
    node = node.parentNode;
  }
  // 2) descendants within the selection range (non-collapsed). Classify each
  //    styled descendant: FULLY covered → clear whole (cleared); only PARTIALLY
  //    covered → split so just the selected slice loses the property.
  if (!info.collapsed && info.range) {
    const r = info.range;
    const container = r.commonAncestorContainer;
    const scope = container.nodeType === 1 ? container : container.parentNode;
    if (scope && scope.querySelectorAll) {
      for (const el of Array.from(scope.querySelectorAll('*'))) {
        if (!(el.style && el.style[propName])) continue;
        if (partial.includes(el) || cleared.includes(el)) continue; // already handled as ancestor
        if (!(r.intersectsNode && r.intersectsNode(el))) continue;
        const textNodes = [];
        (function gt(n) {
          if (n.nodeType === 3) { textNodes.push(n); return; }
          for (const ch of Array.from(n.childNodes)) gt(ch);
        })(el);
        const allFull = textNodes.length > 0 && textNodes.every((tn) => textNodeFullyInRange(r, tn));
        if (allFull || textNodes.length === 0) cleared.push(el);
        else partial.push(el);
      }
    }
  }
  // Partially-covered spans (ancestor OR descendant): split so only the selected
  // part loses the property. Done AFTER classification (which reads info.range)
  // because splitting mutates the DOM and invalidates the range.
  if (partial.length && info.range) {
    for (const span of partial) splitAndClear(editor, span, propName, info.range);
  }
  let changed = false;
  for (const el of cleared) {
    if (el.style[propName]) { el.style[propName] = ''; changed = true; }
  }
  // Unwrap any span whose style attribute is now empty — avoids orphan wrappers
  // like <span style="">text</span> left behind after clearing the last property.
  const parents = new Set();
  for (const el of cleared) {
    const styleVal = el.getAttribute ? el.getAttribute('style') : null;
    const isEmpty = styleVal === null || styleVal === '' || !styleVal.trim();
    if (el.tagName && el.tagName.toLowerCase() === 'span' &&
        el.parentNode && isEmpty && !el.id && !el.className) {
      const parent = el.parentNode;
      parents.add(parent);
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      parent.removeChild(el);
    }
  }
  // Merge any adjacent text nodes split by the DOM mutations above.
  for (const p of parents) { if (p && p.normalize) p.normalize(); }
  return changed;
}

export const textColorCommand = {
  execute(editor, color = '') {
    if (!color || !isSafeCSSValue(color)) return;  // C-4: guard CSS injection
    if (wrapInSpan(editor, 'color', color, true)) return CommandManager.SKIP_RESTORE;
  },
  isActive(editor) {
    const sel = selMgr(editor);
    if (!sel) return false;
    const info = sel.get();
    if (!info) return false;
    const span = walkUp(info.startNode, editorEl(editor), (n) =>
      n.nodeType === 1 && n.style && !!n.style.color
    );
    return !!span;
  },
  getValue(editor) {
    const sel = selMgr(editor);
    if (!sel) return '';
    const info = sel.get();
    if (!info) return '';
    const span = walkUp(info.startNode, editorEl(editor), (n) =>
      n.nodeType === 1 && n.style && !!n.style.color
    );
    return span ? span.style.color : '';
  },
};

// Clears text color across the selection (toolbar "Clear color").
export const removeTextColorCommand = {
  execute(editor) { clearStyleProp(editor, 'color'); return CommandManager.SKIP_RESTORE; },
};

export const backgroundColorCommand = {
  execute(editor, color = '') {
    if (!color || !isSafeCSSValue(color)) return;  // C-4: guard CSS injection
    if (wrapInSpan(editor, 'backgroundColor', color, true)) return CommandManager.SKIP_RESTORE;
  },
  isActive(editor) {
    const sel = selMgr(editor);
    if (!sel) return false;
    const info = sel.get();
    if (!info) return false;
    const span = walkUp(info.startNode, editorEl(editor), (n) =>
      n.nodeType === 1 && n.style && !!n.style.backgroundColor
    );
    return !!span;
  },
  getValue(editor) {
    const sel = selMgr(editor);
    if (!sel) return '';
    const info = sel.get();
    if (!info) return '';
    const span = walkUp(info.startNode, editorEl(editor), (n) =>
      n.nodeType === 1 && n.style && !!n.style.backgroundColor
    );
    return span ? span.style.backgroundColor : '';
  },
};

// Clears background color across the selection (toolbar "Clear color").
export const removeBackgroundColorCommand = {
  execute(editor) { clearStyleProp(editor, 'backgroundColor'); return CommandManager.SKIP_RESTORE; },
};
