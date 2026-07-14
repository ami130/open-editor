import { BLOCKQUOTE_TOOLBAR_CSS } from './blockquote-toolbar-styles.js';
import { COLOR_PICKER_CSS } from './color-picker-styles.js';

export const TOOLBAR_CSS = `
  .oe-toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 1px;
    padding: 6px 8px;
    border-bottom: 1px solid var(--oe-chrome-border);
    background: var(--oe-bg-muted);
    box-sizing: border-box;
    position: sticky;
    top: 0;
    z-index: var(--oe-z-toolbar, 10);
    overflow-x: auto;
  }
  .oe-toolbar__sep {
    width: 1px;
    align-self: center;
    height: 20px;
    margin: 0 6px;
    background: var(--oe-sep);
  }
  /* 2.3 — read-only editor dims and disables the whole toolbar. */
  .oe-toolbar--disabled {
    opacity: 0.5;
    pointer-events: none;
  }
  .oe-tb__btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 30px;
    height: 30px;
    padding: 0 7px;
    border: 1px solid transparent;
    border-radius: var(--oe-radius);
    background: transparent;
    color: var(--oe-chrome-fg);
    cursor: pointer;
    line-height: 0;
    position: relative;
    transition: background 0.12s ease, color 0.12s ease, box-shadow 0.12s ease;
  }
  .oe-tb__btn svg { width: 18px; height: 18px; display: block; }
  .oe-tb__btn:hover:not(:disabled):not(.oe-tb__btn--active) {
    background: var(--oe-chrome-hover);
    color: var(--oe-fg);
  }
  .oe-tb__btn:focus-visible {
    outline: 2px solid var(--oe-focus-ring);
    outline-offset: 1px;
    border-radius: var(--oe-radius);
  }
  /* Pill active state — soft accent tint, accent text, no hard border. */
  .oe-tb__btn--active {
    background: var(--oe-active-bg);
    border-color: transparent;
    color: var(--oe-primary);
  }
  .oe-tb__btn--active:hover:not(:disabled) { background: var(--oe-active-bg); }
  .oe-tb__btn:disabled, .oe-tb__btn--disabled { opacity: 0.35; cursor: not-allowed; }
  .oe-tb__dd { position: relative; display: inline-flex; }
  .oe-tb__dd-trigger { gap: 5px; min-width: 64px; }
  .oe-tb__dd-label { font-size: 13px; line-height: 1; }
  .oe-tb__dd-panel {
    min-width: 150px;
    padding: 5px;
    background: var(--oe-bg);
    border: 1px solid var(--oe-chrome-border-2);
    border-radius: var(--oe-radius-lg);
    box-shadow: var(--oe-shadow-md);
    z-index: 99999;
  }
  .oe-tb__dd-option {
    display: block;
    width: 100%;
    padding: 7px 11px;
    border: 0;
    border-radius: var(--oe-radius-sm);
    background: transparent;
    text-align: left;
    font-size: 13px;
    color: var(--oe-chrome-fg);
    cursor: pointer;
    transition: background 0.1s ease, color 0.1s ease;
  }
  .oe-tb__dd-option:hover { background: var(--oe-chrome-hover); color: var(--oe-fg); }
  .oe-tb__dd-option:focus-visible { background: var(--oe-chrome-hover); color: var(--oe-fg); outline: 2px solid var(--oe-focus-ring); outline-offset: -2px; }
  /* Custom-value input row (fontSize / lineHeight dropdowns) */
  .oe-tb__dd-custom {
    display: flex;
    gap: 4px;
    margin-top: 4px;
    padding: 6px 6px 2px;
    border-top: 1px solid var(--oe-chrome-divider-2);
  }
  .oe-tb__dd-custom-input {
    flex: 1 1 auto;
    min-width: 0;
    padding: 4px 6px;
    border: 1px solid var(--oe-chrome-border-3);
    border-radius: 3px;
    font-size: 13px;
  }
  .oe-tb__dd-custom-input:focus-visible { outline: 2px solid var(--oe-focus-ring); outline-offset: 0; border-color: var(--oe-focus-ring); }
  .oe-tb__dd-custom-apply {
    flex: 0 0 auto;
    padding: 4px 10px;
    border: 1px solid var(--oe-chrome-border-3);
    border-radius: 3px;
    background: var(--oe-input-bg);
    font-size: 12px;
    cursor: pointer;
  }
  .oe-tb__dd-custom-apply:hover { background: var(--oe-chrome-hover); }
  /* List-style split button */
  .oe-tb__listsplit { display: inline-flex; align-items: stretch; }
  .oe-tb__listsplit-main { border-top-right-radius: 0; border-bottom-right-radius: 0; }
  .oe-tb__listsplit-arrow {
    min-width: 14px;
    padding: 0 2px;
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
    border-left: 1px solid var(--oe-chrome-divider);
  }
  .oe-tb__listsplit-arrow svg { width: 10px; height: 10px; }
  .oe-tb__listsplit-panel { min-width: 130px; }
  /* Alignment split button */
  .oe-tb__alignsplit { display: inline-flex; align-items: stretch; }
  .oe-tb__alignsplit-main { border-top-right-radius: 0; border-bottom-right-radius: 0; }
  .oe-tb__alignsplit-arrow {
    min-width: 14px;
    padding: 0 2px;
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
    border-left: 1px solid var(--oe-chrome-divider);
  }
  .oe-tb__alignsplit-arrow svg { width: 10px; height: 10px; }
  .oe-tb__alignsplit-panel { min-width: 150px; }
  .oe-tb__alignsplit-opt { display: flex; align-items: center; gap: 8px; }
  .oe-tb__alignsplit-opt-icon { display: inline-flex; flex-shrink: 0; }
  .oe-tb__dd-option--active { background: var(--oe-active-bg); color: var(--oe-link); }

  /* 14.11 — RTL: mirror the toolbar button order and the split-button chevron
     border/rounding so the chrome reads right-to-left with the content. Driven
     by dir="rtl" on the wrapper (set in _applyConfig / setDirection). */
  [dir="rtl"] .oe-toolbar { flex-direction: row-reverse; }
  [dir="rtl"] .oe-tb__alignsplit-arrow,
  [dir="rtl"] .oe-tb__listsplit-arrow {
    border-left: none;
    border-right: 1px solid var(--oe-chrome-divider);
    border-top-left-radius: 3px;
    border-bottom-left-radius: 3px;
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
  }
` + COLOR_PICKER_CSS + BLOCKQUOTE_TOOLBAR_CSS;
