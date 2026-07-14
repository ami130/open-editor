/**
 * Sanitized-paste mixin. Extracted from editor-events.js to keep that file
 * within the 300-line limit. Applied to OpenEditor.prototype alongside the
 * other mixins.
 *
 * SECURITY: the browser's native paste drops raw clipboard HTML straight into
 * the contentEditable — including onerror/onload handlers, javascript: URLs,
 * <iframe>, etc. that <script>-stripping alone does not catch. We intercept
 * every paste, run the HTML through the same sanitizer used by setHTML, and
 * insert the cleaned markup ourselves. Plain-text-only clipboards are inserted
 * as text. maxLength is enforced afterwards just like the old handler did.
 */
import { getClipboardText } from './utils/clipboard.js';
import { runPastePipeline, buildPasteStages } from './paste/paste-pipeline.js';
import { plainTextToHtml } from './paste/paste-plain.js';
import { detectSource } from './paste/paste-detect.js';
import { cleanWord } from './paste/clean-word.js';
import { cleanGDocs } from './paste/clean-gdocs.js';
import { reconstructWordLists } from './paste/word-lists.js';
import { styleToSemantic } from './paste/style-to-semantic.js';
import { normalizePaste } from './paste/normalize-paste.js';
import { shouldAskOnPaste, defaultPasteAction, askPasteAction, PASTE_ACTIONS } from './paste/paste-dialog.js';
import { getClosestTag } from './selection/range-utils.js';
import { insertPasteContent } from './paste/paste-insert.js';
import { resolveLocale } from './ui/toolbar/locale.js';

export const editorPasteMixin = {
  // Clean pasted HTML through the full staged pipeline: security sanitizer →
  // source-specific cleanup (Word/GDocs) → Word list reconstruction →
  // style→semantic promotion → structural + encoding normalization.
  _cleanPastedHTML(html, source) {
    const ctx = { editor: this };
    const src = source || detectSource(html);
    const stages = buildPasteStages({ sanitize: (h) => this._sanitizeHTML(h) });
    if (src === 'word') { stages.push(cleanWord, reconstructWordLists); }
    else if (src === 'gdocs') { stages.push(cleanGDocs); }
    stages.push(styleToSemantic, normalizePaste);
    return runPastePipeline(html, stages, ctx);
  },

  _onPaste(e) {
    if (this._state && this._state.isReadOnly) { e.preventDefault(); return; }

    // 12.14 — paste pipeline events. `paste`/`beforePaste` are the cancelable
    // entry (a listener may e.preventDefault() to take over); `afterPaste` fires
    // once insertion completes (see _finishPaste). Existing plugins (image
    // paste, lone-URL autolink) hook `paste`.
    this.emit('paste', e);
    this.emit('beforePaste', e);
    if (e.defaultPrevented) return;

    // sanitize:false → native paste behaviour, still enforce maxLength.
    if (this._config.sanitize === false) { this._onPasteMaxLength(); return; }

    // Read the two flavors distinctly. `getClipboardText(e, true)` falls back to
    // plain text when there is no text/html, which would make us treat plain
    // text as HTML — so read the raw text/html directly to know it truly exists.
    // 12.16 — RTF: we intentionally do NOT read text/rtf. An RTF-only clipboard
    // (e.g. some Excel/native-app copies) has no text/html, so it degrades to
    // the text/plain path below. RTF decoding + embedded-image (\pict)
    // extraction is deferred to a later phase — documented, not silently
    // dropped. (Jodit likewise never decodes RTF.)
    const rawHtml = (e.clipboardData && e.clipboardData.getData)
      ? e.clipboardData.getData('text/html') : '';
    const html  = (rawHtml && rawHtml.trim()) ? rawHtml : null;
    const plain = getClipboardText(e, false);   // text/plain

    // 12.10 — honor a Ctrl+Shift+V "paste as plain text" request only if it was
    // armed within the last second (the chord immediately precedes the paste).
    // A stale arm (chord pressed, then no paste) can't leak into a later paste.
    const armedAt = this._forcePlainPasteAt || 0;
    const forcePlain = armedAt !== 0 && (Date.now() - armedAt) < 1000;
    this._forcePlainPasteAt = 0; // consume regardless

    // Nothing usable — let the browser handle it, enforce max.
    if (html == null && plain == null) { this._onPasteMaxLength(); return; }

    e.preventDefault();

    // HIGH-2 fix: while an ask-on-paste dialog is open, IGNORE any further paste
    // — not just another dialog paste. Previously only the dialog branch was
    // guarded, so a plain / force-plain / code-block paste arriving mid-dialog
    // inserted immediately, and resolving the dialog then inserted the rich
    // content too (via a now-stale saved range) — two pastes interleaved. All
    // paste routing below must be gated on the dialog being closed.
    if (this._pasteDialogOpen) return;

    // Paste INSIDE a code block → always plain text, no dialog, no rich HTML.
    // A code editor pastes escaped source verbatim (newlines kept as literal
    // "\n" text, which <pre> renders as line breaks) rather than injecting
    // <p>/<table> markup into <code>.
    const info = this.selection && this.selection.get && this.selection.get();
    const inCode = info && info.startNode &&
      getClosestTag(info.startNode, 'pre', this.getEditorElement());
    if (inCode) {
      const text = plain != null ? plain : (html || '').replace(/<[^>]+>/g, '');
      this._insertPasted(this._escapeCodeText(text));
      return;
    }

    // Plain-only clipboard, or forced-plain: insert text as paragraphs.
    if (forcePlain || html == null) {
      this._insertPasted(this._escapeText(plain != null ? plain : ''));
      return;
    }

    // 12.12 — rich HTML: optionally prompt Keep / Clean / plain-text.
    const source = detectSource(html);
    if (shouldAskOnPaste(this._config, source)) {
      // #2b — serialize dialogs: ignore a new paste while one is already open,
      // so two overlapping dialogs can't both insert and scramble the output.
      if (this._pasteDialogOpen) return;
      this._pasteDialogOpen = true;

      // Opening the modal moves focus off the editor, destroying the caret, so
      // capture the live range now and restore it before inserting.
      const savedRange = this._capturePasteRange();
      const locale = resolveLocale(this._config.locale);
      askPasteAction(this, source, locale).then((action) => {
        this._pasteDialogOpen = false;
        if (this._destroyed || !action) return;
        // #2a — only restore the caret if the bookmarked nodes are STILL in the
        // editor. A DOM mutation while the dialog was open (setHTML, another
        // edit) invalidates the range; restoring it would inject into unrelated
        // content, so fall back to the end of the editor instead.
        this._restorePasteRange(savedRange);
        this._applyPasteAction(action, html, plain, source);
      });
      return;
    }
    this._applyPasteAction(defaultPasteAction(this._config, source), html, plain, source);
  },

  // Apply a chosen paste action to the captured clipboard payload.
  //   keep → cleaned rich HTML;  text → escaped text w/ <br>;  only → plain <p>s.
  _applyPasteAction(action, html, plain, source) {
    if (action === PASTE_ACTIONS.ONLY) {
      this._insertPasted(this._escapeText(plain != null ? plain : ''));
      return;
    }
    if (action === PASTE_ACTIONS.TEXT) {
      // Escaped text, keep line breaks but no HTML formatting.
      this._insertPasted(plainTextToHtml(plain != null ? plain : html.replace(/<[^>]+>/g, ''), { block: false }));
      return;
    }
    // KEEP (default): full clean pipeline; empty result falls back to plain.
    const clean = this._cleanPastedHTML(html, source);
    if (clean && clean.trim()) this._insertPasted(clean);
    else if (plain != null) this._insertPasted(this._escapeText(plain));
    else this._finishPaste();
  },

  // Capture the live selection range for restoration after the async dialog.
  // Cloning the real Range (not a path bookmark) lets us later check whether its
  // containers are still connected to the editor (#2a).
  _capturePasteRange() {
    const win = this.selection && this.selection.getWindow && this.selection.getWindow();
    const sel = win && win.getSelection && win.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    try { return sel.getRangeAt(0).cloneRange(); } catch { return null; }
  },

  // Restore the caret to `range` ONLY if its containers are still inside the
  // editor. If the DOM changed while the dialog was open, the range is stale, so
  // fall back to a collapsed caret at the end of the editor (#2a) rather than
  // injecting into whatever content now occupies that position.
  _restorePasteRange(range) {
    const el = this._editorEl;
    const win = this.selection && this.selection.getWindow && this.selection.getWindow();
    const sel = win && win.getSelection && win.getSelection();
    if (!el || !sel) return;
    const valid = range &&
      el.contains(range.startContainer) && el.contains(range.endContainer);
    try {
      const r = valid ? range : (this._iframeDoc || document).createRange();
      if (!valid) { r.selectNodeContents(el); r.collapse(false); }
      sel.removeAllRanges();
      sel.addRange(r);
    } catch { /* non-fatal */ }
  },

  // Insert cleaned HTML at the caret and run the shared post-paste pipeline.
  // 12.15 — context-aware insert first (splits the host block for block-level
  // content so <p>-in-<p> mangling can't happen); falls back to insertAtCursor
  // for inline content or when there is no block to split.
  _insertPasted(cleanHtml) {
    if (cleanHtml && this.selection) {
      const handled = insertPasteContent(this, cleanHtml);
      if (!handled && typeof this.selection.insertAtCursor === 'function') {
        this.selection.insertAtCursor(cleanHtml);
      }
    }
    this._finishPaste();
  },

  // Shared post-insert steps (mirrors the input pipeline).
  _finishPaste() {
    if (!this._isComposing) this._ensureParagraphMode();
    this._truncateToMaxLength();
    this._updatePlaceholder();
    if (this._onChangeFn) this._onChangeFn();
    this.emit('afterPaste'); // 12.14 — insertion complete
  },

  // Plain-text clipboard → clean HTML (12.9): blank-line chunks → <p>, single
  // line breaks → <br>. Escaping handled inside plainTextToHtml.
  _escapeText(text) {
    return plainTextToHtml(text, { block: true });
  },

  // Escape plain text for insertion INSIDE a code block (13.7/audit#3): HTML
  // is escaped so nothing is parsed as markup, but newlines stay LITERAL "\n"
  // (a <pre> renders them as line breaks) — no <p>/<br> wrapping.
  _escapeCodeText(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  },
};
