/**
 * format-painter-plugin.js — Phase 13.9: copy the inline formatting at the
 * caret and paint it onto the next selection (Word / CKEditor parity).
 *
 * State machine:
 *   idle → (click button) → captures the format at the caret, becomes ARMED
 *   ARMED + user selects text (mouseup with a non-collapsed range) → applies
 *          the captured format to that selection
 *   single-use mode (default): disarms after one application
 *   sticky mode (config `formatPainterSticky: true`): stays armed (paint
 *          repeatedly) until the button is clicked again or Escape is pressed
 *
 * A second click while armed DISARMS (toggle). isActive reflects the armed
 * state so the toolbar button shows it. Mode is chosen by config rather than a
 * Shift-click gesture, because the shared toolbar button handler does not
 * forward the DOM event to onClick (keeping toolbar code untouched).
 *
 * Implements { name, install, destroy, getToolbarButtons, onKeyDown }.
 */
import { captureFormat, applyFormat, hasFormat } from './format-capture.js';

const PAINT_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M19 3H5a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2Z"/>
  <path d="M12 10v4"/>
  <rect x="9" y="14" width="6" height="7" rx="1"/>
</svg>`;

export function createFormatPainterPlugin() {
  return {
    name: 'formatPainter',
    _editor: null,
    _armed: false,
    _sticky: false,
    _captured: null,
    _onMouseUp: null,

    install(editor) {
      this._editor = editor;
      this._onMouseUp = () => this._maybeApply();
      editor.on('mouseup', this._onMouseUp); // auto-cleaned by PluginManager
    },

    destroy() {
      this._editor = null;
      this._armed = false;
      this._captured = null;
      this._onMouseUp = null;
    },

    getToolbarButtons() {
      return [{
        name:    'formatPainter',
        type:    'button',
        icon:    PAINT_ICON,
        tooltip: 'Format painter',
        onClick: () => this._onClick(),
        isActive: () => this._armed,
      }];
    },

    onKeyDown(e) {
      // Escape disarms an active painter.
      if (this._armed && e.key === 'Escape') { this._disarm(); return true; }
      return false;
    },

    // Button click: toggle arm. Fresh arm captures the current caret's format.
    _onClick() {
      if (this._armed) { this._disarm(); return; }
      const captured = captureFormat(this._editor);
      if (!hasFormat(captured)) return; // nothing to paint — stay idle
      this._captured = captured;
      this._sticky = !!(this._editor._config && this._editor._config.formatPainterSticky);
      this._armed = true;
      this._syncButton();
    },

    // On the next selection (mouseup) apply the captured format to it.
    _maybeApply() {
      if (!this._armed || !this._editor) return;
      const info = this._editor.selection && this._editor.selection.get();
      if (!info || info.collapsed) return; // need a real selection to paint onto
      const sticky = this._sticky;
      try {
        this._editor.history && this._editor.history.takeSnapshot();
        const n = applyFormat(this._editor, this._captured);
        if (n > 0) {
          this._editor.emit('afterCommand', { command: 'formatPainter', args: [] });
          if (this._editor._onChangeFn) this._editor._onChangeFn();
        }
      } finally {
        // Always disarm on single-use, even if apply threw — never leave the
        // painter stuck armed with a stale capture (MEDIUM audit finding).
        if (!sticky) this._disarm();
      }
    },

    _disarm() {
      this._armed = false;
      this._sticky = false;
      this._captured = null;
      this._syncButton();
    },

    _syncButton() {
      // The toolbar re-runs isActive on 'afterCommand'; emit a lightweight one
      // (public API) so the button reflects the armed state without reaching
      // into toolbar internals.
      if (this._editor) this._editor.emit('afterCommand', { command: 'formatPainterState', args: [this._armed] });
    },
  };
}

export const formatPainterPlugin = createFormatPainterPlugin();
