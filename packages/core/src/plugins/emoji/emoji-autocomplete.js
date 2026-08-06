/**
 * emoji-autocomplete.js — 17.5.6: inline `:shortcode` emoji suggestions.
 *
 * Typing `:fi` (colon starting a token + ≥2 query chars) opens the shared
 * caret popup filtered against the emoji dataset (labels + keywords); Enter/
 * click replaces the `:query` text with the emoji character. Times ("5:30"),
 * URLs ("http://") and lone colons never trigger: the colon must be preceded
 * by start-of-node or whitespace, and the query must be shortcode-shaped.
 */
import { createCaretPopup } from '../../ui/caret-popup.js';
import { injectCaretPopupStyles } from '../../ui/caret-popup-styles.js';
import { gatherTextBeforeCaret, mergeTextRun } from '../../utils/text-run.js';
import { getClosestTag } from '../../selection/range-utils.js';

const QUERY_RE = /^[a-z0-9_+-]{2,}$/i;
const MAX_RESULTS = 8;

/** Pure: find a live `:query` token ending at the caret, or null. Reads the
 * whole contiguous text run (FF/WebKit fragment live typing across nodes). */
export function detectEmojiTrigger(node, offset) {
  if (!node || node.nodeType !== 3) return null;
  const { text } = gatherTextBeforeCaret(node, offset);
  const colon = text.lastIndexOf(':');
  if (colon === -1) return null;
  const query = text.slice(colon + 1);
  if (!QUERY_RE.test(query)) return null;
  const before = colon > 0 ? text[colon - 1] : '';
  if (before && !/\s/.test(before)) return null; // "5:30", "http://" never trigger
  return { colonIndex: colon, query };
}

/** Pure: filter the dataset by label/keyword substring, capped. */
export function filterEmojis(dataset, query) {
  const q = query.toLowerCase();
  const out = [];
  for (const e of dataset) {
    const hay = (e.label + ' ' + (e.keywords || []).join(' ')).toLowerCase();
    if (hay.includes(q)) {
      out.push(e);
      if (out.length >= MAX_RESULTS) break;
    }
  }
  return out;
}

/** Wire the behavior onto the emoji plugin instance. Returns a destroy fn. */
export function installEmojiAutocomplete(plugin, editor, dataset, doc) {
  injectCaretPopupStyles(doc);
  const popup = createCaretPopup(doc, {
    ariaLabel: 'Emoji suggestions',
    renderItem: (item) => `${item.ch}  ${item.label}`,
    onPick: (item) => applyPick(item),
  });
  let trigger = null; // { node, colonIndex } while the popup is open

  function close() { popup.close(); trigger = null; }

  function applyPick(item) {
    if (!trigger) return;
    const { node, colonIndex } = trigger;
    const info = editor.selection && editor.selection.get();
    let caret = (info && info.startNode === node) ? info.startOffset : node.nodeValue.length;
    // E1: snapshot BEFORE the mutation so the emoji insert is ONE atomic undo
    // step. A direct node.nodeValue write fires no `input` event, so without this
    // the debounced idle snapshot never runs and Ctrl+Z skips the whole insert
    // (same class of bug fixed for image/link direct-DOM ops).
    if (editor.history && editor.history.takeSnapshot) editor.history.takeSnapshot();
    // Fold fragmented siblings into the caret node first — colonIndex is an
    // offset into the merged run (see gatherTextBeforeCaret).
    const { prefixNodes } = gatherTextBeforeCaret(node, caret);
    caret = mergeTextRun(node, prefixNodes, caret);
    node.nodeValue = node.nodeValue.slice(0, colonIndex) + item.ch + node.nodeValue.slice(caret);
    const pos = colonIndex + item.ch.length;
    editor.selection.set(node, pos, node, pos);
    close();
    if (editor._onChangeFn) editor._onChangeFn();
    // Trailing afterCommand captures the POST-insert state so undo/redo step
    // through the emoji cleanly (mirrors deleteFigureFromDoc / replaceFigureWithText).
    if (typeof editor.emit === 'function') {
      editor.emit('afterCommand', { command: 'insertEmoji', args: [] });
    }
  }

  function check() {
    if (editor._isComposing) return;
    const info = editor.selection && editor.selection.get();
    if (!info || !info.collapsed) { close(); return; }
    // E3: a ":shortcode" is literal text inside code/pre, and would extend a link
    // — never autocomplete there. (Mirrors the link/mention plugins' guards.)
    const root = editor.getEditorElement && editor.getEditorElement();
    const n = info.startNode;
    if (root && n && (getClosestTag(n, 'code', root) || getClosestTag(n, 'pre', root)
        || getClosestTag(n, 'a', root))) { close(); return; }
    const hit = detectEmojiTrigger(info.startNode, info.startOffset);
    if (!hit) { close(); return; }
    const items = filterEmojis(dataset, hit.query);
    if (!items.length) { close(); return; }
    trigger = { node: info.startNode, colonIndex: hit.colonIndex };
    if (!popup.isOpen()) {
      const range = info.range.cloneRange();
      popup.open(range, items);
    } else {
      popup.setItems(items);
    }
  }

  const onInput = () => check();
  editor.on('input', onInput);
  // E4: re-check on caret moves too, so arrowing / clicking away from the
  // `:query` closes the popup instead of leaving a stale one that would pick into
  // the wrong spot on a later Enter. Only matters while the popup is open.
  const onSelChange = () => { if (popup.isOpen()) check(); };
  editor.on('selectionChange', onSelChange);

  plugin._acKeyDown = (e) => {
    if (!popup.isOpen()) return false;
    if (e.key === 'ArrowDown') { e.preventDefault(); popup.moveActive(1); return true; }
    if (e.key === 'ArrowUp') { e.preventDefault(); popup.moveActive(-1); return true; }
    // Enter OR Tab accepts the active item (Tab-to-accept matches typical
    // autocomplete; without it Tab pulled focus into the popup buttons).
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); popup.pickActive(); return true; }
    if (e.key === 'Escape') { e.preventDefault(); close(); return true; }
    return false;
  };

  return function destroy() {
    editor.off('input', onInput);
    editor.off('selectionChange', onSelChange);
    popup.destroy();
    plugin._acKeyDown = null;
  };
}
