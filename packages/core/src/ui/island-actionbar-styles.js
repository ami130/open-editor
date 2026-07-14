import { injectStyleOnce } from '../utils/inject-style.js';

/**
 * island-actionbar-styles.js — shared CSS for the floating quick-action bar
 * shown above a selected contenteditable="false" island (image-actionbar.js's
 * .oe-img-actionbar markup, reused as-is by media-actionbar.js for video
 * embeds). Extracted out of image-styles.js for the same reason as
 * resize-overlay-styles.js: avoid duplicating this CSS or double-injecting it
 * under two ids when both plugins are installed together.
 */

const STYLE_ID = 'oe-island-actionbar-styles';

export const ISLAND_ACTIONBAR_CSS = `
.oe-img-actionbar {
  position: absolute;
  z-index: 101;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  background: var(--oe-inverse-bg);
  border-radius: 7px;
  box-shadow: 0 4px 14px rgba(0,0,0,0.28);
}
.oe-img-actionbar[hidden] { display: none; }
.oe-img-actionbar__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--oe-inverse-fg);
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}
.oe-img-actionbar__btn:hover  { background: var(--oe-inverse-hover); color: var(--oe-inverse-fg); }
.oe-img-actionbar__btn:focus-visible { outline: 2px solid var(--oe-inverse-focus); outline-offset: 1px; }
.oe-img-actionbar__btn--del:hover { background: var(--oe-inverse-danger-bg); color: var(--oe-inverse-danger-fg); }
.oe-img-actionbar__sep {
  width: 1px;
  height: 18px;
  margin: 0 3px;
  background: var(--oe-inverse-sep);
}
`;

export function injectIslandActionbarStyles(doc) {
  injectStyleOnce(doc, STYLE_ID, ISLAND_ACTIONBAR_CSS);
}
