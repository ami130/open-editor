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
    // Fold fragmented siblings into the caret node first — colonIndex is an
    // offset into the merged run (see gatherTextBeforeCaret).
    const { prefixNodes } = gatherTextBeforeCaret(node, caret);
    caret = mergeTextRun(node, prefixNodes, caret);
    node.nodeValue = node.nodeValue.slice(0, colonIndex) + item.ch + node.nodeValue.slice(caret);
    const pos = colonIndex + item.ch.length;
    editor.selection.set(node, pos, node, pos);
    close();
    if (editor._onChangeFn) editor._onChangeFn();
  }

  function check() {
    if (editor._isComposing) return;
    const info = editor.selection && editor.selection.get();
    if (!info || !info.collapsed) { close(); return; }
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

  plugin._acKeyDown = (e) => {
    if (!popup.isOpen()) return false;
    if (e.key === 'ArrowDown') { e.preventDefault(); popup.moveActive(1); return true; }
    if (e.key === 'ArrowUp') { e.preventDefault(); popup.moveActive(-1); return true; }
    if (e.key === 'Enter') { e.preventDefault(); popup.pickActive(); return true; }
    if (e.key === 'Escape') { e.preventDefault(); close(); return true; }
    return false;
  };

  return function destroy() {
    editor.off('input', onInput);
    popup.destroy();
    plugin._acKeyDown = null;
  };
}
