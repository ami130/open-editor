/**
 * speech-plugin.js — dictation (speech-to-text) via the browser's native Web
 * Speech API. Click the mic → talk → the recognized text is inserted at the
 * cursor. A FREE feature: the browser (and its OS/provider) does all the
 * transcription — there is NO server, NO API key, NO AI, NO cost. This plugin
 * is a thin, safe wrapper around `SpeechRecognition`.
 *
 * GRACEFUL DEGRADATION (the whole point of doing this cleanly):
 *   • The Web Speech API is Chromium/Safari only — Firefox does NOT support it.
 *     So the mic button is only contributed when the API is actually present
 *     (feature-detected). On an unsupported browser it simply never appears —
 *     no dead button, no error.
 *   • Recognition needs a secure context (https or localhost) + the user's mic
 *     permission. A permission denial / error stops listening and emits the
 *     standard `afterCommand` event; it never throws.
 *
 * Privacy note: in Chrome, recognition streams audio to the browser's speech
 * provider (Google) — i.e. audio leaves the machine, like any Web-Speech app.
 * That is the browser's behaviour, not this editor's; document it for privacy-
 * sensitive integrators.
 *
 * Implements the Phase 8 plugin interface: { name, install, destroy,
 * getToolbarButtons }. Emits only the already-frozen `afterCommand` event — no
 * new events, config keys, or methods (the API contract stays intact).
 */

const MIC_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
  <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
  <line x1="12" y1="19" x2="12" y2="22"/>
</svg>`;

/** The Web Speech API constructor, or null when the browser lacks it. Guarded
 *  for SSR (no `window`). This is the single source of "is dictation available". */
function speechCtor() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function createSpeechPlugin(config = {}) {
  return {
    name: 'speech',
    _editor: null,
    _rec: null,        // the live SpeechRecognition instance while listening
    _listening: false,

    install(editor) {
      this._editor = editor;
      // Language for recognition: explicit config wins, else the editor's
      // direction/lang, else the document lang, else the browser default.
      this._lang = config.lang
        || (editor._config && editor._config.language)
        || (typeof document !== 'undefined' && document.documentElement.lang)
        || undefined;
    },

    destroy() {
      this._stop();        // release the mic + tear down the recognizer
      this._editor = null;
    },

    getToolbarButtons() {
      // Feature-detect: contribute the mic button ONLY where the API exists, so
      // an unsupported browser (Firefox) shows nothing rather than a dead button.
      if (!speechCtor()) return [];
      return [{
        name: 'speech',
        // labelKey → the toolbar looks 'speech' up in the locale bundle first
        // (locale.js), so the tooltip is translatable; `tooltip` is the EN default.
        labelKey: 'speech',
        type: 'button',
        icon: MIC_ICON,
        tooltip: 'Dictate (speech to text)',
        onClick: () => this._toggle(),
        // Active while the mic is listening — a live, truthful indicator.
        isActive: () => this._listening === true,
      }];
    },

    _toggle() {
      if (this._listening) this._stop();
      else this._start();
    },

    _start() {
      const editor = this._editor;
      const Ctor = speechCtor();
      if (!editor || !Ctor || this._listening) return;

      let rec;
      try { rec = new Ctor(); } catch { return; } // construction can throw on some UAs
      rec.continuous = true;         // keep listening until the user stops
      rec.interimResults = false;    // insert only finalized phrases (no flicker)
      if (this._lang) rec.lang = this._lang;

      // A finalized phrase → insert it at the cursor as plain text.
      rec.onresult = (event) => {
        if (!this._editor || this._editor._destroyed) return;
        let text = '';
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const r = event.results[i];
          if (r && r.isFinal && r[0]) text += r[0].transcript;
        }
        if (text) this._insert(text);
      };

      // Any error (permission denied, no-speech, network) → stop cleanly AND
      // surface WHY (a silent stop looks broken — the mic just un-highlights).
      rec.onerror = (event) => {
        const err = (event && event.error) || '';
        const msg = err === 'not-allowed' || err === 'service-not-allowed'
          ? 'Microphone access was blocked — allow it in your browser to dictate.'
          : err === 'no-speech'
            ? 'No speech detected — try again.'
            : err === 'network'
              ? 'Dictation needs an internet connection.'
              : 'Dictation stopped.';
        this._notify(msg);
        this._stop();
      };
      // Fired when the service disconnects — mirror our own state to it.
      rec.onend = () => { if (this._listening) this._setListening(false); };

      this._rec = rec;
      try {
        rec.start();               // triggers the mic-permission prompt
        this._setListening(true);
      } catch {
        this._rec = null;          // start() throws if already started / blocked
      }
    },

    _stop() {
      const rec = this._rec;
      this._rec = null;
      if (rec) {
        rec.onresult = rec.onerror = rec.onend = null; // detach before stopping
        try { rec.stop(); } catch { /* already stopped */ }
      }
      this._setListening(false);
    },

    /** Insert recognized text at the cursor (cursor-aware, like emoji/insert). */
    _insert(text) {
      const editor = this._editor;
      if (!editor) return;
      // Normalize spacing: a single leading space so dictated phrases don't fuse
      // onto the previous word, trimmed of trailing whitespace from the provider.
      const clean = ` ${String(text).replace(/\s+/g, ' ').trim()}`;
      if (editor.selection && typeof editor.selection.insertAtCursor === 'function') {
        editor.selection.insertAtCursor(clean);
      } else if (editor.commands && typeof editor.commands.execute === 'function') {
        editor.commands.execute('insertText', clean);
      }
      editor.emit('afterCommand', { command: 'speech', args: [clean] });
    },

    _setListening(on) {
      if (this._listening === on) return;
      this._listening = on;
      // Reflect listening state on the mic button immediately (the toolbar also
      // re-reads isActive on the next selectionChange, but this gives instant
      // feedback without forcing a broad toolbar re-sync). Best-effort: find the
      // button by its plugin control name in the editor's toolbar DOM.
      this._reflectButton(on);
      const editor = this._editor;
      // Surface the state change through the already-frozen afterCommand event
      // (no new events → the API contract stays intact).
      if (editor) editor.emit('afterCommand', { command: 'speech', args: [on ? 'start' : 'stop'] });
    },

    /** Toggle the mic button's active styling directly (instant feedback). Uses
     *  the SAME data-attr + class the toolbar itself uses (toolbar-button.js:
     *  data-name="speech", oe-tb__btn--active), so it stays in sync with a later
     *  toolbar re-render rather than fighting it. */
    _reflectButton(on) {
      const editor = this._editor;
      const root = editor && editor.getContainer && editor.getContainer();
      if (!root || typeof root.querySelector !== 'function') return;
      const btn = root.querySelector('.oe-tb__btn[data-name="speech"]');
      if (btn && btn.classList) {
        btn.classList.toggle('oe-tb__btn--active', on);
        btn.setAttribute('aria-pressed', String(on));
      }
    },

    /**
     * Show a brief, self-contained notice (e.g. "Microphone blocked") so a mic
     * denial/error isn't a silent no-op that looks broken. Deliberately NOT a new
     * editor event (keeps the frozen API contract intact) and NOT a global toast
     * system — a small `role="status"` (aria-live) chip appended to the editor
     * container, auto-dismissed. Also mirrored onto the mic button's title so a
     * hover explains the state. No-ops if there's no DOM (SSR/tests).
     */
    _notify(message) {
      const editor = this._editor;
      const root = editor && editor.getContainer && editor.getContainer();
      if (!root || typeof root.ownerDocument === 'undefined' || !root.ownerDocument) return;
      // Reflect on the mic button's tooltip/title for a hover explanation.
      const btn = typeof root.querySelector === 'function' && root.querySelector('.oe-tb__btn[data-name="speech"]');
      if (btn && typeof btn.setAttribute === 'function') btn.setAttribute('title', message);
      const doc = root.ownerDocument;
      const chip = doc.createElement('div');
      chip.setAttribute('role', 'status');       // announced by screen readers
      chip.setAttribute('aria-live', 'polite');
      chip.textContent = message;
      chip.style.cssText =
        'position:absolute;bottom:8px;left:50%;transform:translateX(-50%);z-index:30;'
        + 'max-width:90%;padding:6px 12px;border-radius:8px;font-size:13px;'
        + 'background:#2a2f36;color:#fff;box-shadow:0 2px 10px rgba(0,0,0,.25);'
        + 'pointer-events:none;opacity:0;transition:opacity .15s';
      // The container is positioned (editor wrapper); append + fade in/out.
      const raf = (typeof requestAnimationFrame === 'function') ? requestAnimationFrame : (fn) => setTimeout(fn, 0);
      try {
        root.appendChild(chip);
        raf(() => { chip.style.opacity = '1'; });
        setTimeout(() => {
          chip.style.opacity = '0';
          setTimeout(() => { if (chip.parentNode) chip.parentNode.removeChild(chip); }, 200);
        }, 3200);
      } catch { /* DOM insert failed — the title fallback above still applies */ }
    },
  };
}

export const speechPlugin = createSpeechPlugin();
