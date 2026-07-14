/**
 * link-behaviors.js — auxiliary Link behaviours wired by the plugin (Phase 10).
 *
 *   installPasteAutolink(editor)    — paste of a lone URL wraps it in an <a>
 *   installTypedAutolink(editor)    — typing a URL then Space/Enter wraps it (16.7.2)
 *   installDblClickOpen(editor)     — dbl-click an <a> opens it (opt-in)
 *   installReadonlyNavGuard(editor) — click an <a> while readonly is blocked
 *
 * Paste/input/afterCommand are emitted by core (editor.on), so
 * installPasteAutolink/installTypedAutolink use editor.on and are
 * auto-cleaned by PluginManager — they return nothing. 'click' and
 * 'dblclick' are NOT emitted by core, so those two attach directly to the
 * editor element and RETURN a cleanup function the plugin runs on destroy.
 */
import { wrapSelectionInLink, createAnchor, findLinkAt } from './link-dom.js';
import { isAllowedLinkHref } from '../../sanitizer/sanitizer-utils.js';
import { getClipboardText } from '../../utils/clipboard.js';
import { getClosestTag } from '../../selection/range-utils.js';
import { parseMediaUrl } from '../media/media-providers.js';

// A lone absolute URL (real scheme) — not every relative path.
const LONE_URL = /^(https?:\/\/|mailto:|tel:)\S+$/i;
// Trailing punctuation that is almost never part of the intended URL (sentence
// enders, closing brackets/quotes). Stripped before wrapping so pasting
// "https://x.com/page." doesn't link the trailing period (LOW audit fix).
const TRAIL_PUNCT = /[.,;:!?)\]}'"»›]+$/;

/**
 * Paste of a single URL → wrap. Requires the ENTIRE trimmed clipboard text to be
 * one absolute URL that also passes isAllowedLinkHref. Off when
 * editor._config.linkAutoDetect === false (default on, like Jodit).
 * Paste-only — no typed detection.
 */
export function installPasteAutolink(editor) {
  editor.on('paste', (e) => {
    if (e.defaultPrevented) return;
    if (editor._config && editor._config.linkAutoDetect === false) return;

    const text = getClipboardText(e, false); // text/plain only
    if (text == null) return;
    let trimmed = text.trim();
    if (!trimmed || /\s/.test(trimmed)) return;      // must be a single token
    // Strip trailing sentence punctuation, but only if a valid URL remains.
    const stripped = trimmed.replace(TRAIL_PUNCT, '');
    if (LONE_URL.test(stripped) && isAllowedLinkHref(stripped)) trimmed = stripped;
    if (!LONE_URL.test(trimmed) || !isAllowedLinkHref(trimmed)) return;

    // A bare YouTube/Vimeo URL is claimed by the media plugin's auto-embed
    // instead of becoming a plain link — richer, and matches CKEditor's
    // AutoMediaEmbed precedence over its generic autolink.
    if (parseMediaUrl(trimmed)) return;

    // Don't autolink inside a code context (URLs are literal there) or inside an
    // existing anchor (would nest/replace it). Leave the paste to core's text
    // path so the URL lands as plain text. (LOW audit fix.)
    const info = editor.selection && editor.selection.get();
    const root = editor.getEditorElement();
    const node = info && info.startNode;
    if (node && root && (
      getClosestTag(node, 'pre', root) ||
      getClosestTag(node, 'code', root) ||
      findLinkAt(node, root))) return;

    // Claim the paste so core's HTML/text path exits (guarded by defaultPrevented).
    e.preventDefault();
    editor.history && editor.history.takeSnapshot();

    const collapsed = !info || info.collapsed;
    // Collapsed → insert a new <a> with the URL as text; otherwise wrap selection.
    wrapSelectionInLink(editor, { href: trimmed }, collapsed ? trimmed : undefined);

    if (editor._onChangeFn) editor._onChangeFn();
  });
}

// A trailing regular space (U+0020) OR non-breaking space (U+00A0) —
// contenteditable often substitutes nbsp for a just-typed trailing space so
// it doesn't visually collapse, so the trigger must recognize both forms.
const NBSP = ' ';
const SPACE_DATA_VALUES = new Set([' ', NBSP]);

/**
 * Core of the typed-autolink trigger: given a text node and an offset
 * marking "everything up to here is finalized," find a trailing bare-URL
 * token ending at that offset (optionally after trimming `trailingCharsToSkip`
 * already-inserted trigger characters, e.g. the just-typed space) and wrap it
 * in a real <a>. Returns true if it wrapped something.
 */
function tryAutolinkAt(editor, node, endOffset, trailingCharsToSkip, moveCaret) {
  if (!node || node.nodeType !== 3) return false;
  const textUpToEnd = node.nodeValue.slice(0, endOffset);
  const beforeTrigger = trailingCharsToSkip
    ? textUpToEnd.slice(0, textUpToEnd.length - trailingCharsToSkip)
    : textUpToEnd;
  const lastSpaceIdx = Math.max(beforeTrigger.lastIndexOf(' '), beforeTrigger.lastIndexOf(NBSP));
  const token = beforeTrigger.slice(lastSpaceIdx + 1);
  if (!token) return false;

  const stripped = token.replace(TRAIL_PUNCT, '');
  const candidate = (LONE_URL.test(stripped) && isAllowedLinkHref(stripped)) ? stripped : token;
  if (!LONE_URL.test(candidate) || !isAllowedLinkHref(candidate)) return false;
  if (parseMediaUrl(candidate)) return false; // media plugin's own autoembed owns this case

  const root = editor.getEditorElement();
  if (getClosestTag(node, 'pre', root) || getClosestTag(node, 'code', root) || findLinkAt(node, root)) return false;

  // Split the text node directly and splice in a real <a> — deliberately
  // NOT going through wrapSelectionInLink's selection-range path: that
  // function's non-collapsed branch does a Range.extractContents()/
  // insertAtCursor() dance meant for arbitrary (possibly multi-node,
  // possibly cross-block) selections, and its "override the label if it
  // differs from the selected text" step interacts badly with a plain
  // same-text-node splice like this one. Splitting the node ourselves is
  // both simpler and correct by construction for this single-text-node case.
  const doc = node.ownerDocument;
  const tokenStart = lastSpaceIdx + 1;
  const tokenEnd = tokenStart + token.length;
  const afterToken = node.splitText(tokenEnd); // node now ends at tokenEnd
  node.splitText(tokenStart); // node now holds exactly [tokenStart, tokenEnd)
  const urlTextNode = node.nextSibling; // the split-off token text node
  const a = createAnchor(doc, { href: candidate });
  a.textContent = candidate;
  urlTextNode.parentNode.replaceChild(a, urlTextNode);

  editor.history && editor.history.takeSnapshot();
  // Caret goes right after any trigger character(s) we skipped (e.g. the
  // just-typed space) — NOT at offset 0, which would be BEFORE that
  // character and cause the next typed text to land in front of it instead
  // of after (observed live: typing "more" right after the trigger produced
  // "more " instead of " more"). Skipped entirely for the Enter trigger: the
  // cursor already correctly lives in the NEW block by this point (Enter
  // moved it there before this ever runs) — repositioning it back into the
  // OLD block we just edited would be wrong (observed live: subsequent
  // typing landed in the old block instead of the new empty one).
  if (moveCaret) editor.selection.set(afterToken, trailingCharsToSkip, afterToken, trailingCharsToSkip);
  editor.emit('afterCommand', { command: 'autolink', args: [] });
  if (editor._onChangeFn) editor._onChangeFn();
  return true;
}

/** The last text-containing descendant of `block`, or null. */
function lastTextNode(block) {
  let node = block;
  while (node && node.nodeType === 1 && node.lastChild) node = node.lastChild;
  return node && node.nodeType === 3 ? node : null;
}

/**
 * Typing a bare URL then Space/Enter wraps it, matching CKEditor's live
 * autolink (as opposed to installPasteAutolink's paste-only trigger).
 *   - Space (regular or nbsp) fires on the native `input` event: the DOM
 *     already has the space, so the trigger just reads the current caret.
 *   - Enter does NOT reach a native `input` event here — handleEnterSplit
 *     (editing/block-editing.js) performs the split programmatically and
 *     preventDefault()s the key, so this hooks `afterCommand: 'enterSplit'`
 *     instead and looks at the END of the block the split just LEFT
 *     BEHIND (the cursor has already moved into the new block by then).
 * Reuses the exact same LONE_URL/TRAIL_PUNCT/isAllowedLinkHref allowlist as
 * the paste path — same security posture, different trigger event.
 */
export function installTypedAutolink(editor) {
  editor.on('input', (e) => {
    if (editor._config && editor._config.linkAutoDetect === false) return;
    if (editor._isComposing) return; // never mid-IME
    if (!e || !SPACE_DATA_VALUES.has(e.data)) return;
    const info = editor.selection && editor.selection.get();
    if (!info || !info.collapsed || !info.startNode) return;
    tryAutolinkAt(editor, info.startNode, info.startOffset, 1, true);
  });

  editor.on('afterCommand', (payload) => {
    if (!payload || payload.command !== 'enterSplit') return;
    if (editor._config && editor._config.linkAutoDetect === false) return;

    const root = editor.getEditorElement();
    const info = editor.selection && editor.selection.get();
    const cursorNode = info && info.startNode;
    if (!cursorNode || !root) return;

    // Walk up from wherever the cursor landed to find the top-level block
    // under `root` (the NEW block created by the split), then its previous
    // sibling is the block the URL was actually typed into.
    let newBlock = cursorNode.nodeType === 3 ? cursorNode.parentNode : cursorNode;
    while (newBlock && newBlock.parentNode !== root) newBlock = newBlock.parentNode;
    const prevBlock = newBlock && newBlock.previousElementSibling;
    if (!prevBlock) return;

    const node = lastTextNode(prevBlock);
    if (!node) return;
    tryAutolinkAt(editor, node, node.nodeValue.length, 0, false);
  });
}

const SAFE_OPEN = /^(https?:|mailto:|tel:)/i;

/**
 * Double-click an <a> with a safe href → open in a new tab. Opt-in via
 * editor._config.linkFollowOnDblClick === true (default false, like Jodit).
 * Returns a cleanup function (dblclick is not a core event).
 */
export function installDblClickOpen(editor) {
  const el = editor.getEditorElement();
  if (!el) return () => {};
  const handler = (e) => {
    if (!(editor._config && editor._config.linkFollowOnDblClick === true)) return;
    const a = findLinkAt(e.target, el);
    if (!a) return;
    const href = a.getAttribute('href') || '';
    if (!SAFE_OPEN.test(href)) return;
    e.preventDefault();
    const win = el.ownerDocument && el.ownerDocument.defaultView;
    if (win && typeof win.open === 'function') win.open(href, '_blank', 'noopener');
  };
  el.addEventListener('dblclick', handler);
  return () => el.removeEventListener('dblclick', handler);
}

/**
 * Block navigation when clicking an <a> in a readonly editor. On by default
 * (editor._config.linkPreventReadOnlyNavigation !== false, like Jodit).
 * Returns a cleanup function (click is not a core event).
 */
export function installReadonlyNavGuard(editor) {
  const el = editor.getEditorElement();
  if (!el) return () => {};
  const handler = (e) => {
    if (editor._config && editor._config.linkPreventReadOnlyNavigation === false) return;
    if (!editor.isReadOnly || !editor.isReadOnly()) return;
    const a = findLinkAt(e.target, el);
    if (a) e.preventDefault();
  };
  el.addEventListener('click', handler);
  return () => el.removeEventListener('click', handler);
}
