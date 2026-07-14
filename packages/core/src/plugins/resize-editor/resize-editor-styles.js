import { injectStyleOnce } from '../../utils/inject-style.js';
/**
 * resize-editor-styles.js — CSS for the editor resize grip (13.8).
 * CSS files are exempt from the 300-line source limit.
 */
const STYLE_ID = 'oe-resize-editor-styles';

const CSS = `
.oe-wrapper { position: relative; }
.oe-resize-grip {
  position: absolute;
  right: 2px;
  bottom: 2px;
  width: 14px;
  height: 14px;
  cursor: ns-resize;
  z-index: 5;
  /* diagonal grip lines */
  background:
    linear-gradient(135deg, transparent 0 40%, var(--oe-panel-fg-faint) 40% 50%, transparent 50% 65%, var(--oe-panel-fg-faint) 65% 75%, transparent 75%);
  opacity: 0.7;
}
.oe-resize-grip:hover { opacity: 1; }
.oe-wrapper--fullscreen .oe-resize-grip { display: none; }
`;

export function injectResizeStyles(doc) {
  injectStyleOnce(doc, STYLE_ID, CSS);
}
