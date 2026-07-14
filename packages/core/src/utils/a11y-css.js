/**
 * a11y-css.js — accessibility @media rules (14.15 forced-colors, 14.16
 * reduced-motion) that target the editor CHROME (toolbar, menus, modals,
 * dropdown/color panels, bubble, tooltip).
 *
 * Why this is separate from BASE_CSS: in iframe mode BASE_CSS is injected into
 * the IFRAME document (where only the editable lives), but all chrome lives in
 * the HOST document. So chrome-targeting a11y rules injected via BASE_CSS were
 * dead in iframe mode (F1). This file is injected into the HOST document
 * unconditionally (iframe or not), so the chrome always gets these rules.
 *
 * Editable-only rules (`.oe-editor:focus-visible`, its forced-colors outline)
 * stay in BASE_CSS because they must follow the editable into whichever document
 * it renders in.
 */
export const A11Y_CHROME_CSS = `
  /* 14.16 — reduced-motion: kill editor-chrome transitions/animations. Scoped to
     the editor's own classes so it never touches host-page motion. Panel class
     names cover the body-appended dropdown/color panels too (.oe-tb__dd-panel,
     .oe-cp). */
  @media (prefers-reduced-motion: reduce) {
    .oe-wrapper *, .oe-toolbar *, .oe-bubble *, .oe-modal *, .oe-backdrop *,
    .oe-menu *, .oe-tooltip *, .oe-tb__dd-panel *, .oe-cp * {
      transition: none !important;
      animation: none !important;
      scroll-behavior: auto !important;
    }
  }

  /* 14.15 — Windows High Contrast / forced-colors: keep chrome edges visible when
     the UA strips custom colors. Correct class names: .oe-modal (not __dialog),
     .oe-cp / .oe-tb__color-panel for the color picker. */
  @media (forced-colors: active) {
    .oe-toolbar, .oe-bubble, .oe-menu, .oe-modal, .oe-backdrop,
    .oe-tb__dd-panel, .oe-cp, .oe-tb__color-panel {
      border: 1px solid CanvasText;
    }
    .oe-tb__btn:focus-visible, .oe-modal__btn:focus-visible {
      outline: 2px solid Highlight;
      outline-offset: 1px;
    }
    .oe-tb__btn--active { forced-color-adjust: none; background: Highlight; color: HighlightText; }
    /* Sibling "active/selected" pills use background alone in the normal theme
       (dropdown option, blockquote-style button, char-grid tab, find case-toggle)
       — forced-colors ignores background, so without this they'd be visually
       indistinguishable from an unselected sibling. */
    .oe-tb__dd-option--active, .oe-bq-toolbar__stylebtn--active,
    .oe-chargrid__tab--on, .oe-find__case--on {
      forced-color-adjust: none;
      background: Highlight;
      color: HighlightText;
    }
  }
`;
