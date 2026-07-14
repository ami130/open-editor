import { injectStyleOnce } from '../../utils/inject-style.js';
/**
 * table-styles.js — CSS for the Table plugin (injected once per document).
 * CSS files are exempt from the 300-line source limit.
 */
const STYLE_ID = 'oe-table-styles';

const TABLE_CSS = `
/* ── Editor tables ───────────────────────────────────────────────────────────── */
.oe-editor table.oe-table {
  border-collapse: collapse;
  width: 100%;
  margin: 12px 0;
  table-layout: fixed;
}
.oe-editor table.oe-table td,
.oe-editor table.oe-table th {
  border: 1px solid var(--oe-border-strong);
  padding: 6px 8px;
  vertical-align: top;
  min-width: 24px;
  word-break: break-word;
}
.oe-editor table.oe-table th {
  background: var(--oe-panel-hover);
  font-weight: 600;
  text-align: left;
}
.oe-editor table.oe-table caption {
  caption-side: top;
  padding: 4px 0;
  font-size: 0.85em;
  color: var(--oe-fg-muted);
  text-align: left;
}

/* ── Selected cells (drag-select range) ──────────────────────────────────────── */
.oe-editor table.oe-table td.oe-cell--selected,
.oe-editor table.oe-table th.oe-cell--selected {
  background: var(--oe-primary-wash);
  outline: 1px solid var(--oe-primary);
  outline-offset: -1px;
}

/* ── Grid picker (insert NxM) ─────────────────────────────────────────────────── */
.oe-table-picker { padding: 10px 12px 12px; user-select: none; }
.oe-table-picker__grid {
  display: grid;
  gap: 3px;
  margin-bottom: 10px;
}
.oe-table-picker__cell {
  width: 19px;
  height: 19px;
  padding: 0;
  border: 1px solid var(--oe-border-strong);
  border-radius: 3px;
  background: var(--oe-bg);
  cursor: pointer;
  transition: background 0.09s ease, border-color 0.09s ease, transform 0.09s ease;
}
.oe-table-picker__cell:hover { border-color: var(--oe-primary); }
.oe-table-picker__cell:focus-visible {
  outline: 2px solid var(--oe-focus-ring);
  outline-offset: 1px;
  border-color: var(--oe-primary);
}
/* Cells inside the hovered top-left block: soft accent fill + accent border,
   with a subtle lift on the active corner for a "Notion inserter" feel. */
.oe-table-picker__cell--on {
  background: var(--oe-primary-tint-strong);
  border-color: var(--oe-primary);
}
.oe-table-picker__label {
  text-align: center;
  font-size: 0.8em;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--oe-primary);
  font-variant-numeric: tabular-nums;
}
.oe-table-picker__preset {
  display: block;
  width: 100%;
  margin-top: 8px;
  padding: 6px 8px;
  font-size: 0.82em;
  color: var(--oe-panel-fg);
  background: var(--oe-bg);
  border: 1px solid var(--oe-border-strong);
  border-radius: var(--oe-radius);
  cursor: pointer;
  transition: background 0.1s ease, border-color 0.1s ease;
}
.oe-table-picker__preset:hover { background: var(--oe-panel-hover); border-color: var(--oe-primary); }
.oe-table-picker__preset:focus-visible { outline: 2px solid var(--oe-focus-ring); outline-offset: 1px; }

/* 16.7.5 — table/cell properties dialogs */
.oe-tprops { display: flex; flex-direction: column; gap: 10px; min-width: 280px; }
.oe-tprops__field { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.oe-tprops__label { font-size: 0.85em; color: var(--oe-panel-fg); display: inline-flex; align-items: center; gap: 6px; }
.oe-tprops__input { flex: 0 0 auto; width: 150px; padding: 5px 7px; font-size: 0.9em; box-sizing: border-box; border: 1px solid var(--oe-border-strong); border-radius: 6px; }
.oe-tprops__input[type="color"] { width: 44px; height: 28px; padding: 2px; cursor: pointer; }
.oe-tprops__sep { height: 1px; background: var(--oe-border-strong); margin: 2px 0; }
`;

export function injectTableStyles(doc) {
  injectStyleOnce(doc, STYLE_ID, TABLE_CSS);
}
