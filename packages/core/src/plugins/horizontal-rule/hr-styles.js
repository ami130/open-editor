import { injectStyleOnce } from '../../utils/inject-style.js';
/**
 * hr-styles.js — CSS for the horizontal-rule select + restyle popover. CSS
 * files are exempt from the 300-line source limit. Injected into the editor's
 * document (iframe-aware) once per document.
 */
const STYLE_ID = 'oe-hr-styles';

const CSS = `
.oe-editor hr.oe-hr--selected {
  outline: 2px solid var(--oe-primary, #3b82f6);
  outline-offset: 3px;
  border-radius: 1px;
}
.oe-hr-popover {
  position: absolute;
  z-index: 40;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  background: var(--oe-panel-bg, #fff);
  color: var(--oe-panel-fg, #111);
  border: 1px solid var(--oe-chrome-border, #e5e7eb);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0,0,0,.18);
  font-size: 12px;
}
.oe-hr-popover__row {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}
.oe-hr-popover__label {
  min-width: 46px;
  font-weight: 600;
  color: var(--oe-panel-fg, #111);
}
/* The shared color-picker panel rendered INLINE inside the popover (it normally
   floats as a fixed popup; here it sits in the row, so neutralize that). */
.oe-hr-popover__picker {
  position: static !important;
  z-index: auto !important;
  box-shadow: none;
  border: 0;
  padding: 0;
}
.oe-hr-popover__num {
  width: 52px;
  padding: 2px 4px;
  border: 1px solid var(--oe-chrome-border, #e5e7eb);
  border-radius: 6px;
  font-size: 12px;
  background: var(--oe-panel-bg, #fff);
  color: var(--oe-panel-fg, #111);
}
.oe-hr-popover__unit { color: var(--oe-panel-fg-faint, #6b7280); font-size: 11px; }
.oe-hr-popover__opt--on {
  background: var(--oe-primary, #3b82f6);
  color: #fff;
  border-color: var(--oe-primary, #3b82f6);
}
.oe-hr-popover__swatch {
  width: 18px; height: 18px;
  border: 1px solid rgba(0,0,0,.2);
  border-radius: 4px;
  padding: 0;
  cursor: pointer;
}
.oe-hr-popover__swatch:focus-visible {
  outline: 2px solid var(--oe-focus-ring, #3b82f6);
  outline-offset: 1px;
}
.oe-hr-popover__custom {
  width: 22px; height: 22px;
  padding: 0;
  border: 1px solid var(--oe-chrome-border, #e5e7eb);
  border-radius: 4px;
  cursor: pointer;
  background: none;
}
.oe-hr-popover__opt {
  padding: 3px 8px;
  border: 1px solid var(--oe-chrome-border, #e5e7eb);
  border-radius: 6px;
  background: var(--oe-panel-bg, #fff);
  color: var(--oe-panel-fg, #111);
  cursor: pointer;
  font-size: 12px;
}
.oe-hr-popover__opt:hover { background: var(--oe-chrome-hover, #f3f4f6); }
.oe-hr-popover__opt:focus-visible {
  outline: 2px solid var(--oe-focus-ring, #3b82f6);
  outline-offset: 1px;
}
`;

/** Inject the HR-popover CSS into the editor's document (iframe-aware). */
export function injectHrStyles(editor) {
  const doc = (editor && editor._iframeDoc)
    || (editor && editor.getContainer && editor.getContainer() && editor.getContainer().ownerDocument)
    || document;
  injectStyleOnce(doc, STYLE_ID, CSS);
}
