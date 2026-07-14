import { injectStyleOnce } from '../../utils/inject-style.js';
/**
 * bookmark-styles.js — 17.5.7: the in-editor flag marker for named anchors.
 * CSS files are exempt from the 300-line source limit.
 */
const STYLE_ID = 'oe-bookmark-styles';

const CSS = `
.oe-editor a.oe-bookmark {
  display: inline-block;
  width: 14px;
  height: 14px;
  vertical-align: baseline;
  position: relative;
  cursor: pointer;
}
.oe-editor a.oe-bookmark::before {
  content: '\\2691'; /* flag */
  position: absolute;
  inset: 0;
  font-size: 12px;
  line-height: 1;
  color: var(--oe-primary);
  opacity: 0.85;
}
.oe-editor a.oe-bookmark:hover::before { opacity: 1; }
/* Print: markers are editor chrome, not content. */
@media print { .oe-editor a.oe-bookmark::before { content: ''; } }

.oe-bookmark-dialog__label { display: block; font-size: 12px; color: var(--oe-panel-fg-muted); }
.oe-bookmark-dialog__input {
  display: block; width: 100%; margin-top: 4px; padding: 7px 9px;
  border: 1px solid var(--oe-chrome-border-2); border-radius: var(--oe-radius-sm);
  background: var(--oe-input-bg); color: var(--oe-panel-fg); font: inherit;
}
.oe-bookmark-dialog__error { min-height: 16px; font-size: 11px; color: var(--oe-danger); margin-top: 4px; }
`;

export function injectBookmarkStyles(doc) {
  injectStyleOnce(doc, STYLE_ID, CSS);
}
