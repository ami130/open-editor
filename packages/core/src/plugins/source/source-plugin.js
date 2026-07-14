/**
 * source-plugin.js — Phase 13.1: toggle between WYSIWYG and raw-HTML source.
 *
 * SECURITY MODEL (the whole point): the textarea's raw content re-enters the
 * document ONLY via editor.setHTML(), which sanitizes. The plugin NEVER assigns
 * innerHTML directly. So malicious HTML typed in source mode (a <script>, an
 * onerror handler, an unsafe iframe) is neutralized by the existing, hardened
 * setHTML path on the way back — nothing new to trust.
 *
 * Enter:  getHTML() (sanitized on read) → beautify → show a <textarea>.
 * Exit:   setHTML(textarea.value) (sanitized on write) → restore WYSIWYG.
 * While in source: the editable area is hidden and the textarea is the only
 * editing surface; formatting is meaningless so the wrapper gets a state class.
 *
 * Zero dependency: a plain <textarea> + the in-house beautifier + a pure
 * in-house HTML highlighter (source-highlight.js). No CDN, no Ace.
 *
 * 16.7.7 — SYNTAX HIGHLIGHTING via a scroll-synced overlay: the <textarea>
 * has transparent text (its caret still shows) and sits on top of a
 * <pre class="oe-source__highlight"> whose innerHTML is the highlighted
 * markup. Both share the exact same font/padding/box model (source-styles.js)
 * so the transparent glyphs align over their colored counterparts. On every
 * input the overlay is re-highlighted; on every scroll it is scroll-synced.
 * SECURITY unchanged: the overlay is presentation-only (its text is invisible,
 * pointer-events:none) and highlightHtml escapes every character — the raw
 * textarea value is still the source of truth and re-enters via the sanitizer.
 *
 * Config: `sourceModeBeautify` (default true), `sourceModeHighlight`
 * (default true — set false for the plain transparent-less textarea).
 * Implements { name, install, destroy, getToolbarButtons }.
 */
import { beautifyHtml } from './source-beautify.js';
import { injectSourceStyles } from './source-styles.js';
import { highlightHtml } from './source-highlight.js';

const SOURCE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <polyline points="7 8 3 12 7 16"/><polyline points="17 8 21 12 17 16"/><line x1="14" y1="4" x2="10" y2="20"/>
</svg>`;

export function createSourcePlugin() {
  return {
    name: 'source',
    _editor: null,
    _active: false,
    _textarea: null,
    _overlay: null,
    _container: null,
    _onInput: null,
    _onScroll: null,

    install(editor) {
      this._editor = editor;
      const doc = (typeof document !== 'undefined') ? document : null;
      if (doc) injectSourceStyles(doc);
    },

    destroy() {
      // If torn down while in source mode, restore the editable area so the
      // editor isn't left hidden. Do NOT re-apply content (editor is going away).
      if (this._active) this._teardownTextarea();
      this._editor = null;
    },

    getToolbarButtons() {
      return [{
        name: 'source', type: 'button', icon: SOURCE_ICON,
        tooltip: 'Source code',
        onClick: () => this.toggle(),
        isActive: () => this._active,
      }];
    },

    toggle() {
      if (this._active) this._exit();
      else this._enter();
    },

    _enter() {
      const editor = this._editor;
      if (!editor || this._active) return;
      const el = editor.getEditorElement();
      const wrapper = editor._wrapper;
      if (!el || !wrapper) return;
      const doc = editor._iframeDoc || document;

      const html = editor.getHTML ? editor.getHTML() : '';
      const beautify = !editor._config || editor._config.sourceModeBeautify !== false;
      const value = beautify ? beautifyHtml(html) : html;

      const highlight = !editor._config || editor._config.sourceModeHighlight !== false;

      const ta = doc.createElement('textarea');
      ta.className = 'oe-source__textarea oe-source__shared';
      ta.setAttribute('spellcheck', 'false');
      ta.setAttribute('aria-label', 'HTML source');
      ta.value = value;
      this._textarea = ta;
      this._enterValue = value; // remember, to detect whether the user edited

      el.style.display = 'none';           // hide the WYSIWYG surface
      wrapper.classList.add('oe-wrapper--source');

      if (highlight) {
        // Overlay structure: a positioned container holding the colored <pre>
        // behind the transparent-text <textarea>.
        const container = doc.createElement('div');
        container.className = 'oe-source';
        const pre = doc.createElement('pre');
        pre.className = 'oe-source__highlight oe-source__shared';
        pre.setAttribute('aria-hidden', 'true');
        pre.innerHTML = highlightHtml(value);
        this._overlay = pre;
        this._container = container;

        // Re-highlight on input; keep the overlay's scroll locked to the
        // textarea's so the colored glyphs stay under the transparent ones.
        this._onInput = () => { pre.innerHTML = highlightHtml(ta.value); this._syncScroll(); };
        this._onScroll = () => this._syncScroll();
        ta.addEventListener('input', this._onInput);
        ta.addEventListener('scroll', this._onScroll);

        container.appendChild(pre);
        container.appendChild(ta);
        wrapper.appendChild(container);
      } else {
        wrapper.appendChild(ta);
      }

      ta.focus();
      this._active = true;
      editor.emit('sourceEnter', { html: value });
      editor.emit('afterCommand', { command: 'sourceToggle', args: [true] });
    },

    _syncScroll() {
      if (this._overlay && this._textarea) {
        this._overlay.scrollTop = this._textarea.scrollTop;
        this._overlay.scrollLeft = this._textarea.scrollLeft;
      }
    },

    _exit() {
      const editor = this._editor;
      if (!editor || !this._active) return;
      const value = this._textarea ? this._textarea.value : '';
      const entered = this._enterValue;
      this._teardownTextarea();
      this._active = false;
      const el = editor.getEditorElement();

      // Only apply the source text if the user actually EDITED it. If the
      // textarea is unchanged since entry, applying is a no-op that would also
      // clobber any content set externally (e.g. host code called setHTML while
      // source view was open) — so skip the write entirely (audit#5 clobber).
      if (value !== entered) {
        // SECURITY: content is sanitized before it re-enters the DOM. We do NOT
        // use editor.setHTML() because that calls history.clear(), wiping undo;
        // instead we take a snapshot (pre) then set the sanitized HTML directly
        // and take a snapshot (post), so the source edit is a normal undoable
        // step (audit#5 undo). Mirrors the plugin two-snapshot undo model.
        editor.history && editor.history.takeSnapshot();
        const clean = editor._config && editor._config.sanitize === false
          ? value : editor._sanitizeHTML(value);
        editor._setRawHTML(clean);
        if (editor._config && editor._config.maxLength != null && editor._truncateToMaxLength) {
          editor._truncateToMaxLength();
        }
        editor.emit('afterCommand', { command: 'sourceApply', args: [] });
        if (editor._onChangeFn) editor._onChangeFn();
      }

      this._enterValue = null;
      if (el && el.focus) el.focus();
      editor.emit('sourceExit', {});
      editor.emit('afterCommand', { command: 'sourceToggle', args: [false] });
    },

    // Remove the textarea (+ overlay/container) and restore the editable area.
    // Shared by exit + destroy.
    _teardownTextarea() {
      const editor = this._editor;
      const wrapper = editor && editor._wrapper;
      const el = editor && editor.getEditorElement && editor.getEditorElement();
      if (this._textarea) {
        if (this._onInput) this._textarea.removeEventListener('input', this._onInput);
        if (this._onScroll) this._textarea.removeEventListener('scroll', this._onScroll);
      }
      // Remove whichever node was actually mounted: the container (highlight
      // mode) or the bare textarea (highlight disabled).
      const mounted = this._container || this._textarea;
      if (mounted && mounted.parentNode) mounted.parentNode.removeChild(mounted);
      this._textarea = null;
      this._overlay = null;
      this._container = null;
      this._onInput = null;
      this._onScroll = null;
      if (el) el.style.display = '';
      if (wrapper) wrapper.classList.remove('oe-wrapper--source');
    },
  };
}

export const sourcePlugin = createSourcePlugin();
