import { THEME_TOKENS_LIGHT, THEME_TOKENS_DARK, THEME_TOKENS_MINIMAL } from './theme-css.js';

export const BASE_CSS = `
  /* Phase 15 — token defaults so the editable inherits them in iframe mode too
     (where this stylesheet is injected into the iframe document). In non-iframe
     mode the host :root/.oe-wrapper block also defines them; identical values.
     Theme overrides key off data-oe-theme on the editable itself, which
     setTheme() propagates into the iframe (the host wrapper's attribute cannot
     cross the iframe document boundary). */
  :root, .oe-editor { ${THEME_TOKENS_LIGHT} }
  .oe-editor[data-oe-theme="dark"] { ${THEME_TOKENS_DARK} }
  .oe-editor[data-oe-theme="minimal"] { ${THEME_TOKENS_MINIMAL} }
  @media (prefers-color-scheme: dark) {
    .oe-editor[data-oe-theme="auto"] { ${THEME_TOKENS_DARK} }
  }
  .oe-editor {
    outline: none;
    min-height: inherit;
    max-height: inherit;
    height: inherit;
    overflow-y: auto;
    overflow-wrap: break-word;
    word-break: break-word;
    padding: 12px 16px;
    box-sizing: border-box;
    cursor: text;
    -webkit-user-select: text;
    user-select: text;
    /* 14.9 — allow both-axis panning AND pinch-zoom (WCAG 1.4.4 Resize / 1.4.10
       Reflow require that user zoom is NOT blocked; wide tables/<pre> also need
       horizontal pan). We intentionally do NOT set 'manipulation' or 'pan-y'
       alone, which would suppress pinch-zoom. */
    touch-action: pan-x pan-y pinch-zoom;
  }
  .oe-editor[data-placeholder].oe-empty::before {
    content: attr(data-placeholder);
    color: var(--oe-content-placeholder);
    pointer-events: none;
    display: block;
  }
  /* 14.3 — the editable had outline:none with NO replacement, so keyboard
     users got no visible focus indicator. Use a soft inset ring (keyboard-only
     via :focus-visible) that doesn't shift layout. */
  .oe-editor:focus { outline: none; }
  .oe-editor:focus-visible {
    outline: none;
    box-shadow: inset 0 0 0 2px var(--oe-focus-ring);
    border-radius: 2px;
  }
  .oe-wrapper {
    position: relative;
    box-sizing: border-box;
  }
  .oe-wrapper.oe-disabled .oe-editor {
    opacity: 0.5;
    cursor: not-allowed;
    user-select: none;
    -webkit-user-select: none;
  }
  /* 15.8 — READ-ONLY is DISTINCT from disabled: the content stays fully legible
     (no 0.5 dim), text is selectable (so users can read/copy), and the cursor is
     the neutral default rather than the "blocked" not-allowed. A faint tint marks
     it non-editable. The toolbar keeps its muted/inert treatment. */
  .oe-wrapper.oe-readonly.oe-disabled .oe-editor {
    opacity: 1;
    cursor: default;
    user-select: text;
    -webkit-user-select: text;
    background: var(--oe-bg-muted);
  }

  /* ── Content-area element styles (survive global CSS resets) ── */

  /* ── Blockquote base (left-border, default) ── */
  /* --bq-accent controls the accent color and is set by the toolbar color picker */
  .oe-editor blockquote,
  .oe-editor blockquote[data-bq-style="border"] {
    --bq-accent: var(--oe-bq-border);
    border-left: 4px solid var(--bq-accent);
    border-right: none;
    border-top: none;
    border-bottom: none;
    background: transparent;
    border-radius: 0;
    margin: 8px 0;
    padding: 4px 0 4px 16px;
    color: var(--oe-editor-fg-soft);
    font-style: italic;
    font-size: inherit;
    text-align: left;
  }

  /* ── Card / filled ── */
  .oe-editor blockquote[data-bq-style="card"] {
    --bq-accent: var(--oe-chrome-border);
    border: none;
    border-left: 4px solid var(--bq-accent);
    background: color-mix(in srgb, var(--bq-accent) 12%, var(--oe-bg));
    border-radius: 6px;
    margin: 8px 0;
    padding: 14px 14px 14px 18px;
    color: var(--oe-editor-fg);
    font-style: normal;
    font-size: inherit;
  }

  /* ── Pull quote ── */
  .oe-editor blockquote[data-bq-style="pull"] {
    --bq-accent: var(--oe-editor-fg);
    border: none;
    border-top: 2px solid var(--bq-accent);
    border-bottom: 2px solid var(--bq-accent);
    background: transparent;
    border-radius: 0;
    margin: 16px 24px;
    padding: 12px 0;
    color: var(--oe-editor-fg-strong);
    font-style: italic;
    font-size: 1.25em;
    font-weight: 500;
    text-align: center;
    line-height: 1.5;
  }

  /* ── Callout base ── */
  .oe-editor blockquote[data-bq-style^="callout-"] {
    border-radius: 6px;
    margin: 8px 0;
    padding: 12px 16px 12px 46px;
    font-style: normal;
    position: relative;
    border-left: 4px solid var(--bq-accent);
    background: color-mix(in srgb, var(--bq-accent) 10%, var(--oe-bg));
  }
  .oe-editor blockquote[data-bq-style^="callout-"]::before {
    position: absolute;
    left: 14px;
    top: 12px;
    font-size: 1.1em;
    line-height: 1;
  }

  /* Info */
  .oe-editor blockquote[data-bq-style="callout-info"]    { --bq-accent: var(--oe-c-info); color: var(--oe-callout-info-fg); }
  .oe-editor blockquote[data-bq-style="callout-info"]::before    { content: "💡"; }

  /* Warning */
  .oe-editor blockquote[data-bq-style="callout-warning"] { --bq-accent: var(--oe-c-warning); color: var(--oe-callout-warn-fg); }
  .oe-editor blockquote[data-bq-style="callout-warning"]::before { content: "⚠️"; }

  /* Success */
  .oe-editor blockquote[data-bq-style="callout-success"] { --bq-accent: var(--oe-c-success); color: var(--oe-callout-success-fg); }
  .oe-editor blockquote[data-bq-style="callout-success"]::before { content: "✅"; }

  /* Danger */
  .oe-editor blockquote[data-bq-style="callout-danger"]  { --bq-accent: var(--oe-c-danger-accent); color: var(--oe-callout-danger-fg); }
  .oe-editor blockquote[data-bq-style="callout-danger"]::before  { content: "❌"; }

  /* Paragraphs and headings inside editor */
  .oe-editor p     { margin: 0 0 4px; }
  .oe-editor h1    { font-size: 2em;    font-weight: 700; margin: 12px 0 6px; }
  .oe-editor h2    { font-size: 1.5em;  font-weight: 700; margin: 10px 0 5px; }
  .oe-editor h3    { font-size: 1.25em; font-weight: 600; margin: 8px 0 4px; }
  .oe-editor h4    { font-size: 1.1em;  font-weight: 600; margin: 6px 0 3px; }
  .oe-editor h5    { font-size: 1em;    font-weight: 600; margin: 5px 0 2px; }
  .oe-editor h6    { font-size: 0.9em;  font-weight: 600; margin: 4px 0 2px; color: var(--oe-editor-fg-soft); }

  /* Lists */
  .oe-editor ul,
  .oe-editor ol   { margin: 4px 0; padding-left: 24px; }
  .oe-editor li   { margin: 2px 0; }

  /* Nested lists */
  .oe-editor ul ul,
  .oe-editor ul ol,
  .oe-editor ol ul,
  .oe-editor ol ol { margin: 2px 0; }

  /* Code block */
  .oe-editor pre {
    background: var(--oe-input-bg);
    border: 1px solid var(--oe-chrome-border);
    border-radius: 4px;
    padding: 10px 14px;
    margin: 6px 0;
    font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
    font-size: 0.88em;
    white-space: pre-wrap;
    overflow-x: auto;
  }

  /* Inline code */
  .oe-editor code {
    background: var(--oe-code-bg);
    border-radius: 3px;
    padding: 1px 4px;
    font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
    font-size: 0.88em;
  }

  /* Horizontal rule */
  .oe-editor hr {
    border: none;
    border-top: 2px solid var(--oe-chrome-border);
    margin: 10px 0;
  }
  /* 17.5.9 — type-around: the insert-paragraph escape line near island edges. */
  .oe-type-around {
    position: absolute;
    height: 2px;
    padding: 0;
    border: 0;
    background: var(--oe-primary);
    border-radius: 1px;
    cursor: pointer;
    opacity: 0.85;
    z-index: 5;
  }
  .oe-type-around::before {
    content: '+';
    position: absolute;
    inset-inline-start: -4px;
    top: -8px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--oe-primary);
    color: var(--oe-primary-fg);
    font: 700 12px/16px system-ui, sans-serif;
    text-align: center;
  }
  .oe-type-around:hover { opacity: 1; }

  /* 17.5.4 — show blocks: debug outlines + tag labels (view-only toggle). */
  .oe-editor.oe-editor--show-blocks :is(p, h1, h2, h3, h4, h5, h6, blockquote, pre, ul, ol, li, table, figure) {
    outline: 1px dashed var(--oe-panel-fg-muted);
    outline-offset: 2px;
    position: relative;
  }
  .oe-editor.oe-editor--show-blocks :is(p, h1, h2, h3, h4, h5, h6, blockquote, pre, ul, ol, table, figure)::before {
    content: '';
    position: absolute;
    top: -8px;
    inset-inline-start: -2px;
    font: 600 8px/1.2 ui-monospace, monospace;
    letter-spacing: 0.04em;
    color: var(--oe-panel-fg-muted);
    text-transform: uppercase;
    pointer-events: none;
  }
  .oe-editor.oe-editor--show-blocks p::before { content: 'P'; }
  .oe-editor.oe-editor--show-blocks h1::before { content: 'H1'; }
  .oe-editor.oe-editor--show-blocks h2::before { content: 'H2'; }
  .oe-editor.oe-editor--show-blocks h3::before { content: 'H3'; }
  .oe-editor.oe-editor--show-blocks h4::before { content: 'H4'; }
  .oe-editor.oe-editor--show-blocks h5::before { content: 'H5'; }
  .oe-editor.oe-editor--show-blocks h6::before { content: 'H6'; }
  .oe-editor.oe-editor--show-blocks blockquote::before { content: 'QUOTE'; }
  .oe-editor.oe-editor--show-blocks pre::before { content: 'PRE'; }
  .oe-editor.oe-editor--show-blocks ul::before { content: 'UL'; }
  .oe-editor.oe-editor--show-blocks ol::before { content: 'OL'; }
  .oe-editor.oe-editor--show-blocks table::before { content: 'TABLE'; }
  .oe-editor.oe-editor--show-blocks figure::before { content: 'FIGURE'; }

  /* 17.5.3 — page break marker: dashed on screen, a real break in print. */
  .oe-editor hr.oe-page-break {
    border-top: 2px dashed var(--oe-primary);
    margin: 14px 0;
    opacity: 0.6;
  }
  @media print {
    .oe-editor hr.oe-page-break { border: 0; break-after: page; page-break-after: always; }
  }

  /* Links */
  .oe-editor a { color: var(--oe-link); text-decoration: underline; }

  /* 14.12 — bidi: isolate each block's embedding so a mixed LTR/RTL paragraph
     doesn't reorder neighbouring blocks. plaintext lets each block pick its own
     base direction from its first strong character (Word-like behaviour). */
  .oe-editor { unicode-bidi: isolate; }
  .oe-editor p, .oe-editor li, .oe-editor h1, .oe-editor h2, .oe-editor h3,
  .oe-editor h4, .oe-editor h5, .oe-editor h6, .oe-editor blockquote {
    unicode-bidi: plaintext;
  }

  /* 14.16 — reduced-motion for content INSIDE the editable (e.g. any animated
     content the user pastes/inserts). Chrome (toolbar/menus/panels) is handled
     by A11Y_CHROME_CSS, injected into the host document (see a11y-css.js). */
  @media (prefers-reduced-motion: reduce) {
    .oe-editor * { transition: none !important; animation: none !important; }
  }

  /* 14.15 — forced-colors: keep the editable itself bordered + its focus ring
     visible. Chrome edges are handled by A11Y_CHROME_CSS (host document). */
  @media (forced-colors: active) {
    .oe-editor { border: 1px solid CanvasText; }
    .oe-editor:focus-visible { outline: 2px solid Highlight; outline-offset: 1px; }
  }
`;
