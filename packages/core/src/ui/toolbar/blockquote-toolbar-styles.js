/**
 * Blockquote contextual toolbar + bubble/statusbar/fullscreen CSS.
 * Split out of toolbar-styles.js to keep it within the 300-line limit;
 * concatenated back onto TOOLBAR_CSS there.
 */

export const BLOCKQUOTE_TOOLBAR_CSS = `
  /* Blockquote contextual toolbar */
  .oe-bq-toolbar {
    position: absolute;
    display: none;
    flex-direction: column;
    gap: 0;
    padding: 6px 8px;
    background: var(--oe-inverse-bg);
    border-radius: 8px;
    box-shadow: 0 4px 18px rgba(0,0,0,0.32);
    z-index: var(--oe-z-bubble, 100);
    pointer-events: all;
    min-width: 0;
  }
  .oe-bq-toolbar:not([hidden]) {
    display: flex;
  }
  /* Row 1: style pills */
  .oe-bq-toolbar__stylerow {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--oe-inverse-sep);
    margin-bottom: 6px;
  }
  .oe-bq-toolbar__stylebtn {
    padding: 3px 9px;
    border: 1px solid var(--oe-inverse-sep);
    border-radius: 12px;
    background: transparent;
    color: var(--oe-inverse-fg-dim);
    font-size: 12px;
    cursor: pointer;
    white-space: nowrap;
    line-height: 1.4;
  }
  .oe-bq-toolbar__stylebtn:hover { background: var(--oe-inverse-hover); color: var(--oe-inverse-fg); border-color: var(--oe-inverse-active); }
  .oe-bq-toolbar__stylebtn--active { background: var(--oe-primary); color: var(--oe-inverse-fg); border-color: var(--oe-primary); }
  /* Row 2: color section */
  .oe-bq-toolbar__colorsection {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--oe-inverse-sep);
    margin-bottom: 6px;
  }
  .oe-bq-toolbar__label {
    font-size: 11px;
    color: var(--oe-inverse-fg-dim);
    white-space: nowrap;
    user-select: none;
  }
  .oe-bq-toolbar__swatches {
    display: flex;
    align-items: center;
    gap: 3px;
  }
  .oe-bq-toolbar__swatch {
    width: 18px;
    height: 18px;
    padding: 0;
    border: 2px solid transparent;
    border-radius: 3px;
    cursor: pointer;
    outline: none;
    flex-shrink: 0;
  }
  .oe-bq-toolbar__swatch:hover { border-color: var(--oe-inverse-fg); }
  .oe-bq-toolbar__swatch--active { border-color: var(--oe-inverse-fg); box-shadow: 0 0 0 1px rgba(255,255,255,0.5); }
  .oe-bq-toolbar__custom {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .oe-bq-toolbar__hex {
    width: 68px;
    padding: 2px 5px;
    border: 1px solid var(--oe-inverse-sep);
    border-radius: 3px;
    background: var(--oe-inverse-hover);
    color: var(--oe-inverse-fg);
    font-size: 12px;
    font-family: 'SF Mono', 'Fira Code', monospace;
  }
  .oe-bq-toolbar__hex::placeholder { color: var(--oe-inverse-fg-dim); }
  .oe-bq-toolbar__hex--invalid { border-color: var(--oe-danger); box-shadow: 0 0 0 1px #e5484d; }
  .oe-bq-toolbar__apply {
    padding: 2px 7px;
    border: 1px solid var(--oe-inverse-sep);
    border-radius: 3px;
    background: var(--oe-inverse-active);
    color: var(--oe-inverse-fg);
    font-size: 11px;
    cursor: pointer;
    white-space: nowrap;
  }
  .oe-bq-toolbar__apply:hover { background: var(--oe-inverse-hover); }
  /* Row 3: bottom row with remove button */
  .oe-bq-toolbar__sep { display: none; }
  .oe-bq-toolbar__bottomrow {
    display: flex;
    align-items: center;
    padding-top: 4px;
    border-top: 1px solid var(--oe-inverse-sep);
    margin-top: 2px;
  }
  .oe-bq-toolbar__remove {
    color: var(--oe-inverse-danger-fg) !important;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    padding: 3px 8px;
  }
  .oe-bq-toolbar__remove span { color: var(--oe-inverse-danger-fg); }
  .oe-bq-toolbar__remove:hover:not(:disabled) { background: var(--oe-inverse-danger-bg) !important; }
  .oe-wrapper--fullscreen {
    /* !important throughout: plugin stylesheets (e.g. resize-editor's
       .oe-wrapper position:relative rule) inject AFTER this rule, and at
       equal specificity a later same-specificity rule wins the cascade —
       silently canceling position:fixed and breaking fullscreen. */
    position: fixed !important;
    inset: 0 !important;
    z-index: var(--oe-z-fullscreen, 9999);
    background: var(--oe-bg);
    height: 100% !important;
    max-height: 100% !important;
  }
  .oe-statusbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 3px 10px;
    border-top: 1px solid var(--oe-chrome-border);
    background: var(--oe-bg-muted);
    font-size: 12px;
    color: var(--oe-chrome-fg);
    box-sizing: border-box;
  }
  .oe-bubble {
    position: absolute;
    display: inline-flex;
    gap: 2px;
    padding: 3px;
    background: var(--oe-inverse-bg);
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: var(--oe-z-bubble, 100);
  }
  .oe-bubble .oe-tb__btn { color: var(--oe-inverse-fg); }
  .oe-bubble .oe-tb__btn:hover:not(:disabled) { background: var(--oe-inverse-active); }
  .oe-bubble .oe-tb__btn--active { background: var(--oe-inverse-active); color: var(--oe-inverse-fg); border-color: transparent; }
  /* 14.10 — mobile tap targets meet the WCAG 2.5.5 / platform 44x44px minimum
     (were 36px). The toolbar itself scrolls horizontally (overflow-x on
     .oe-toolbar) so larger buttons don't force wrapping on small screens. */
  @media (max-width: 600px) {
    .oe-tb__btn { min-width: 44px; height: 44px; min-height: 44px; }
    .oe-toolbar { gap: 1px; padding: 3px 4px; overflow-x: auto; }
  }
  @media (max-width: 600px) {
    .oe-bubble .oe-tb__btn { min-width: 44px; height: 44px; min-height: 44px; }
  }
`;
