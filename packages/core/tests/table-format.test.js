/**
 * table-format.test.js — Phase 11.D styling/format ops.
 */
import { describe, it, expect } from 'vitest';
import {
  toggleHeaderRow, setCellBackground, setCellTextColor,
  setCellAlign, setCellVAlign, setCellBorder, setTableStyle,
  setCaption, applyTableClasses,
} from '../src/plugins/table/table-format.js';
import { buildMatrix, matrixDimensions } from '../src/plugins/table/table-matrix.js';

function makeTable(rows) {
  const t = document.createElement('table');
  const tb = document.createElement('tbody');
  for (const row of rows) {
    const tr = document.createElement('tr');
    for (const spec of row) {
      const isH = typeof spec === 'object' && spec.h;
      const td = document.createElement(isH ? 'th' : 'td');
      if (typeof spec === 'string') td.textContent = spec;
      else { td.textContent = spec.t || ''; if (spec.cs) td.setAttribute('colspan', String(spec.cs)); }
      tr.appendChild(td);
    }
    tb.appendChild(tr);
  }
  t.appendChild(tb);
  document.body.appendChild(t);
  return t;
}

describe('toggleHeaderRow', () => {
  it('converts the first row td→th with scope=col', () => {
    const t = makeTable([['a', 'b'], ['c', 'd']]);
    const isHeader = toggleHeaderRow(t);
    expect(isHeader).toBe(true);
    const firstRow = t.querySelector('tr');
    const ths = firstRow.querySelectorAll('th');
    expect(ths.length).toBe(2);
    expect(ths[0].getAttribute('scope')).toBe('col');
    expect(ths[0].textContent).toBe('a'); // content preserved
  });

  it('toggles back th→td and removes scope', () => {
    const t = makeTable([[{ t: 'a', h: true }, { t: 'b', h: true }], ['c', 'd']]);
    const isHeader = toggleHeaderRow(t); // has th → makeHeader=false
    expect(isHeader).toBe(false);
    const firstRow = t.querySelector('tr');
    expect(firstRow.querySelectorAll('td').length).toBe(2);
    expect(firstRow.querySelector('[scope]')).toBeNull();
  });

  it('preserves colspan through the tag swap and keeps the grid valid', () => {
    const t = makeTable([[{ t: 'wide', cs: 2 }], ['c', 'd']]);
    const before = matrixDimensions(buildMatrix(t));
    toggleHeaderRow(t);
    const th = t.querySelector('th');
    expect(th.getAttribute('colspan')).toBe('2');
    expect(matrixDimensions(buildMatrix(t))).toEqual(before); // unchanged shape
  });
});

describe('cell colours + alignment', () => {
  it('sets and clears background + text colour', () => {
    const t = makeTable([['a', 'b']]);
    const cells = t.querySelectorAll('td');
    setCellBackground(cells, '#ffeeaa');
    setCellTextColor(cells, '#222');
    expect(cells[0].style.backgroundColor).not.toBe('');
    expect(cells[0].style.color).not.toBe('');
    setCellBackground(cells, '');
    expect(cells[0].style.backgroundColor).toBe('');
  });

  it('sets horizontal + vertical alignment', () => {
    const t = makeTable([['a']]);
    const cells = t.querySelectorAll('td');
    setCellAlign(cells, 'center');
    setCellVAlign(cells, 'middle');
    expect(cells[0].style.textAlign).toBe('center');
    expect(cells[0].style.verticalAlign).toBe('middle');
  });
});

describe('per-side cell border', () => {
  it('sets a single side and clears it', () => {
    const t = makeTable([['a']]);
    const cells = t.querySelectorAll('td');
    setCellBorder(cells, 'top', '2px solid red');
    expect(cells[0].style.borderTop).toContain('solid');
    setCellBorder(cells, 'top', '');
    expect(cells[0].style.borderTop).toBe('');
  });
  it('side "all" sets the full border', () => {
    const t = makeTable([['a']]);
    const cells = t.querySelectorAll('td');
    setCellBorder(cells, 'all', '1px solid #000');
    expect(cells[0].style.border).toContain('solid');
  });
});

describe('setTableStyle', () => {
  it('sets width', () => {
    const t = makeTable([['a']]);
    setTableStyle(t, { width: '80%' });
    expect(t.style.width).toBe('80%');
  });
  it('center alignment sets auto margins', () => {
    const t = makeTable([['a']]);
    setTableStyle(t, { align: 'center' });
    expect(t.style.marginLeft).toBe('auto');
    expect(t.style.marginRight).toBe('auto');
  });
  it('border applies to table and all cells', () => {
    const t = makeTable([['a', 'b'], ['c', 'd']]);
    setTableStyle(t, { border: '1px solid #ccc' });
    expect(t.style.border).toContain('solid');
    t.querySelectorAll('td').forEach((c) => expect(c.style.border).toContain('solid'));
  });
});

describe('setCaption (11.14)', () => {
  it('inserts a caption as the FIRST child of the table', () => {
    const t = makeTable([['a']]);
    setCaption(t, 'Quarterly sales');
    const cap = t.querySelector('caption');
    expect(cap).not.toBeNull();
    expect(cap.textContent).toBe('Quarterly sales');
    expect(t.firstElementChild).toBe(cap); // must precede tbody
  });
  it('edits an existing caption in place', () => {
    const t = makeTable([['a']]);
    setCaption(t, 'First');
    setCaption(t, 'Second');
    expect(t.querySelectorAll('caption').length).toBe(1);
    expect(t.querySelector('caption').textContent).toBe('Second');
  });
  it('removes the caption when text is blank', () => {
    const t = makeTable([['a']]);
    setCaption(t, 'x');
    setCaption(t, '   ');
    expect(t.querySelector('caption')).toBeNull();
  });
});

describe('applyTableClasses (11.18)', () => {
  it('applies presets while preserving oe-table', () => {
    const t = makeTable([['a']]);
    t.className = 'oe-table';
    applyTableClasses(t, 'table-bordered table-striped');
    expect(t.classList.contains('oe-table')).toBe(true);
    expect(t.classList.contains('table-bordered')).toBe(true);
    expect(t.classList.contains('table-striped')).toBe(true);
  });
  it('accepts an array and clears presets without dropping oe-table', () => {
    const t = makeTable([['a']]);
    applyTableClasses(t, ['table-dark']);
    expect(t.classList.contains('table-dark')).toBe(true);
    applyTableClasses(t, '');
    expect(t.className).toBe('oe-table');
  });
});
