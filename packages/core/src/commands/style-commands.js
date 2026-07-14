import { walkUp } from '../selection/range-utils.js';
import { getBlockInfo, getComputedAtCursor, getBlockLinHeight } from './style-read.js';
import { CommandManager } from './command-manager.js';
import { applyPropAcrossRange, isFormattingSpan } from './span-merge-utils.js';
import { recolorPartialSpan } from './span-split.js';

function editorEl(editor) { return editor.getEditorElement(); }
function selMgr(editor)   { return editor.selection; }
function getDoc(editor)   { return editor._iframeDoc || document; }

// Tighten a range whose boundaries land on a block/editor-root (e.g. Ctrl+A:
// startContainer=div) down to text nodes — stops wrapInSpan wrapping whole <p>s.
const _BLOCK = new Set(['P','H1','H2','H3','H4','H5','H6','LI','BLOCKQUOTE',
  'PRE','DIV','SECTION','ARTICLE','HEADER','FOOTER','ASIDE','MAIN','NAV']);
function _deepText(node, side) {
  if (!node) return null;
  if (node.nodeType === 3) return node;
  const ch = side === 'start' ? node.firstChild : node.lastChild;
  return _deepText(ch, side);
}
function tightenRangeToText(range, root, sel) {
  const sc = range.startContainer, ec = range.endContainer;
  if (sc.nodeType === 1 && (sc === root || _BLOCK.has(sc.tagName))) {
    const tn = _deepText(sc.childNodes[range.startOffset] || sc, 'start');
    if (tn) range.setStart(tn, 0);
  }
  if (ec.nodeType === 1 && (ec === root || _BLOCK.has(ec.tagName))) {
    const idx = range.endOffset > 0 ? range.endOffset - 1 : 0;
    const tn = _deepText(ec.childNodes[idx] || ec, 'end');
    if (tn) range.setEnd(tn, tn.nodeValue ? tn.nodeValue.length : 0);
  }
  const win = typeof sel.getWindow === 'function' ? sel.getWindow() : null;
  if (win) { const s = win.getSelection(); if (s) { s.removeAllRanges(); s.addRange(range); } }
}

// CSS injection guard: allow only safe value characters, then block known
// dangerous functions even if they passed the character-set check.
const SAFE_CSS_VALUE_RE = /^[a-zA-Z0-9\s\-_.,/'"%()#]+$/;
const UNSAFE_CSS_FN_RE = /expression\s*\(|url\s*\(|javascript\s*:/i;
export function isSafeCSSValue(val) {
  return typeof val === 'string' &&
    SAFE_CSS_VALUE_RE.test(val) &&
    !UNSAFE_CSS_FN_RE.test(val);
}

export function wrapInSpan(editor, styleProp, styleValue, expandWord = false) {
  const sel = selMgr(editor);
  if (!sel) return false;
  const info = sel.get();
  if (!info) return false;
  const root = editorEl(editor);

  // Collapsed + expandWord: select the word under the cursor before proceeding.
  if (info.collapsed) {
    if (!expandWord) return false;
    const win = (typeof sel.getWindow === 'function') ? sel.getWindow() : null;
    if (!win) return false;
    const doc = getDoc(editor);
    const nativeSel = win.getSelection();
    if (!nativeSel || nativeSel.rangeCount === 0) return false;
    const r = nativeSel.getRangeAt(0).cloneRange();
    // Expand to word boundaries via the browser's word selection (modify() is
    // non-standard but supported in all major browsers).
    if (nativeSel.modify) {
      nativeSel.modify('move', 'backward', 'word');
      nativeSel.modify('extend', 'forward', 'word');
    } else {
      // Fallback: scan text node for word boundaries manually.
      const container = r.startContainer;
      if (container.nodeType === 3) {
        const text = container.nodeValue || '';
        let start = r.startOffset;
        let end = r.startOffset;
        while (start > 0 && !/\s/.test(text[start - 1])) start--;
        while (end < text.length && !/\s/.test(text[end])) end++;
        if (start === end) return false;
        const wr = doc.createRange();
        wr.setStart(container, start);
        wr.setEnd(container, end);
        nativeSel.removeAllRanges();
        nativeSel.addRange(wr);
      } else {
        return false;
      }
    }
    // Re-read info after expanding selection
    const newInfo = sel.get();
    if (!newInfo || newInfo.collapsed) return false;
  }

  // Re-read info (may have been expanded above)
  const currentInfo = sel.get();
  if (!currentInfo || currentInfo.collapsed) return false;

  // Shapes 1 & 2: update same-property span in place (no new nesting).
  const isStyledSpan = (n) =>
    n && n.nodeType === 1 && n.tagName.toLowerCase() === 'span' && n.style[styleProp];

  // Shape 1: ancestor of the selection start. Guard: only use it when the
  // selection covers the span's full text; a partial selection falls through.
  let existingSpan = walkUp(currentInfo.startNode, root, isStyledSpan);
  if (existingSpan && currentInfo.range &&
      currentInfo.range.toString() !== existingSpan.textContent) existingSpan = null;

  // Shape 2: range wraps exactly one same-property span — update in place.
  if (!existingSpan && currentInfo.range) {
    const range = currentInfo.range;
    const selectedText = range.toString();
    const scopeNode = range.commonAncestorContainer;
    const scope = scopeNode.nodeType === 1 ? scopeNode : scopeNode.parentNode;
    if (scope && scope.querySelectorAll) {
      const candidates = [scope, ...Array.from(scope.querySelectorAll('span'))]
        .filter((el) => isStyledSpan(el) &&
          (!range.intersectsNode || range.intersectsNode(el)));
      const sameText = candidates.find((el) => el.textContent === selectedText);
      if (sameText) existingSpan = sameText;
    }
  }

  if (existingSpan) {
    existingSpan.style[styleProp] = styleValue;
    return true;
  }

  // Shape 3: merge a DIFFERENT property onto an existing formatting span. Case A:
  // both endpoints inside + selection covers all its text. Case B: span is the
  // sole real child of the block (bookmark-restore). Descend blocks/root first.
  let shape3Start = currentInfo.startNode;
  if (currentInfo.range && shape3Start.nodeType === 1 &&
      (shape3Start === root || _BLOCK.has(shape3Start.tagName))) {
    const ch = shape3Start.childNodes[currentInfo.range.startOffset];
    if (ch) shape3Start = ch;
  }
  const mergeTarget = walkUp(shape3Start, root, isFormattingSpan);
  if (mergeTarget && currentInfo.range) {
    const range = currentInfo.range;
    const fullyInside = mergeTarget.contains(range.startContainer) &&
                        mergeTarget.contains(range.endContainer) &&
                        range.toString() === mergeTarget.textContent;
    const ancestor = range.commonAncestorContainer;
    const onlySibling = mergeTarget.parentNode === ancestor && (() => {
      const real = Array.from(ancestor.childNodes).filter((n) => {
        if (n.nodeType === 3 && !n.nodeValue.trim()) return false;
        try { return range.intersectsNode ? range.intersectsNode(n) : true; }
        catch { return true; }
      });
      return real.length === 1 && real[0] === mergeTarget;
    })();
    if (fullyInside || onlySibling) {
      mergeTarget.style[styleProp] = styleValue;
      return true;
    }
  }

  // Shape 3.5 (H1 fix): partial selection inside a same-property span → split so
  // the slice becomes a SIBLING with the new value (no nesting).
  if (currentInfo.range &&
      recolorPartialSpan(getDoc(editor), root, currentInfo, styleProp, styleValue, walkUp)) return true;

  // Shape 4: selection crosses multiple spans — apply per-node, no outer wrap.
  if (currentInfo.range &&
      applyPropAcrossRange(currentInfo.range, getDoc(editor), styleProp, styleValue)) return true;

  tightenRangeToText(currentInfo.range, root, selMgr(editor));

  const doc = getDoc(editor);
  const span = doc.createElement('span');
  span.style[styleProp] = styleValue;
  sel.insertAtCursor(span);
  return true;
}

export const fontSizeCommand = {
  execute(editor, value = '') {
    if (!value || !isSafeCSSValue(value)) return;
    if (wrapInSpan(editor, 'fontSize', value, true)) return CommandManager.SKIP_RESTORE;
  },
  getValue(editor) { return getComputedAtCursor(editor, 'fontSize'); },
};

export const fontFamilyCommand = {
  execute(editor, family = '') {
    if (!family || !isSafeCSSValue(family)) return;
    if (wrapInSpan(editor, 'fontFamily', family, true)) return CommandManager.SKIP_RESTORE;
  },
  getValue(editor) { return getComputedAtCursor(editor, 'fontFamily'); },
};

export const lineHeightCommand = {
  execute(editor, value = '') {
    if (!value || !isSafeCSSValue(value)) return;
    const block = getBlockInfo(editor);
    if (block) block.style.lineHeight = value;
  },
  getValue(editor) { return getBlockLinHeight(editor); },
};

export const letterSpacingCommand = {
  execute(editor, value = '') {
    if (!value || !isSafeCSSValue(value)) return;
    if (wrapInSpan(editor, 'letterSpacing', value)) return CommandManager.SKIP_RESTORE;
  },
};

export const textIndentCommand = {
  execute(editor, value = '') {
    if (!value || !isSafeCSSValue(value)) return;
    const block = getBlockInfo(editor);
    if (block) block.style.textIndent = value;
  },
};

export const textTransformCommand = {
  execute(editor, value = '') {
    if (!['uppercase', 'lowercase', 'capitalize', 'none'].includes(value)) return;
    if (wrapInSpan(editor, 'textTransform', value)) return CommandManager.SKIP_RESTORE;
  },
};

export const fontWeightCommand = {
  execute(editor, value = '') {
    const str = String(value || '');
    if (!str || !isSafeCSSValue(str)) return;
    if (wrapInSpan(editor, 'fontWeight', str)) return CommandManager.SKIP_RESTORE;
  },
};

export const overlineCommand = {
  execute(editor) {
    if (wrapInSpan(editor, 'textDecoration', 'overline')) return CommandManager.SKIP_RESTORE;
  },
  isActive(editor) {
    const sel = selMgr(editor); if (!sel) return false;
    const info = sel.get(); if (!info) return false;
    const span = walkUp(info.startNode, editorEl(editor), (n) =>
      n.nodeType === 1 && n.style && (n.style.textDecoration || '').includes('overline'));
    return !!span;
  },
};

export const dottedUnderlineCommand = {
  execute(editor) {
    if (wrapInSpan(editor, 'textDecoration', 'underline dotted')) return CommandManager.SKIP_RESTORE;
  },
};
