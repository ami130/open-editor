import { injectStyleOnce } from '../../utils/inject-style.js';
/**
 * char-styles.js — compact CSS for the character/emoji picker (13.3/13.4).
 * CSS files are exempt from the 300-line source limit. All colors are theme
 * SEMANTIC tokens so it reskins in dark/minimal (no literals).
 *
 * Compact revision (2026-07-16): tidy CKEditor-class panel — a category select
 * + search in one row, a tight uniform grid of small cells, and a slim footer.
 * Narrow overall (~300px), so it no longer feels oversized.
 */
const STYLE_ID = 'oe-char-styles';

const CSS = `
.oe-chargrid {
  display: flex; flex-direction: column; gap: 10px;
  width: 100%; min-width: 300px; box-sizing: border-box;
}

/* Top row: category select + search, side by side. */
.oe-chargrid__bar { display: flex; align-items: center; gap: 8px; }
.oe-chargrid__select {
  flex: 0 0 auto; max-width: 120px; padding: 6px 8px; font: inherit; font-size: 13px;
  border: 1px solid var(--oe-chrome-border-2); border-radius: var(--oe-radius, 6px);
  background: var(--oe-input-bg); color: var(--oe-panel-fg); cursor: pointer;
}
.oe-chargrid__search-wrap { position: relative; display: flex; align-items: center; flex: 1 1 auto; }
.oe-chargrid__search-icon {
  position: absolute; left: 9px; display: inline-flex; pointer-events: none;
  color: var(--oe-panel-fg-faint);
}
.oe-chargrid__search {
  width: 100%; padding: 6px 8px 6px 29px; font: inherit; font-size: 13px; box-sizing: border-box;
  border: 1px solid var(--oe-chrome-border-2); border-radius: var(--oe-radius, 6px);
  background: var(--oe-input-bg); color: var(--oe-panel-fg);
  transition: border-color 0.12s, box-shadow 0.12s;
}
.oe-chargrid__search::placeholder { color: var(--oe-panel-fg-faint); }
.oe-chargrid__search:focus {
  outline: none; border-color: var(--oe-primary);
  box-shadow: 0 0 0 2px var(--oe-primary-wash);
}
.oe-chargrid__select:focus-visible,
.oe-chargrid__cell:focus-visible { outline: 2px solid var(--oe-primary); outline-offset: -1px; }

/* Grid — small, uniform, borderless cells; ~9 per row within 300px. */
.oe-chargrid__grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(28px, 1fr));
  gap: 2px; max-height: 220px; overflow-y: auto; scrollbar-width: thin;
}
.oe-chargrid__cell {
  aspect-ratio: 1 / 1;
  display: flex; align-items: center; justify-content: center;
  font-size: 17px; line-height: 1; padding: 0;
  border: 0; border-radius: var(--oe-radius, 6px);
  background: transparent; color: var(--oe-panel-fg); cursor: pointer;
  transition: background 0.08s;
}
.oe-chargrid__cell:hover { background: var(--oe-primary-tint-strong); }
.oe-chargrid__empty {
  grid-column: 1 / -1; text-align: center; color: var(--oe-panel-fg-faint);
  padding: 16px; font-size: 13px;
}

/* Slim footer — focused glyph + name on one line. */
.oe-chargrid__foot {
  display: flex; align-items: center; gap: 10px; min-height: 28px;
  padding-top: 8px; border-top: 1px solid var(--oe-chrome-divider);
}
.oe-chargrid__foot-glyph {
  font-size: 20px; line-height: 1; min-width: 22px; text-align: center;
  color: var(--oe-panel-fg);
}
.oe-chargrid__foot-name {
  font-size: 12px; color: var(--oe-panel-fg-muted); text-transform: capitalize;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
`;

export function injectCharStyles(doc) {
  injectStyleOnce(doc, STYLE_ID, CSS);
}
