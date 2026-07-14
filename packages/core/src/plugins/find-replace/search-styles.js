import { injectStyleOnce } from '../../utils/inject-style.js';
/**
 * search-styles.js — CSS for the Find/Replace panel (13.2).
 * CSS files are exempt from the 300-line source limit.
 */
const STYLE_ID = 'oe-find-styles';

const CSS = `
.oe-find {
  position: absolute; top: 8px; right: 8px; z-index: 20;
  display: flex; flex-direction: column; gap: 6px;
  padding: 8px; border-radius: 8px;
  background: var(--oe-bg); border: 1px solid var(--oe-border-strong);
  box-shadow: 0 4px 16px rgba(0,0,0,0.12);
}
.oe-find__row { display: flex; align-items: center; gap: 4px; }
.oe-find__row--replace { display: none; }
.oe-find__input {
  width: 160px; padding: 5px 7px; font-size: 0.9em; box-sizing: border-box;
  border: 1px solid var(--oe-border-strong); border-radius: 6px;
}
.oe-find__count { font-size: 0.8em; color: var(--oe-panel-fg-muted); min-width: 40px; text-align: center; font-variant-numeric: tabular-nums; }
.oe-find__btn {
  padding: 4px 8px; font-size: 0.85em; line-height: 1;
  border: 1px solid var(--oe-border-strong); border-radius: 6px; background: var(--oe-bg); cursor: pointer; color: var(--oe-panel-fg);
}
.oe-find__btn:hover { background: var(--oe-panel-hover); }
.oe-find__case--on { background: var(--oe-primary); border-color: var(--oe-primary); color: var(--oe-primary-fg); }
.oe-find__word--on { background: var(--oe-primary); border-color: var(--oe-primary); color: var(--oe-primary-fg); }
.oe-find__close { font-size: 1.1em; line-height: 1; }
`;

export function injectSearchStyles(doc) {
  injectStyleOnce(doc, STYLE_ID, CSS);
}
