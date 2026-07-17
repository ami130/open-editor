/**
 * export-docx-plugin.js — raw plugin spec (module-private; wrapped by the
 * gated factory in index.js). Adds a toolbar button + `exportDocx()` that
 * serializes the editor content to a real .docx (OOXML in a zero-dep ZIP) and
 * triggers a browser download.
 */
import { bodyXml } from './ooxml-body.js';
import { buildDocx } from './docx-parts.js';
import { createResourceCollector } from './docx-resources.js';

const DOCX_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
  <path d="M14 2v6h6"/>
  <path d="M8 13h1.5l1 3 1-3H13M15.5 13H17"/>
</svg>`;

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Sanitize a title into a safe filename base. */
function fileBase(title) {
  const base = String(title || 'document').replace(/[\\/:*?"<>|]+/g, '_').trim().replace(/\s+/g, '-');
  return base || 'document';
}

export function rawExportDocxSpec(config = {}) {
  let editor = null;

  function resolveOptions(override) {
    const base = (editor && editor._config && editor._config.exportDocx) || {};
    return { ...config, ...base, ...(override || {}) };
  }

  /** Build the .docx bytes for the current content (pure-ish: no download). */
  function buildBytes(override) {
    const opts = resolveOptions(override);
    const title = opts.title || (editor._config && editor._config.documentTitle) || 'Document';
    const doc = editor._iframeDoc || (typeof document !== 'undefined' ? document : null);
    if (!doc) return null;
    const html = editor.getHTML ? editor.getHTML() : '';
    // A collector gathers hyperlink + embedded-image relationships during the
    // walk; buildDocx turns them into rels + media parts + content-types.
    const collector = createResourceCollector();
    const body = bodyXml(html, doc, collector);
    return { bytes: buildDocx(body, { title, resources: collector.result() }), title };
  }

  function exportDocx(override) {
    if (!editor || editor._destroyed || typeof document === 'undefined') return false;
    const built = buildBytes(override);
    if (!built) return false;
    try {
      const blob = new Blob([built.bytes], { type: DOCX_MIME });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fileBase(built.title)}.docx`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Revoke on the next tick so the click's navigation has consumed the URL.
      setTimeout(() => URL.revokeObjectURL(url), 0);
      editor.emit('afterCommand', { command: 'exportDocx', args: [] });
      return true;
    } catch {
      editor.emit('exportDocxFailed', { reason: 'download-failed' });
      return false;
    }
  }

  return {
    name: 'export-docx',
    install(ed) {
      editor = ed;
      ed.exportDocx = exportDocx;
      // Expose the pure byte builder too (useful for server-side / tests).
      ed.buildDocxBytes = (o) => { const b = buildBytes(o); return b ? b.bytes : null; };
    },
    destroy() {
      if (editor) {
        if (editor.exportDocx === exportDocx) delete editor.exportDocx;
        delete editor.buildDocxBytes;
      }
      editor = null;
    },
    getToolbarButtons() {
      return [{
        name: 'exportDocx',
        type: 'button',
        icon: DOCX_ICON,
        tooltip: 'Export to Word (.docx)',
        readOnlyExempt: true,
        onClick: () => exportDocx(),
      }];
    },
  };
}

export { fileBase };
