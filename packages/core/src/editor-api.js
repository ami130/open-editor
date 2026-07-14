/**
 * Public API methods for OpenEditor.
 * Applied as a mixin via Object.assign(OpenEditor.prototype, editorApiMixin)
 * to keep editor.js under the 300-line limit.
 */

import { VERSION } from './version.js';
import { normalizeOutputHTML } from './utils/html-normalize.js';

export const editorApiMixin = {

  // ─── Phase 2 Public API ──────────────────────────────────────────────────────

  getHTML() {
    if (!this._editorEl) return '';
    const doc = this._iframeDoc || document;
    const raw = this._editorEl.innerHTML;
    if (!raw.trim()) return '';
    // Treat the canonical floor state as empty — a fresh or fully-cleared editor
    // contains only <p><br></p> which has no user content to serialize.
    if (raw.replace(/\s/g, '') === '<p><br></p>') return '';
    // SECURITY: sanitize on output too — content reaches the DOM via paths the
    // input sanitizer never saw (drag-drop, IME, autofill, third-party scripts).
    // Skipped only when the caller opted out via config.
    const normalized = normalizeOutputHTML(raw, doc);
    if (this._config.sanitize === false) return normalized;
    return this._sanitizeHTML(normalized);
  },

  setHTML(html) {
    if (this._destroyed) return;
    if (typeof html !== 'string') html = '';

    const el = this._editorEl;
    const scrollTop = el ? el.scrollTop : 0;

    const sanitized = this._config.sanitize !== false
      ? this._sanitizeHTML(html)
      : html;

    // 16.A3 — cancelable pre-hook: fires BEFORE any DOM mutation with the
    // sanitized html; a listener calling preventDefault() aborts the whole
    // operation (nothing is written, no state/history/events change). Mirrors
    // the beforeCommand cancelation contract.
    const beforeEvent = { html: sanitized, defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; } };
    this.emit('beforeSetHTML', beforeEvent);
    if (beforeEvent.defaultPrevented) return;

    this._isSettingHTML = true;
    this._setRawHTML(sanitized);
    // Enforce maxLength on programmatic content too (not just keydown/paste).
    if (this._config.maxLength != null && typeof this._truncateToMaxLength === 'function') {
      this._truncateToMaxLength();
    }
    this._isSettingHTML = false;

    if (el) el.scrollTop = scrollTop;

    // Cancel any pending debounced onChange from prior typing — else it fires
    // ~300ms later, flips isDirty back to true, and contradicts this setHTML.
    if (this._onChangeFn && typeof this._onChangeFn.cancel === 'function') {
      this._onChangeFn.cancel();
    }

    this._state.isDirty = false;
    this._state.html = this.getHTML();

    // Clear the autosave draft only when autosave uses localStorage (truthiness
    // alone could remove an unrelated 'oe-draft' key).
    if (this._config.autosave && this._config.autosave.storage === 'localStorage') {
      const key = this._config.autosave.key || 'oe-draft';
      try { localStorage.removeItem(key); } catch { /* storage unavailable */ }
    }

    if (this.history) {
      this.history.clear();
      this.history.takeSnapshot();
    }

    this.emit('setHTML', { html: sanitized });
    this.logger.info('setHTML called');
  },

  // 16.5.4 — crash recovery: re-render from the last clean snapshot (_state.html).
  // If re-rendering itself throws (corrupt content, DOM in a bad state), emit
  // `error` with context and fall back to the empty floor so the editor stays
  // usable rather than wedged. Returns true if it recovered to the snapshot.
  reset() {
    if (this._destroyed) return false;
    const clean = (this._state && typeof this._state.html === 'string') ? this._state.html : '';
    try {
      this.setHTML(clean);
      this.emit('reset', { html: this.getHTML() });
      return true;
    } catch (err) {
      this.emit('error', { error: err, context: 'reset' });
      try { this._setRawHTML('<p><br></p>'); } catch { /* last resort */ }
      if (this._state) { this._state.isDirty = false; this._state.html = ''; }
      return false;
    }
  },

  getText() {
    if (!this._editorEl) return '';
    const doc = this._iframeDoc || document;
    const tmp = doc.createElement('div');
    tmp.innerHTML = this._editorEl.innerHTML;
    // Strip zero-width chars for consistency with isEmpty() — pending-format
    // ZWSP must not count as text content (M-14, same set as isEmpty).
    return (tmp.textContent || tmp.innerText || '')
      .replace(/[\u200B\u200C\u2060\uFEFF]/g, '').replace(/\u200D/g, '')
      .trim();
  },

  isEmpty() {
    if (!this._editorEl) return true;
    const doc = this._iframeDoc || document;
    const tmp = doc.createElement('div');
    tmp.innerHTML = this._editorEl.innerHTML;
    const brs = tmp.querySelectorAll('br');
    brs.forEach((br) => br.parentNode && br.parentNode.removeChild(br));
    const text = (tmp.textContent || tmp.innerText || '')
      .replace(/\u00a0/g, ' ')                    // NBSP \u00A0 \u2192 space
      .replace(/[\u200B\u200C\u2060\uFEFF]/g, '').replace(/\u200D/g, '') // strip zero-width chars (M-14)
      .trim();
    // Non-text content also counts as non-empty (matches Jodit): images, media,
    // rules, tables, and embeds render real content even with no text, so the
    // placeholder must NOT show over them.
    const hasContent = tmp.querySelector(
      'img, hr, table, video, audio, iframe, embed, object, svg, figure, picture, source'
    );
    return !text && !hasContent;
  },

  getWordCount() {
    const text = this.getText();
    if (!text) return 0;
    return text.trim().split(/\s+/).filter(Boolean).length;
  },

  getCharCount() {
    return this.getText().length;
  },

  enable() {
    if (this._destroyed) return;
    const was = this._state.isReadOnly;
    this._config.readonly = false;
    this._state.isReadOnly = false;
    if (this._editorEl) {
      this._editorEl.contentEditable = 'true';
      this._editorEl.removeAttribute('aria-disabled');
      this._editorEl.setAttribute('aria-readonly', 'false');
      if (this._wrapper) this._wrapper.classList.remove('oe-disabled', 'oe-readonly');
    }
    // 2.8 — emit readOnlyChange only on an actual transition.
    if (was) this.emit('readOnlyChange', { readOnly: false });
    this.logger.info('editor enabled');
  },

  disable() {
    if (this._destroyed) return;
    const was = this._state.isReadOnly;
    this._config.readonly = true;
    this._state.isReadOnly = true;
    if (this._editorEl) {
      this._editorEl.contentEditable = 'false';
      this._editorEl.setAttribute('aria-disabled', 'true');
      this._editorEl.setAttribute('aria-readonly', 'true');
      // 15.8 — .oe-readonly softens the harsh .oe-disabled content dimming into a
      // distinct "viewable, not editable" look; toolbar stays muted/inert.
      if (this._wrapper) this._wrapper.classList.add('oe-disabled', 'oe-readonly');
    }
    // 2.8 — emit readOnlyChange only on an actual transition.
    if (!was) this.emit('readOnlyChange', { readOnly: true });
    this.logger.info('editor disabled');
  },

  // getJSON / setJSON live in editor-json.js (300-line limit).

  // ─── Phase 1 Public API ──────────────────────────────────────────────────────

  focus() { this._editorEl && this._editorEl.focus(); },
  blur()  { this._editorEl && this._editorEl.blur(); },

  setReadOnly(bool) {
    if (this._destroyed) return;
    // Coerce to a real boolean, then delegate to disable()/enable() so the
    // DOM/ARIA state stays consistent across all three entry points.
    const ro = !!bool;
    if (ro) this.disable(); else this.enable();
    this.logger.info('readonly:', ro);
  },

  isReadOnly() {
    if (this._destroyed) return false;
    return this._state ? !!this._state.isReadOnly : !!(this._config && this._config.readonly);
  },

  // ─── Phase 5 Public API — History ────────────────────────────────────────────

  undo()    { if (this.history) this.history.undo(); },
  redo()    { if (this.history) this.history.redo(); },
  canUndo() { return !!this.history && this.history.canUndo(); },
  canRedo() { return !!this.history && this.history.canRedo(); },

  getContainer()    { return this._container; },
  getEditorElement(){ return this._editorEl; },
  getVersion()      { return VERSION; },
  isDestroyed()     { return this._destroyed; },

  // ─── Destroy ─────────────────────────────────────────────────────────────────

  destroy() {
    if (this._destroyed) return;

    this.logger.info('destroy start');
    this.emit('beforeDestroy', this);

    if (this._onChangeFn) { this._onChangeFn.cancel(); this._onChangeFn = null; }

    if (this._autosaveIntervalId !== null) {
      clearInterval(this._autosaveIntervalId);
      this._autosaveIntervalId = null;
    }

    for (const tid of this._timers) clearTimeout(tid);
    this._timers.clear();

    if (this._recountDebounced) { this._recountDebounced.cancel(); this._recountDebounced = null; }

    if (this._mutationObserver) {
      this._mutationObserver.disconnect();
      this._mutationObserver = null;
    }

    for (const type of Object.keys(this._boundHandlers)) {
      for (const { target, fn } of this._boundHandlers[type]) {
        target.removeEventListener(type, fn);
      }
    }
    this._boundHandlers = {};

    if (this._wrapper && this._wrapper.parentNode) {
      this._wrapper.parentNode.removeChild(this._wrapper);
    }

    // Remove global style tag only when last instance is destroyed.
    // _removeGlobalStyles() is defined in editor.js where _instanceCount lives.
    this._removeGlobalStyles();

    // Tear down subsystems: plugins first (they depend on everything below),
    // then chrome, history, commands, UI — in reverse-init order.
    if (this.plugins) { this.plugins.destroy(); this.plugins = null; }
    // Remove fullscreen ESC listener if editor is destroyed while in fullscreen.
    if (typeof this._removeFullscreenEscListener === 'function') {
      this._removeFullscreenEscListener();
    }
    if (this.inlineToolbar)     { this.inlineToolbar.destroy();     this.inlineToolbar     = null; }
    if (this.blockquoteToolbar) { this.blockquoteToolbar.destroy(); this.blockquoteToolbar = null; }
    if (this.commandAnnouncer) { this.commandAnnouncer.destroy(); this.commandAnnouncer = null; }
    if (this.statusBar) { this.statusBar.destroy(); this.statusBar = null; }
    if (this.toolbar) { this.toolbar.destroy(); this.toolbar = null; }
    if (this.history)  { this.history.destroy();  this.history  = null; }
    if (this.commands) { this.commands.destroy(); this.commands = null; }
    if (this.ui) {
      this.ui.modal.destroy();
      this.ui.tooltip.destroy();
      this.ui.contextMenu.destroy();
      this.ui = null;
    }

    this.emit('destroy', this);
    this.logger.info('destroy complete');

    this.removeAllListeners();
    this._container = null;
    this._wrapper   = null;
    if (this.selection) { this.selection.update(null, null); this.selection = null; }
    this._editorEl  = null;
    this._iframeEl  = null;
    this._iframeDoc = null;
    this._styleEl   = null;
    this._timers    = null;
    this._boundHandlers = null;
    this._state     = null;
    this.shortcuts  = null;
    this.logger     = null;
    this._config    = null;
    this._destroyed = true;
  },

};
