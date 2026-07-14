/**
 * table-grid-picker.test.js — Phase 11.1: the NxM hover grid.
 */
import { describe, it, expect } from 'vitest';
import { buildGridPicker } from '../src/plugins/table/table-grid-picker.js';

describe('buildGridPicker', () => {
  it('renders a MAX grid of cells with a label', () => {
    const { panel, cells } = buildGridPicker(document, () => {});
    expect(cells.length).toBe(8 * 10);
    expect(panel.querySelector('.oe-table-picker__label').textContent).toBe('0 × 0');
  });

  it('hover highlights the top-left r×c block and updates the label', () => {
    const { panel, cells, hover } = buildGridPicker(document, () => {});
    hover(3, 4);
    const on = cells.filter((c) => c.el.classList.contains('oe-table-picker__cell--on'));
    expect(on.length).toBe(3 * 4);
    expect(panel.querySelector('.oe-table-picker__label').textContent).toBe('3 × 4');
  });

  it('mouseenter on a cell paints up to it', () => {
    const { cells } = buildGridPicker(document, () => {});
    const target = cells.find((c) => c.r === 2 && c.c === 2);
    target.el.dispatchEvent(new Event('mouseenter'));
    const on = cells.filter((c) => c.el.classList.contains('oe-table-picker__cell--on'));
    expect(on.length).toBe(4); // 2×2
  });

  it('click calls onPick with the cell dimensions', () => {
    let picked = null;
    const { cells } = buildGridPicker(document, (r, c) => { picked = { r, c }; });
    const target = cells.find((c) => c.r === 4 && c.c === 5);
    target.el.dispatchEvent(new Event('mouseenter'));
    target.el.click();
    expect(picked).toEqual({ r: 4, c: 5 });
  });

  it('respects custom max dimensions', () => {
    const { cells } = buildGridPicker(document, () => {}, { maxRows: 3, maxCols: 3 });
    expect(cells.length).toBe(9);
  });

  it('no preset selector when presets are not configured (11.18)', () => {
    const { panel, getClassName } = buildGridPicker(document, () => {});
    expect(panel.querySelector('.oe-table-picker__preset')).toBeNull();
    expect(getClassName()).toBe('');
  });

  it('renders a preset selector and getClassName returns the chosen value (11.18)', () => {
    const { panel, getClassName } = buildGridPicker(document, () => {}, {
      presets: [{ value: 'table-bordered', label: 'Bordered' }, { value: 'table-striped', label: 'Striped' }],
    });
    const sel = panel.querySelector('.oe-table-picker__preset');
    expect(sel).not.toBeNull();
    // options: Default + 2 presets
    expect(sel.querySelectorAll('option').length).toBe(3);
    sel.value = 'table-striped';
    expect(getClassName()).toBe('table-striped');
  });
});
