/**
 * Lifecycle setup mixin: debounced onChange and localStorage autosave.
 * Split out of editor-events.js to keep both within the 300-line limit.
 * Applied to OpenEditor.prototype alongside the other mixins.
 */

import { debounce } from './utils/debounce.js';

export const editorLifecycleMixin = {

  // 16.5.3 — beforeunload dirty guard (opt-in via config.warnOnUnload). When
  // there are unsaved edits, trigger the browser's native "leave site?" prompt.
  // Modern browsers require BOTH preventDefault() and setting returnValue; the
  // shown text is browser-controlled (custom strings are ignored).
  _onBeforeUnload(e) {
    if (this._destroyed || !this._state || !this._state.isDirty) return;
    e.preventDefault();
    e.returnValue = '';
    return '';
  },

  // ─── onChange setup ──────────────────────────────────────────────────────────

  _setupOnChange() {
    // config.onChange accepts three shapes (16.A1 — resolve the callback/event
    // name collision so the intuitive `onChange: fn` form is not silently ignored):
    //   • a function            → called on every (debounced) change
    //   • { handler, debounce } → handler called; debounce sets the wait
    //   • { debounce }          → event-only, custom debounce (legacy shape)
    const cfg = this._config.onChange;
    const handler = typeof cfg === 'function'
      ? cfg
      : (cfg && typeof cfg.handler === 'function' ? cfg.handler : null);
    const wait = (cfg && typeof cfg === 'object' && cfg.debounce != null)
      ? cfg.debounce
      : 300;

    this._onChangeFn = debounce(() => {
      if (this._destroyed) return;
      const html = this.getHTML();
      const text = this.getText();
      this._state.html = html;
      this._state.isDirty = true;
      // The config callback fires first, then the event — both get {html, text}.
      // A throwing callback must not prevent the event or corrupt editor state.
      if (handler) {
        try { handler({ html, text }); }
        catch (e) { this.logger.warn('onChange handler threw:', e && e.message); }
      }
      this.emit('onChange', { html, text });
    }, wait);
  },

  // ─── Autosave setup ──────────────────────────────────────────────────────────

  _setupAutosave() {
    const cfg = this._config.autosave;
    if (!cfg || cfg.storage !== 'localStorage') return;

    const key = cfg.key || 'oe-draft';
    const interval = cfg.interval || 30000;

    // M-10: allow `autosave.restore: false` to skip restoring a draft on load
    // (useful when autosave is used for save-only without automatic restore).
    const doRestore = cfg.restore !== false;
    if (doRestore) {
      try {
        const saved = localStorage.getItem(key);
        // 16.5.4 — a companion "<key>:ts" holds the save timestamp so the host
        // can decide if the draft is newer than the loaded content. Stored
        // separately to keep the main key a bare-HTML string (backward compatible
        // with drafts written before this existed → savedAt is null then).
        const savedAt = this._readAutosaveTimestamp(key);
        if (saved && this._config.defaultContent) {
          // H-13: a saved draft AND defaultContent both exist. defaultContent
          // wins (it is the explicit programmatic baseline), but silently
          // dropping the draft loses user work without a trace. Surface it so
          // the host app can offer "restore draft?" instead.
          this.emit('autosaveDraftSkipped', { key, html: saved, savedAt });
          this.logger.warn(
            'autosave: a saved draft exists but defaultContent is set — draft NOT restored. ' +
            'Listen for "autosaveDraftSkipped" to recover it. key:', key
          );
        } else if (saved) {
          this._isSettingHTML = true;
          this._setRawHTML(
            this._config.sanitize !== false
              ? this._sanitizeHTML(saved)
              : saved
          );
          this._isSettingHTML = false;
          // Keep baseline state in sync with restored content (mirror setHTML),
          // and enforce maxLength on an over-long draft.
          this._truncateToMaxLength();
          this._state.html = this.getHTML();
          this.emit('autosaveRestored', { key, html: saved, savedAt });
          this.logger.info('autosave restored from localStorage key:', key);
        }
      } catch (e) {
        this.logger.warn('autosave restore failed:', e.message);
      }
    }

    // H-12: only write (and emit autosaveSaved) when the content actually
    // changed since the last save. Otherwise an idle editor rewrites identical
    // HTML and fires a spurious autosaveSaved on every interval tick.
    this._lastAutosavedHTML = this.getHTML();
    this._autosaveIntervalId = setInterval(() => {
      if (this._destroyed) return;
      const html = this.getHTML();
      if (html === this._lastAutosavedHTML) return;
      try {
        localStorage.setItem(key, html);
        const savedAt = Date.now();
        try { localStorage.setItem(key + ':ts', String(savedAt)); } catch { /* quota */ }
        this._lastAutosavedHTML = html;
        this.emit('autosaveSaved', { key, savedAt });
        this.logger.info('autosave saved to localStorage key:', key);
      } catch (e) {
        this.logger.warn('autosave save failed:', e.message);
        this.emit('autosaveFailed', { key, error: e });
      }
    }, interval);
  },

  // 16.5.4 — read the companion save-timestamp for an autosave key. Returns a
  // number (ms epoch) or null (no timestamp / storage unavailable / legacy draft).
  _readAutosaveTimestamp(key) {
    try {
      const raw = localStorage.getItem(key + ':ts');
      const n = raw == null ? NaN : Number(raw);
      return Number.isFinite(n) ? n : null;
    } catch { return null; }
  },

};
