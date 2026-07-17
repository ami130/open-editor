/**
 * export-pdf-plugin.js — the raw plugin spec (module-private; wrapped by the
 * gated factory in index.js). Adds a toolbar button and an `exportPdf()`
 * action that builds a styled print document (print-document.js) and hands it
 * to the browser's native print-to-PDF.
 *
 * Distinct from the FREE `editor.print()` (editor-view.js): that dumps raw
 * unstyled getHTML() to a blank popup. This produces a designed document —
 * page setup, typography, running header/footer — which is the premium value.
 */
import { buildPrintDocument } from './print-document.js';

const PDF_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
  <path d="M14 2v6h6"/>
  <path d="M9 15h6M9 18h4"/>
</svg>`;

export function rawExportPdfSpec(config = {}) {
  let editor = null;

  /** Merge install-time config with per-call overrides. */
  function resolveOptions(override) {
    const base = (editor && editor._config && editor._config.exportPdf) || {};
    return { ...config, ...base, ...(override || {}) };
  }

  function exportPdf(override) {
    if (!editor || editor._destroyed || typeof window === 'undefined') return false;
    const opts = resolveOptions(override);
    const title = opts.title || (editor._config && editor._config.documentTitle) || 'Document';
    const html = editor.getHTML ? editor.getHTML() : '';
    const doc = buildPrintDocument(html, { ...opts, title });

    // Same mechanism as the free print(): a blank popup we fully own, so no
    // editor CSS leaks in and the print stylesheet is authoritative. Fail
    // gracefully on popup-block / CSP-blocked write (mirrors editor-view.js).
    const win = window.open('', '_blank', 'width=820,height=640');
    if (!win) {
      editor.emit('exportPdfBlocked', { reason: 'popup-blocked' });
      return false;
    }
    try {
      win.document.write(doc);
      win.document.close();
      win.focus();
      // Give the popup a tick to lay out (images/fonts) before printing.
      const trigger = () => { try { win.print(); } catch { /* ignore */ } };
      if (typeof win.requestAnimationFrame === 'function') {
        win.requestAnimationFrame(() => win.requestAnimationFrame(trigger));
      } else {
        trigger();
      }
      editor.emit('afterCommand', { command: 'exportPdf', args: [] });
      return true;
    } catch {
      editor.emit('exportPdfBlocked', { reason: 'write-blocked' });
      return false;
    }
  }

  return {
    name: 'export-pdf',
    install(ed) {
      editor = ed;
      // Expose an imperative API alongside the toolbar button.
      ed.exportPdf = exportPdf;
    },
    destroy() {
      if (editor && editor.exportPdf === exportPdf) delete editor.exportPdf;
      editor = null;
    },
    getToolbarButtons() {
      return [{
        name: 'exportPdf',
        type: 'button',
        icon: PDF_ICON,
        tooltip: 'Export to PDF',
        readOnlyExempt: true, // read-only export: safe when the editor is locked
        onClick: () => exportPdf(),
      }];
    },
  };
}
