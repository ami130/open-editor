/**
 * table-grid-picker.js — the NxM hover grid for inserting a table (11.1).
 *
 * buildGridPicker(doc, onPick, opts) → { panel, cells, hover(r,c) }
 *   Renders a MAX×MAX grid of cells. Hovering a cell highlights the top-left
 *   r×c block and updates the "r × c" label; clicking calls onPick(rows, cols).
 *   The picker starts small visually but grows the active region as you hover
 *   near the edges — here we keep a fixed MAX grid for simplicity and clarity.
 *
 * Pure DOM + callback, no editor/document assumptions beyond `doc`, so it is
 * unit-testable: build it, call hover(r,c), assert the highlight + label, click.
 */

const MAX_ROWS = 8;
const MAX_COLS = 10;

export function buildGridPicker(doc, onPick, opts = {}) {
  const maxRows = opts.maxRows || MAX_ROWS;
  const maxCols = opts.maxCols || MAX_COLS;

  const panel = doc.createElement('div');
  panel.className = 'oe-table-picker';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Insert table');

  const grid = doc.createElement('div');
  grid.className = 'oe-table-picker__grid';
  grid.style.gridTemplateColumns = `repeat(${maxCols}, 1fr)`;

  const label = doc.createElement('div');
  label.className = 'oe-table-picker__label';
  label.textContent = '0 × 0';

  const cells = []; // row-major, each { el, r, c } (1-based dims)
  let hoverR = 0, hoverC = 0;

  function paint(r, c) {
    hoverR = r; hoverC = c;
    for (const cell of cells) {
      const on = cell.r <= r && cell.c <= c;
      cell.el.classList.toggle('oe-table-picker__cell--on', on);
    }
    label.textContent = `${r} × ${c}`;
  }

  for (let r = 1; r <= maxRows; r++) {
    for (let c = 1; c <= maxCols; c++) {
      const el = doc.createElement('button');
      el.type = 'button';
      el.className = 'oe-table-picker__cell';
      el.setAttribute('aria-label', `${r} by ${c}`);
      const entry = { el, r, c };
      cells.push(entry);
      el.addEventListener('mouseenter', () => paint(r, c));
      // preventDefault on mousedown so the editor selection/focus is not lost.
      el.addEventListener('mousedown', (e) => e.preventDefault());
      el.addEventListener('click', () => {
        if (typeof onPick === 'function') onPick(r, c);
      });
      grid.appendChild(el);
    }
  }

  panel.appendChild(grid);
  panel.appendChild(label);

  // 11.18 — optional preset (style) selector when tableAvailableClasses is set.
  let presetSelect = null;
  const presets = Array.isArray(opts.presets) ? opts.presets : [];
  if (presets.length) {
    presetSelect = doc.createElement('select');
    presetSelect.className = 'oe-table-picker__preset';
    presetSelect.setAttribute('aria-label', 'Table style');
    const none = doc.createElement('option');
    none.value = ''; none.textContent = 'Default style';
    presetSelect.appendChild(none);
    for (const p of presets) {
      const o = doc.createElement('option');
      o.value = p.value; o.textContent = p.label || p.value;
      presetSelect.appendChild(o);
    }
    // Don't let a mousedown on the select start a table drag / lose focus.
    presetSelect.addEventListener('mousedown', (e) => e.stopPropagation());
    panel.appendChild(presetSelect);
  }

  // Programmatic hover for tests / keyboard use.
  function hover(r, c) { paint(r, c); }
  function getClassName() { return presetSelect ? presetSelect.value : ''; }

  return { panel, cells, hover, getHover: () => ({ rows: hoverR, cols: hoverC }), getClassName };
}
