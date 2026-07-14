import { injectStyleOnce } from '../../utils/inject-style.js';
/**
 * char-styles.js — CSS for the character/emoji grid (13.3/13.4).
 * CSS files are exempt from the 300-line source limit.
 */
const STYLE_ID = 'oe-char-styles';

const CSS = `
.oe-chargrid { display: flex; flex-direction: column; gap: 8px; min-width: 320px; max-width: 420px; }
.oe-chargrid__tabs { display: flex; flex-wrap: wrap; gap: 4px; }
.oe-chargrid__tab {
  padding: 4px 8px; font-size: 0.8em; border: 1px solid var(--oe-border-strong); border-radius: 6px;
  background: var(--oe-bg); cursor: pointer; color: var(--oe-panel-fg);
}
.oe-chargrid__tab--on { background: var(--oe-primary); border-color: var(--oe-primary); color: var(--oe-primary-fg); }
.oe-chargrid__search {
  width: 100%; padding: 6px 8px; font-size: 0.9em; box-sizing: border-box;
  border: 1px solid var(--oe-border-strong); border-radius: 6px;
}
.oe-chargrid__grid {
  display: grid; gap: 4px; max-height: 260px; overflow-y: auto; padding: 2px;
}
.oe-chargrid__cell {
  aspect-ratio: 1 / 1; min-width: 30px; display: flex; align-items: center; justify-content: center;
  font-size: 1.15em; line-height: 1; border: 1px solid var(--oe-panel-border); border-radius: 6px;
  background: var(--oe-bg); cursor: pointer; padding: 0;
}
.oe-chargrid__cell:hover { background: var(--oe-primary-tint-strong); border-color: var(--oe-primary); }
.oe-chargrid__cell:focus-visible { outline: 2px solid var(--oe-primary); outline-offset: 1px; }
.oe-chargrid__empty { grid-column: 1 / -1; text-align: center; color: var(--oe-panel-fg-faint); padding: 16px; font-size: 0.9em; }
`;

export function injectCharStyles(doc) {
  injectStyleOnce(doc, STYLE_ID, CSS);
}
