import { injectStyleOnce } from '../utils/inject-style.js';

const STYLE_ID = 'oe-caret-popup-styles';

// Shared visual language with toolbar-dropdown/panels (Phase 16.6): radius-lg,
// soft layered shadow, token-only colors. Fixed-position so it floats over the
// editable at the live caret rect (see caret-popup.js positionAt()).
export const CARET_POPUP_CSS = `
.oe-caret-popup {
  min-width: 220px;
  max-width: 320px;
  max-height: 260px;
  overflow-y: auto;
  padding: 5px;
  background: var(--oe-bg);
  border: 1px solid var(--oe-chrome-border-2);
  border-radius: var(--oe-radius-lg);
  box-shadow: var(--oe-shadow-md);
  z-index: 99999;
  font-size: 13px;
}
.oe-caret-popup__option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: var(--oe-radius-sm);
  color: var(--oe-chrome-fg);
  cursor: pointer;
  /* 17.10 — options are real <button>s (keyboard-reachable scroll region);
     neutralize UA button chrome so they render as list rows. */
  background: none;
  border: 0;
  width: 100%;
  text-align: start;
  font: inherit;
}
.oe-caret-popup__option:focus-visible {
  outline: 2px solid var(--oe-primary);
  outline-offset: -2px;
}
.oe-caret-popup__option:hover,
.oe-caret-popup__option--active {
  background: var(--oe-chrome-hover);
  color: var(--oe-fg);
}
.oe-caret-popup__empty {
  padding: 8px 10px;
  /* 17.10 — was --oe-panel-fg-faint, which failed WCAG AA contrast (axe:
     color-contrast, serious) against the popup background. */
  color: var(--oe-panel-fg-muted);
}
`;

export function injectCaretPopupStyles(doc) {
  injectStyleOnce(doc, STYLE_ID, CARET_POPUP_CSS);
}
