/**
 * wrapper-chrome-css.js — layout rules for the editor WRAPPER and the "Powered
 * by" attribution strip.
 *
 * Why this is separate from BASE_CSS: the wrapper (.oe-wrapper) and the strip
 * (.oe-powered-by) render in the HOST document in BOTH modes. In iframe mode
 * BASE_CSS is injected only into the IFRAME document (where just the editable
 * lives), so any wrapper/strip rule placed in BASE_CSS would be DEAD in iframe
 * mode. This file is injected into the HOST document unconditionally (iframe or
 * not) — same treatment as a11y-css.js — so the wrapper + strip are always
 * styled.
 *
 * The strip lives BELOW the editable (a wrapper child, never inside the
 * editable) so it can NEVER overlap the text being typed. Earlier it was an
 * absolute `::after` overlay INSIDE the scrolling editable, which sat on top of
 * the last line while writing — that regression is why it now lives here.
 */
export const WRAPPER_CHROME_CSS = `
  .oe-wrapper {
    position: relative;
    box-sizing: border-box;
    /* Column layout so a "Powered by" strip (a wrapper child) sits BELOW the
       editable rather than overlapping the text. Harmless when there is no
       strip — a single flex child behaves like a normal block. */
    display: flex;
    flex-direction: column;
  }
  /* When a footer strip is present, the wrapper's content child (the editable,
     or the <iframe> in iframe mode) flexes to fill the remaining wrapper height
     and scrolls WITHIN it. flex governs the height, so we neutralize the
     editable's own height/max-height (BASE_CSS sets them to 'inherit', which
     would otherwise claim the WHOLE wrapper and push the footer out); min-height:0
     lets the flex item shrink below its content so overflow-y actually engages.
     The wrapper gets .oe-has-footer from JS only when the strip is rendered, so
     the plain editor is unaffected. */
  .oe-wrapper.oe-has-footer > .oe-editor,
  .oe-wrapper.oe-has-footer > iframe {
    flex: 1 1 auto;
    height: auto;
    min-height: 0;
    max-height: none;
  }
  .oe-powered-by {
    flex: 0 0 auto;
    box-sizing: border-box;
    text-align: right;
    padding: 4px 16px 6px;
    /* Muted BUT WCAG-AA compliant, in BOTH themes. The strip is a wrapper child
       in the HOST doc; without its own background it showed the WHITE page even
       under a dark editor theme, so dark-mode muted text (#98a1b3) on white was
       ~2.6:1 (axe flagged it). Giving it the themed surface background makes the
       fg/bg a theme-matched pair: light #69707f on #f8fafc = 4.64:1, dark
       #98a1b3 on #1a1e28 = 6.41:1 — both pass. (The old #aaa @ opacity .65 was ~1.6:1.) */
    color: var(--oe-fg-muted);
    background: var(--oe-bg-muted);
    font-size: 11px;
    line-height: 1.2;
    user-select: none;
    -webkit-user-select: none;
    pointer-events: none;
  }
`;
