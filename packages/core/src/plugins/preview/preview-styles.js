import { injectStyleOnce } from '../../utils/inject-style.js';
/**
 * preview-styles.js — CSS for the Preview iframe (13.11). CSS files are exempt
 * from the 300-line source limit.
 */
const STYLE_ID = 'oe-preview-styles';

const CSS = `
.oe-preview__frame {
  width: 100%;
  min-width: 320px;
  height: 420px;
  max-height: 70vh;
  border: 1px solid var(--oe-panel-border);
  border-radius: 8px;
  background: var(--oe-bg);
}
`;

export function injectPreviewStyles(doc) {
  injectStyleOnce(doc, STYLE_ID, CSS);
}
