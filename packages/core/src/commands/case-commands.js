/**
 * case-commands.js — 17.5.1: change case (UPPERCASE / lowercase / Title Case).
 *
 * Both CKEditor (premium) and Jodit (PRO) charge for this; it ships free here.
 *
 * The transform mutates the DATA of text nodes intersecting the selection —
 * node identities never change, so ALL inline markup (<strong>, <a>, <mark>…)
 * is preserved exactly, and the CommandManager's selection bookmark restores
 * cleanly afterwards. Title Case tracks word state ACROSS node boundaries
 * ("<strong>he</strong>llo" is ONE word — the "llo" must not be re-capitalized).
 */

const LETTER = /\p{L}/u;
// Word-continuation includes digits: "3rd" is ONE word (the 'r' must not be
// re-capitalized). Only LETTERS ever get case-transformed, though.
const WORD_CHAR = /[\p{L}\p{N}]/u;

/** UPPERCASE / lowercase a string (locale-aware). */
export function simpleCase(text, mode) {
  return mode === 'upper' ? text.toLocaleUpperCase() : text.toLocaleLowerCase();
}

/**
 * Title Case a string. `prevChar` is the character immediately BEFORE this
 * slice in document order (possibly from a previous text node) so word state
 * carries across inline-element boundaries.
 */
export function titleCase(text, prevChar = '') {
  let out = '';
  let prev = prevChar;
  for (const ch of text) {
    if (LETTER.test(ch)) {
      out += WORD_CHAR.test(prev) ? ch.toLocaleLowerCase() : ch.toLocaleUpperCase();
    } else {
      out += ch;
    }
    prev = ch;
  }
  return out;
}

/** True when the node is inside an editable region (not a locked island). */
function isEditableText(node) {
  let el = node.parentNode;
  while (el && el.nodeType === 1) {
    const ce = el.getAttribute && el.getAttribute('contenteditable');
    if (ce === 'false') return false;
    if (ce === 'true') return true;
    el = el.parentNode;
  }
  return true;
}

/**
 * Apply a case mode to every editable text node intersecting `range`.
 * Returns the number of text nodes changed.
 */
export function applyCaseToRange(doc, root, range, mode) {
  const walker = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
  let changed = 0;
  let prevChar = '';
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!range.intersectsNode(node)) continue;
    if (!isEditableText(node)) continue;
    const start = node === range.startContainer ? range.startOffset : 0;
    const end = node === range.endContainer ? range.endOffset : node.data.length;
    if (end <= start) continue;
    const slice = node.data.slice(start, end);
    const transformed = mode === 'title'
      ? titleCase(slice, prevChar)
      : simpleCase(slice, mode);
    prevChar = slice.charAt(slice.length - 1) || prevChar;
    if (transformed !== slice) {
      node.data = node.data.slice(0, start) + transformed + node.data.slice(end);
      changed++;
    }
  }
  return changed;
}

/** Register the `changeCase` command. Modes: 'upper' | 'lower' | 'title'. */
export function registerCaseCommands(editor) {
  editor.commands.register('changeCase', {
    execute(ed, mode = 'title') {
      if (mode !== 'upper' && mode !== 'lower' && mode !== 'title') return false;
      const info = ed.selection && ed.selection.get();
      if (!info || info.collapsed) return false;
      const root = ed.getEditorElement();
      const doc = root.ownerDocument;
      return applyCaseToRange(doc, root, info.range, mode) > 0;
    },
  });
}
