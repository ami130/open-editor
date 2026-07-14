/**
 * preview-plugin.js — Phase 13.11: preview the current content in a modal.
 *
 * Renders the editor's HTML as it would appear, inside a SANDBOXED iframe
 * (`sandbox=""` — no scripts, no same-origin, no forms). Two safety layers:
 *   1. the content comes from getHTML(), which sanitizes (unless the integrator
 *      set sanitize:false), and
 *   2. even then the sandboxed iframe cannot run scripts or reach the parent —
 *      so preview is safe regardless of config.
 *
 * Companion to the Source view (13.1): "see the rendered result" vs. "see/edit
 * the raw HTML".
 *
 * Implements { name, install, destroy, getToolbarButtons }.
 */
import { injectPreviewStyles } from './preview-styles.js';

const PREVIEW_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
  <circle cx="12" cy="12" r="3"/>
</svg>`;

export function createPreviewPlugin() {
  return {
    name: 'preview',
    _editor: null,

    install(editor) {
      this._editor = editor;
      const doc = (typeof document !== 'undefined') ? document : null;
      if (doc) injectPreviewStyles(doc);
    },

    destroy() { this._editor = null; },

    getToolbarButtons() {
      return [{
        name:    'preview',
        type:    'button',
        icon:    PREVIEW_ICON,
        tooltip: 'Preview',
        readOnlyExempt: true, // preview only reads content — safe in readonly
        onClick: () => this._open(),
      }];
    },

    _open() {
      const editor = this._editor;
      if (!editor || !editor.ui || !editor.ui.modal) return;
      const doc = editor._iframeDoc || document;
      const html = editor.getHTML ? editor.getHTML() : '';

      // Build a sandboxed iframe body node (Node body → no innerHTML sink on the
      // modal; content goes into the sandboxed frame via srcdoc).
      const frame = doc.createElement('iframe');
      frame.className = 'oe-preview__frame';
      frame.setAttribute('sandbox', '');          // no scripts / no same-origin
      frame.setAttribute('title', 'Content preview');
      // srcdoc renders the (already-sanitized) HTML in isolation.
      frame.setAttribute('srcdoc',
        `<!doctype html><meta charset="utf-8"><body style="font:14px/1.5 system-ui,sans-serif;margin:12px;">${html || '<p style="color:#94a3b8">(empty)</p>'}</body>`);

      editor.ui.modal.open({
        title: 'Preview',
        body: frame,
      });
      editor.emit('afterCommand', { command: 'preview', args: [] });
    },
  };
}

export const previewPlugin = createPreviewPlugin();
