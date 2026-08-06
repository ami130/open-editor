/**
 * table-audit-fixes.test.js — regressions for the table deep-audit round.
 *   T2  deleteTable restores an editable floor (no empty editor / orphan caret)
 *   T3  deleteRow re-homes a rowspan-origin cell when there is no next row
 *   T4  mergeCells rowspan counts only rows INSIDE the merge rectangle
 *   T5  huge colspan/rowspan is clamped (anti-freeze)
 *   T14 toggleHeaderColumn sets scope="row" header cells
 */
import { describe, it, expect } from 'vitest';
import { createTestEditor } from '../src/testing/test-harness.js';
import { deleteTable, deleteRow } from '../src/plugins/table/table-ops.js';
import { mergeCells } from '../src/plugins/table/table-merge.js';
import { toggleHeaderColumn } from '../src/plugins/table/table-format.js';
import { buildMatrix, matrixDimensions, cellAt } from '../src/plugins/table/table-matrix.js';

function tableFrom(html) {
  const t = document.createElement('table');
  t.innerHTML = `<tbody>${html}</tbody>`;
  return t;
}

describe('T2 deleteTable restores an editable floor + caret', () => {
  it('leaves a paragraph behind when the table was the only block', () => {
    const editor = createTestEditor();
    const root = editor.getEditorElement();
    root.innerHTML = '';
    const t = tableFrom('<tr><td>a</td></tr>');
    root.appendChild(t);
    deleteTable(t, editor);
    expect(root.querySelector('table')).toBeNull();
    // Floor restored: root has at least one block to hold the caret.
    expect(root.children.length).toBeGreaterThanOrEqual(1);
    if (!editor.isDestroyed()) editor.destroy();
  });
});

describe('T3 deleteRow re-homes a rowspan-origin cell with no next row', () => {
  it('moves the cell content into the previous row instead of dropping it', () => {
    // row0 has a normal cell; row1's first cell has rowspan=2 (points past the
    // table — malformed). Deleting row1 must not lose "keepme".
    const t = tableFrom(
      '<tr><td>a</td><td>b</td></tr>' +
      '<tr><td rowspan="2">keepme</td><td>c</td></tr>');
    deleteRow(t, 1);
    expect(t.textContent).toContain('keepme');
  });
});

describe('T4 mergeCells rowspan counts only in-rectangle rows', () => {
  it('a 2x1 vertical merge yields rowspan=2 and stays rectangular', () => {
    const t = tableFrom(
      '<tr><td>a</td><td>b</td></tr>' +
      '<tr><td>c</td><td>d</td></tr>');
    const rows = t.querySelectorAll('tr');
    const a = rows[0].cells[0], c = rows[1].cells[0];
    const survivor = mergeCells(t, [a, c]);
    expect(survivor).not.toBeNull();
    expect(survivor.getAttribute('rowspan')).toBe('2');
    // Grid still rectangular: every visual row has the same column count.
    const m = buildMatrix(t);
    const { rows: R, cols: C } = matrixDimensions(m);
    for (let r = 0; r < R; r++) {
      let filled = 0;
      for (let col = 0; col < C; col++) if (cellAt(m, r, col)) filled++;
      expect(filled).toBe(C);
    }
  });
});

describe('T5 huge span clamp', () => {
  it('caps a colspan="99999" so the matrix stays bounded', () => {
    const t = tableFrom('<tr><td colspan="99999">a</td></tr>');
    expect(matrixDimensions(buildMatrix(t)).cols).toBeLessThanOrEqual(1000);
  });
});

describe('T14 toggleHeaderColumn (row headers)', () => {
  it('converts the first column to th scope="row" and back', () => {
    const t = tableFrom(
      '<tr><td>a</td><td>b</td></tr>' +
      '<tr><td>c</td><td>d</td></tr>');
    const on = toggleHeaderColumn(t);
    expect(on).toBe(true);
    const firstCol = [...t.querySelectorAll('tr')].map((r) => r.cells[0]);
    for (const c of firstCol) {
      expect(c.tagName.toLowerCase()).toBe('th');
      expect(c.getAttribute('scope')).toBe('row');
    }
    // Second column untouched.
    expect(t.querySelectorAll('tr')[0].cells[1].tagName.toLowerCase()).toBe('td');
    // Toggle back.
    expect(toggleHeaderColumn(t)).toBe(false);
    expect(t.querySelectorAll('tr')[0].cells[0].tagName.toLowerCase()).toBe('td');
  });
});

// ── T6: cell-range copy serialization ─────────────────────────────────────────
import { serializeCellRange } from '../src/plugins/table/table-copy.js';

describe('T6 serializeCellRange', () => {
  it('serializes the selected rectangle to a subtable + TSV', () => {
    const t = tableFrom(
      '<tr><td>a</td><td>b</td><td>x</td></tr>' +
      '<tr><td>c</td><td>d</td><td>y</td></tr>');
    const rows = t.querySelectorAll('tr');
    // Select the 2x2 block a,b / c,d (exclude the x,y column).
    const cells = [rows[0].cells[0], rows[0].cells[1], rows[1].cells[0], rows[1].cells[1]];
    const out = serializeCellRange(t, cells);
    expect(out.html).toContain('<table');
    expect(out.html).toContain('<td>a</td>');
    expect(out.html).not.toContain('>x<');       // excluded column not present
    expect(out.tsv).toBe('a\tb\nc\td');
  });
  it('strips the selection class from the copied HTML', () => {
    const t = tableFrom('<tr><td class="oe-cell--selected">a</td><td class="oe-cell--selected">b</td></tr>');
    const cells = [...t.querySelectorAll('td')];
    const out = serializeCellRange(t, cells);
    expect(out.html).not.toContain('oe-cell--selected');
  });
});

// ── T7: TSV paste → table ─────────────────────────────────────────────────────
import { plainTextToHtml, looksLikeTsv } from '../src/paste/paste-plain.js';

describe('T7 TSV paste', () => {
  it('turns a tab+newline payload into a table', () => {
    const html = plainTextToHtml('h1\th2\nv1\tv2');
    expect(html).toContain('<table');
    expect((html.match(/<tr>/g) || []).length).toBe(2);
  });
  it('does not tableize ordinary prose', () => {
    expect(looksLikeTsv('a normal sentence')).toBe(false);
    expect(plainTextToHtml('a normal sentence')).toContain('<p>');
  });
});
