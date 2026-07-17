/**
 * @openeditor-premium/export-pdf — Phase 19.5 (PDF half).
 *
 * Premium: styled, page-configured PDF via the browser's native print-to-PDF
 * (zero rendering dependencies). Gated on the 'export.pdf' feature id.
 *
 *   const host = await createPremiumHost({ license, keys });
 *   editor.plugins.install(createExportPdfPlugin(host, { pageSize: 'Letter' }));
 *
 * Config (install-time, overridable per exportPdf() call, and via
 * editor._config.exportPdf): title, pageSize, orientation, margin, header,
 * footer, pageNumbers, fontFamily — see print-document.js normalizeOptions.
 */
import { gatePremiumPlugin } from '@openeditor-premium/runtime';
import { rawExportPdfSpec } from './export-pdf-plugin.js';

/** The registered feature id this package requires. */
export const FEATURE_ID = 'export.pdf';

/**
 * @param {object} host   a resolved createPremiumHost() result
 * @param {object} [config] default export options (see module doc)
 * @returns {object} installable plugin spec (active or graceful-degrade stub)
 */
export function createExportPdfPlugin(host, config = {}) {
  return gatePremiumPlugin(host, FEATURE_ID, rawExportPdfSpec(config));
}

export { buildPrintDocument, normalizeOptions, escapeHtml } from './print-document.js';
