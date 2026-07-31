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
    color: var(--oe-content-placeholder);
    font-size: 11px;
    line-height: 1.2;
    opacity: 0.65;
    user-select: none;
    -webkit-user-select: none;
    pointer-events: none;
  }
`;
