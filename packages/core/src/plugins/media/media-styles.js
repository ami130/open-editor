import { injectStyleOnce } from '../../utils/inject-style.js';
import { injectResizeOverlayStyles } from '../../ui/resize-overlay-styles.js';
import { injectIslandActionbarStyles } from '../../ui/island-actionbar-styles.js';
/**
 * media-styles.js — CSS for embedded video (13.5) + resize/align (mirrors the
 * image plugin's alignment and selected-state treatment). CSS files are
 * exempt from the 300-line source limit.
 */
const STYLE_ID = 'oe-media-styles';

const CSS = `
.oe-embed {
  /* Modern aspect-ratio (not the legacy padding-bottom-percent trick): that
     trick resolves its percentage against the PARENT's width, so setting the
     figure's own width via inline style (resize handles) never changed its
     height — aspect-ratio scales correctly off the element's OWN width. */
  position: relative;
  margin: 12px 0;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  max-width: 100%;
  background: #000;
  border-radius: 8px;
}
.oe-embed__frame {
  position: absolute;
  top: 0; left: 0;
  width: 100%; height: 100%;
  border: 0;
}
.oe-embed__shield {
  position: absolute;
  inset: 0;
  cursor: pointer;
  background: transparent;
}
.oe-embed--selected .oe-embed__shield { pointer-events: none; }
.oe-embed--selected {
  box-shadow: 0 0 0 2px var(--oe-bg), 0 0 0 4px var(--oe-primary);
}
/* Unlike an <img>, the iframe/shield inside .oe-embed are position:absolute
   (out of flow, for the aspect-ratio box) — there is no in-flow content left
   to establish a shrink-to-fit width for a float, so a floated embed with no
   inline width style collapses to 0x0. A default width fixes align-left/
   right BEFORE any resize; a later drag resize overrides it with an inline
   style anyway (inline styles win over this class rule). */
.oe-embed--left   { float: left;  margin-right: 1.25em; width: 50%; }
.oe-embed--right  { float: right; margin-left:  1.25em; width: 50%; }
.oe-embed--center { display: block; margin-left: auto; margin-right: auto; }
.oe-embed--inline { display: inline-block; }
.oe-embed-dialog { display: flex; flex-direction: column; gap: 8px; min-width: 320px; }
.oe-embed-dialog__input {
  width: 100%; padding: 8px 10px; font-size: 0.95em; box-sizing: border-box;
  border: 1px solid var(--oe-border-strong); border-radius: 6px;
}
.oe-embed-dialog__note { font-size: 0.8em; color: var(--oe-panel-fg-muted); }
`;

export function injectMediaStyles(doc) {
  injectStyleOnce(doc, STYLE_ID, CSS);
  injectResizeOverlayStyles(doc);
  injectIslandActionbarStyles(doc);
}
