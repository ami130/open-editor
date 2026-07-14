import { injectStyleOnce } from '../../utils/inject-style.js';
/**
 * link-styles.js — CSS for the Link plugin, injected once per document.
 *
 * Covers: the hover popover (Open / Edit / Unlink) and the dialog form fields.
 * Injected by link-plugin.js install() via injectLinkStyles(doc).
 * CSS file — exempt from the 300-line source limit.
 */

const STYLE_ID = 'oe-link-styles';

export const LINK_CSS = `
/* ── Hover popover ─────────────────────────────────────────────────────────── */
.oe-link-popover {
  position: absolute;
  z-index: 120;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px 6px;
  background: var(--oe-inverse-bg);
  color: var(--oe-inverse-fg);
  border-radius: 8px;
  box-shadow: 0 4px 14px rgba(0,0,0,0.24);
  font-size: 12px;
  line-height: 1;
  max-width: 320px;
  white-space: nowrap;
}
.oe-link-popover[hidden] { display: none; }
.oe-link-popover__url {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--oe-inverse-fg-dim);
  font-variant-numeric: tabular-nums;
  padding: 0 6px 0 4px;
  direction: ltr;
}
.oe-link-popover__sep {
  width: 1px;
  height: 18px;
  background: var(--oe-inverse-sep);
  margin: 0 2px;
  flex-shrink: 0;
}
.oe-link-popover__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--oe-inverse-fg);
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}
.oe-link-popover__btn:hover { background: var(--oe-inverse-hover); color: var(--oe-inverse-fg); }
.oe-link-popover__btn:focus-visible {
  outline: 2px solid var(--oe-inverse-focus);
  outline-offset: 1px;
}
.oe-link-popover__btn svg { width: 16px; height: 16px; display: block; }
.oe-link-popover__btn--unlink:hover { background: var(--oe-inverse-danger-bg); color: var(--oe-inverse-danger-fg); }

/* ── Dialog form ───────────────────────────────────────────────────────────── */
.oe-link-dialog {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}
.oe-link-dialog__options {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}
.oe-link-dialog__check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--oe-panel-fg);
  cursor: pointer;
  user-select: none;
}
.oe-link-dialog__checkbox {
  width: 15px;
  height: 15px;
  accent-color: var(--oe-primary);
  cursor: pointer;
}
.oe-link-dialog__error {
  font-size: 12px;
  color: var(--oe-danger);
  background: var(--oe-c-danger-100);
  border: 1px solid var(--oe-c-danger-200);
  border-radius: 6px;
  padding: 8px 10px;
}
.oe-link-dialog__error--hidden { display: none !important; }
`;

export function injectLinkStyles(doc) {
  injectStyleOnce(doc, STYLE_ID, LINK_CSS);
}
