import { injectStyleOnce } from '../../utils/inject-style.js';
/**
 * source-styles.js — CSS for the Source Code view textarea (13.1).
 * CSS files are exempt from the 300-line source limit.
 */
const STYLE_ID = 'oe-source-styles';

const CSS = `
/* 16.7.7 — source view is a scroll-synced overlay: a transparent-text
   <textarea> (real editing surface + visible caret) on top of a colored
   <pre> highlight layer. Both MUST share the exact same font metrics, padding,
   border, and box model for the transparent characters to sit pixel-aligned
   over their colored counterparts — every shared property lives on the
   .oe-source__shared class below. */
.oe-source {
  position: relative;
  width: 100%;
  min-height: inherit;
  background: var(--oe-input-bg);
  overflow: hidden;
}
.oe-source__shared {
  box-sizing: border-box;
  margin: 0;
  padding: 12px;
  border: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px;
  line-height: 1.5;
  tab-size: 2;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: break-word;
}
.oe-source__highlight {
  position: absolute;
  inset: 0;
  overflow: auto;
  pointer-events: none;
  color: var(--oe-panel-fg);
  z-index: 0;
}
.oe-source__textarea {
  position: relative;
  display: block;
  width: 100%;
  min-height: inherit;
  resize: vertical;
  background: transparent;
  /* Transparent text so only the caret shows through; the colored pre layer
     behind provides the visible glyphs. -webkit-text-fill-color is needed
     because color:transparent alone still shows text in some WebKit builds. */
  color: transparent;
  -webkit-text-fill-color: transparent;
  caret-color: var(--oe-panel-fg);
  overflow: auto;
  z-index: 1;
}
.oe-source__textarea:focus { outline: 2px solid var(--oe-primary); outline-offset: -2px; }
/* Token colors — all semantic tokens (theme-aware). */
.oe-hl-punct   { color: var(--oe-panel-fg-muted); }
.oe-hl-tag     { color: var(--oe-primary); }
.oe-hl-attr    { color: var(--oe-primary-hover); }
.oe-hl-str     { color: var(--oe-link); }
.oe-hl-comment { color: var(--oe-panel-fg-muted); font-style: italic; }
/* When in source mode, hide toolbar formatting affordances that don't apply.
   (The editable area itself is hidden inline by the plugin.) */
.oe-wrapper--source .oe-resize-grip { display: none; }
`;

export function injectSourceStyles(doc) {
  injectStyleOnce(doc, STYLE_ID, CSS);
}
