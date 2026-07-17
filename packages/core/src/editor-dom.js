/**
 * DOM helper mixin: editor/iframe DOM construction, MutationObserver setup,
 * <br> insertion, and paragraph-mode normalization. Split out of editor.js and
 * editor-events.js to keep them within the 300-line limit. Applied to
 * OpenEditor.prototype alongside the other mixins.
 */

import { BASE_CSS } from './utils/base-css.js';
import { injectStyleOnce } from './utils/inject-style.js';
import { debounce } from './utils/debounce.js';

// Block-level / structural / replaced elements that must stay as top-level
// children of the editor and never be pulled into a wrapping <p>.
const _BLOCK_LEVEL = new Set([
  'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li',
  'blockquote', 'pre', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th',
  'figure', 'figcaption', 'hr', 'section', 'article', 'header', 'footer',
  'aside', 'main', 'nav', 'form', 'fieldset', 'dl', 'dt', 'dd', 'address',
  'video', 'audio', 'iframe', 'canvas', 'details', 'summary',
]);

export const editorDomMixin = {

  // ─── Editor / iframe DOM construction ────────────────────────────────────────

  _buildDOM() {
    this._wrapper = document.createElement('div');
    this._wrapper.className = 'oe-wrapper';

    // 15.11 — flash guard: stamp the configured theme on the wrapper BEFORE it is
    // inserted into the live document, so a dark/minimal/auto theme is present on
    // the very first frame (no flip). 'light' leaves the attribute off.
    const theme = ['dark', 'minimal', 'auto'].includes(this._config.theme) ? this._config.theme : 'light';
    if (theme !== 'light') this._wrapper.setAttribute('data-oe-theme', theme);

    if (this._config.iframe) {
      // The iframe's contentDocument is only accessible once the iframe is
      // CONNECTED to the live document — so the wrapper (holding the iframe)
      // must be attached to the container BEFORE we populate the frame. A
      // detached iframe returns a null contentDocument in real browsers
      // (jsdom is lenient, which is how this stayed hidden). Attach first,
      // then build the frame internals.
      this._container.appendChild(this._wrapper);
      this._buildIframeDOM();
    } else {
      this._editorEl = document.createElement('div');
      this._editorEl.className = 'oe-editor';
      this._editorEl.contentEditable = 'true';
      this._wrapper.appendChild(this._editorEl);
      this._container.appendChild(this._wrapper);
    }

    // Re-affirm the theme on the editable now that it exists (iframe or not).
    if (theme !== 'light' && this._editorEl) this._editorEl.setAttribute('data-oe-theme', theme);
  },

  _buildIframeDOM() {
    this._iframeEl = document.createElement('iframe');
    this._iframeEl.style.cssText = 'width:100%;border:none;display:block;';
    this._iframeEl.setAttribute('title', 'Editor content');
    // allow-same-origin is required for contenteditable and execCommand to function inside iframe.
    this._iframeEl.setAttribute('sandbox', 'allow-same-origin allow-scripts');
    this._wrapper.appendChild(this._iframeEl);

    // C-5: contentDocument may be null in strict sandboxing or cross-origin
    // contexts where same-origin is not granted; contentWindow may also be null
    // if the iframe hasn't been inserted into the DOM yet (should not happen
    // above, but guard defensively to prevent an uncaught TypeError).
    const iframeWin = this._iframeEl.contentWindow;
    this._iframeDoc = this._iframeEl.contentDocument ||
      (iframeWin ? iframeWin.document : null);
    if (!this._iframeDoc) {
      throw new Error('OpenEditor: iframe contentDocument is not accessible — check sandbox/CSP settings.');
    }
    this._iframeDoc.open();
    this._iframeDoc.write('<!DOCTYPE html><html><head></head><body></body></html>');
    this._iframeDoc.close();

    injectStyleOnce(this._iframeDoc, 'oe-base-styles', BASE_CSS);

    this._editorEl = this._iframeDoc.createElement('div');
    this._editorEl.className = 'oe-editor';
    this._editorEl.contentEditable = 'true';
    this._iframeDoc.body.appendChild(this._editorEl);
  },

  // ─── MutationObserver ────────────────────────────────────────────────────────

  _setupMutationObserver() {
    if (typeof MutationObserver === 'undefined') return;
    // 16.5.1 — the live word/char count recompute walks the whole document
    // (getText() does innerHTML→textContent + regex). Running it synchronously on
    // EVERY mutation janks a large (10k-word) doc. Defer it: the observer stays
    // synchronous for placeholder + the `mutation` event (both cheap), but the
    // expensive count recompute is debounced and run at idle. `_state` counts are
    // thus eventually-consistent; callers needing an exact value call
    // getWordCount()/getCharCount() directly (always accurate on demand). The
    // StatusBar computes its own counts on its own rAF throttle, independent of
    // this — so nothing user-visible regresses.
    this._recountDebounced = debounce(() => {
      if (this._destroyed || !this._state) return;
      const run = () => {
        if (this._destroyed || !this._state) return;
        this._state.wordCount = this.getWordCount();
        this._state.charCount = this.getCharCount();
      };
      const ric = typeof requestIdleCallback === 'function' ? requestIdleCallback : null;
      if (ric) ric(run, { timeout: 500 }); else run();
    }, 150);

    this._mutationObserver = new MutationObserver((mutations) => {
      this._updatePlaceholder();
      if (this._recountDebounced) this._recountDebounced();
      this.emit('mutation', mutations);
    });
    this._mutationObserver.observe(this._editorEl, {
      childList: true, subtree: true, characterData: true,
    });
  },

  // ─── DOM helpers ─────────────────────────────────────────────────────────────

  _insertBR() {
    if (!this.selection) return;
    const doc = this._iframeDoc || document;
    const win = this.selection.getWindow();
    if (!win) return;
    const sel = win.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0).cloneRange();
    range.deleteContents();
    const br = doc.createElement('br');
    range.insertNode(br);
    range.setStartAfter(br);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    this._updatePlaceholder();
  },

  _ensureParagraphMode() {
    const el = this._editorEl;
    if (!el) return;
    const doc = this._iframeDoc || document;

    if (!el.textContent.trim() && !el.querySelector('img, br')) return;

    // H-4 fix: block-level and replaced elements must NEVER be wrapped in <p>.
    // LOW fix: previously only bare TEXT nodes were wrapped, so a loose inline
    // ELEMENT child (e.g. <strong>x</strong> or <a>…</a> directly under the root
    // after certain paste/DOM ops) was left as an invalid block-level child.
    // Now we wrap each run of consecutive bare INLINE content (text + inline
    // elements) into one <p>, leaving true block elements alone.
    const children = Array.from(el.childNodes);
    let changed = false;
    let run = null; // open <p> collecting the current inline run
    for (const child of children) {
      const isBlock = child.nodeType === 1 && this._isBlockLevel(child);
      const isWhitespace = child.nodeType === 3 && !child.textContent.trim();
      const startsRun =
        (child.nodeType === 3 && child.textContent.trim()) ||
        (child.nodeType === 1 && !isBlock);
      if (startsRun) {
        if (!run) { run = doc.createElement('p'); el.insertBefore(run, child); }
        run.appendChild(child);
        changed = true;
      } else if (isWhitespace && run) {
        // Inter-element whitespace inside a run — keep it, don't split the run.
        run.appendChild(child);
      } else {
        run = null; // a block element (or leading whitespace) ends the run
      }
    }
    if (changed) this.logger.info('wrapped loose inline content in <p>');
  },

  // True for block-level / structural / replaced elements that must stay
  // top-level and never be pulled into a wrapping <p>.
  _isBlockLevel(node) {
    return _BLOCK_LEVEL.has(node.tagName.toLowerCase());
  },

  // ─── Config application (sizing, ARIA, paragraph separator) ──────────────────

  _applyConfig() {
    const cfg = this._config;
    const el = this._editorEl;
    const wrapper = this._wrapper;

    wrapper.style.minHeight = cfg.minHeight != null ? `${cfg.minHeight}px` : '';
    wrapper.style.maxHeight = cfg.maxHeight != null ? `${cfg.maxHeight}px` : '';
    if (cfg.height !== null) {
      wrapper.style.height = `${cfg.height}px`;
    }
    el.style.minHeight = 'inherit';
    el.style.maxHeight = 'inherit';

    el.setAttribute('spellcheck', String(cfg.spellcheck));

    if (cfg.placeholder) {
      el.setAttribute('data-placeholder', cfg.placeholder);
    }

    el.setAttribute('role', 'textbox');
    el.setAttribute('aria-multiline', 'true');
    if (cfg.placeholder) {
      el.setAttribute('aria-label', cfg.placeholder);
    }

    // 14.11 — RTL: set dir on the editable (text flow) AND the wrapper (so the
    // toolbar/status-bar mirror via [dir="rtl"] CSS). Default 'ltr'. Anything
    // other than 'rtl' is treated as 'ltr' (defensive).
    const dir = cfg.direction === 'rtl' ? 'rtl' : 'ltr';
    el.setAttribute('dir', dir);
    if (wrapper) wrapper.setAttribute('dir', dir);

    // 15.11 — re-affirm the theme attribute (the primary flash-guard stamp
    // happens in _buildDOM before the wrapper is attached; this covers config
    // read here and keeps the two elements in sync). 'light' = no attribute.
    const theme = ['dark', 'minimal', 'auto'].includes(cfg.theme) ? cfg.theme : 'light';
    if (theme !== 'light') {
      el.setAttribute('data-oe-theme', theme);
      if (wrapper) wrapper.setAttribute('data-oe-theme', theme);
    }

    const doc = this._iframeDoc || document;
    try {
      doc.execCommand('defaultParagraphSeparator', false, 'p');
    } catch (e) {
      this.logger.warn('defaultParagraphSeparator failed — Enter key may create <div> instead of <p>:', e.message);
    }
  },

};
