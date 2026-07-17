/**
 * media-dom.js — DOM helpers for the media plugin, split out to keep
 * media-plugin.js under the 300-line limit.
 */
import { EMBED_SANDBOX } from './media-providers.js';

/**
 * Build a sandboxed embed <figure> for a parsed spec.
 *
 * <figure contenteditable="false" data-oe-island="video"> — the same island
 * contract images use (image-dom.js), so click-to-select, resize, and align
 * behave identically and the iframe's own DOM can't be edited/corrupted by
 * stray typing.
 */
export function buildEmbed(editor, spec) {
  const doc = editor._iframeDoc || document;
  const fig = doc.createElement('figure');
  fig.className = 'oe-embed';
  fig.setAttribute('contenteditable', 'false');
  fig.setAttribute('data-oe-island', 'video');
  fig.setAttribute('data-provider', spec.provider);
  const frame = doc.createElement('iframe');
  frame.setAttribute('src', spec.src);
  frame.setAttribute('sandbox', EMBED_SANDBOX);   // mandatory, minimal
  frame.setAttribute('allowfullscreen', '');
  frame.setAttribute('loading', 'lazy');
  frame.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
  frame.setAttribute('title', `${spec.provider} video`);
  frame.className = 'oe-embed__frame';
  fig.appendChild(frame);
  // Click-capture shield: a cross-origin <iframe> swallows mouse events
  // entirely (they never bubble to the parent document), so without this a
  // click on the video could never reach MediaSelectionManager's mousedown
  // listener. The shield sits above the iframe and intercepts clicks while
  // unselected; media-selection.js hides it (pointer-events:none) once
  // selected so the video itself becomes clickable/playable.
  const shield = doc.createElement('div');
  shield.className = 'oe-embed__shield';
  fig.appendChild(shield);
  return fig;
}

/** Insert an empty <p> right after `fig` and move the caret into it. */
export function insertTrailingParagraph(editor, fig) {
  const doc = fig.ownerDocument;
  const win = editor.selection && editor.selection.getWindow && editor.selection.getWindow();
  if (!doc || !win) return;
  const p = doc.createElement('p');
  p.appendChild(doc.createElement('br'));
  if (fig.nextSibling) fig.parentNode.insertBefore(p, fig.nextSibling);
  else fig.parentNode.appendChild(p);
  const range = doc.createRange();
  range.setStart(p, 0);
  range.collapse(true);
  const sel = win.getSelection();
  if (sel) { sel.removeAllRanges(); sel.addRange(range); }
}

/** Apply left/center/right/inline alignment to an embed figure (mirrors
 *  image-dom.js's applyAlignment — same classes/inline-style shape, scoped
 *  to .oe-embed instead of .oe-figure). */
export function applyAlignment(figure, alignment) {
  // CLASS-ONLY (2026-07-16) — mirrors the image plugin's fix: layout lives in
  // the stylesheet (.oe-embed--*), so center can shrink-wrap + auto-center and
  // keep vertical margin. Clear any stale inline styles from older documents.
  figure.classList.remove('oe-embed--left', 'oe-embed--center',
                          'oe-embed--right', 'oe-embed--inline');
  figure.style.cssFloat = '';
  figure.style.display = '';
  figure.style.margin = '';
  figure.style.marginLeft = '';
  figure.style.marginRight = '';

  const cls = { left: 'oe-embed--left', right: 'oe-embed--right',
                center: 'oe-embed--center', inline: 'oe-embed--inline' }[alignment];
  if (cls) figure.classList.add(cls);
}

/** Insert a parsed embed spec at the caret, with the trailing-paragraph fix. */
export function insertEmbed(editor, spec) {
  const fig = buildEmbed(editor, spec);
  if (editor.selection && typeof editor.selection.insertAtCursor === 'function') {
    editor.selection.insertAtCursor(fig);
    // A block-level <figure> left with the caret right after it (no trailing
    // text node) makes contenteditable insert subsequent typing INSIDE the
    // figure rather than as a new block below it — add a plain paragraph
    // after the embed and move the caret into it.
    insertTrailingParagraph(editor, fig);
  }
  editor.emit('afterCommand', { command: 'embedMedia', args: [spec.provider] });
  if (editor._onChangeFn) editor._onChangeFn();
}
