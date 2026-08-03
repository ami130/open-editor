/**
 * export-docx-plugin.js — raw plugin spec (module-private; wrapped by the
 * gated factory in index.js). Adds a toolbar button + `exportDocx()` that
 * serializes the editor content to a real .docx (OOXML in a zero-dep ZIP) and
 * triggers a browser download.
 */
import { bodyXml } from './ooxml-body.js';
import { buildDocx } from './docx-parts.js';
import { createResourceCollector } from './docx-resources.js';
import { resolveRemoteImages } from './image-fetch.js';

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

  /**
   * Build the .docx bytes for the current content. ASYNC: remote (http/https)
   * images must be fetched before the (synchronous) OOXML walk can embed them
   * — see image-fetch.js for why this is a pre-pass rather than an inline
   * await. data: URI images and everything else stay unaffected either way.
   */
  async function buildBytes(override) {
    const opts = resolveOptions(override);
    const title = opts.title || (editor._config && editor._config.documentTitle) || 'Document';
    const doc = editor._iframeDoc || (typeof document !== 'undefined' ? document : null);
    if (!doc) return null;
    const html = editor.getHTML ? editor.getHTML() : '';
    const tmp = doc.createElement('div');
    tmp.innerHTML = html;
    // Fetch every remote <img> concurrently BEFORE walking (fails soft per
    // image — a blocked/broken fetch degrades that one image to a placeholder,
    // never aborts the export).
    const resolvedImages = await resolveRemoteImages(tmp);
    // Count remote images that couldn't be fetched (CORS/404/timeout) — they
    // degrade to a placeholder in the docx, so we surface that to the user.
    let droppedImages = 0;
    resolvedImages.forEach((v) => { if (v == null) droppedImages += 1; });
    // A collector gathers hyperlink + embedded-image relationships during the
    // walk; buildDocx turns them into rels + media parts + content-types.
    const collector = createResourceCollector();
    const body = bodyXml(html, doc, collector, resolvedImages);
    return { bytes: buildDocx(body, { title, resources: collector.result() }), title, droppedImages };
  }

  /** Safe access to the shared toast surface (absent on very old editors). */
  function toast() { return editor && editor.ui && editor.ui.toast; }

  async function exportDocx(override) {
    if (!editor || editor._destroyed || typeof document === 'undefined') return false;
    // Sticky progress toast the whole time — a Word export can fetch remote
    // images (seconds), and previously the UI looked frozen with no feedback.
    const t = toast();
    const progress = t ? t.progress('Preparing your Word document…') : null;
    // Guard the ENTIRE flow (build + fetch + download). Previously buildBytes ran
    // OUTSIDE the try/catch, so a fetch/serialize error became an unhandled
    // rejection with no user feedback.
    try {
      const built = await buildBytes(override);
      if (!built) {
        if (progress) progress.error('Couldn’t prepare the document.');
        else editor.emit('exportDocxFailed', { reason: 'build-failed' });
        return false;
      }
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
      // Success — but if some images couldn't be fetched (CORS/404), say so
      // rather than letting them vanish silently.
      if (progress) {
        if (built.droppedImages > 0) {
          const n = built.droppedImages;
          progress.error(`Exported — but ${n} image${n > 1 ? 's' : ''} couldn’t be included (blocked by the image host).`);
        } else {
          progress.success('Word document downloaded.');
        }
      }
      return true;
    } catch (err) {
      editor.emit('exportDocxFailed', { reason: 'export-failed', error: err && err.message });
      if (progress) progress.error('Word export failed. Please try again.');
      return false;
    }
  }

  return {
    name: 'export-docx',
    install(ed) {
      editor = ed;
      ed.exportDocx = exportDocx;
      // Expose the byte builder too (useful for server-side / tests). ASYNC
      // now — remote images are fetched before the bytes are ready.
      ed.buildDocxBytes = async (o) => { const b = await buildBytes(o); return b ? b.bytes : null; };
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
