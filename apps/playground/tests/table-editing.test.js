/**
 * Phase 11.B e2e — table cell editing: Tab navigation, Enter-in-cell (no split),
 * arrow nav, and the right-click context menu (insert/delete row-col, delete table).
 */
import { test, expect } from '@playwright/test';

// Seed a table directly and put the caret in the first cell.
async function seedTable(page, rows = 2, cols = 2) {
  await page.evaluate(({ rows, cols }) => {
    const ed = window.__openEditorInstance;
    let html = '<table class="oe-table"><colgroup>';
    for (let c = 0; c < cols; c++) html += '<col>';
    html += '</colgroup><tbody>';
    for (let r = 0; r < rows; r++) {
      html += '<tr>';
      for (let c = 0; c < cols; c++) html += `<td>r${r}c${c}</td>`;
      html += '</tr>';
    }
    html += '</tbody></table><p>after</p>';
    ed.setHTML(html);
  }, { rows, cols });
}
async function caretInCell(page, index) {
  await page.evaluate((i) => {
    const cells = document.querySelectorAll('.oe-editor td');
    const cell = cells[i];
    const range = document.createRange();
    range.setStart(cell.firstChild || cell, 0);
    range.collapse(true);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    window.__openEditorInstance.getEditorElement().focus();
  }, index);
}
function dims(page) {
  return page.evaluate(() => {
    const t = document.querySelector('.oe-editor table');
    if (!t) return null;
    return { rows: t.querySelectorAll('tbody tr').length,
             cols: t.querySelectorAll('tbody tr:first-child td').length };
  });
}

test.describe('Phase 11.B — Table editing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.oe-toolbar');
    await page.locator('.oe-editor').click();
  });

  test('Enter inside a cell inserts a <br> and does NOT split the table', async ({ page }) => {
    await seedTable(page, 1, 1);
    await caretInCell(page, 0);
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(60);
    const state = await page.evaluate(() => ({
      tables: document.querySelectorAll('.oe-editor table').length,
      brInCell: !!document.querySelector('.oe-editor td br'),
    }));
    expect(state.tables).toBe(1);       // still one table — not split
    expect(state.brInCell).toBe(true);  // line break added inside the cell
  });

  test('Tab at the last cell appends a row', async ({ page }) => {
    await seedTable(page, 2, 2);
    await caretInCell(page, 3); // last cell
    await page.keyboard.press('Tab');
    await page.waitForTimeout(60);
    expect(await dims(page)).toEqual({ rows: 3, cols: 2 });
  });

  test('right-click a cell → Insert row below adds a row', async ({ page }) => {
    await seedTable(page, 2, 2);
    await page.locator('.oe-editor td').first().click({ button: 'right' });
    await page.waitForSelector('.oe-menu', { state: 'visible' });
    await page.locator('.oe-menu').getByText('Insert row below', { exact: true }).click();
    await page.waitForTimeout(60);
    expect(await dims(page)).toEqual({ rows: 3, cols: 2 });
  });

  test('right-click a cell → Delete column removes a column', async ({ page }) => {
    await seedTable(page, 2, 3);
    await page.locator('.oe-editor td').first().click({ button: 'right' });
    await page.waitForSelector('.oe-menu', { state: 'visible' });
    await page.locator('.oe-menu').getByText('Delete column', { exact: true }).click();
    await page.waitForTimeout(60);
    expect(await dims(page)).toEqual({ rows: 2, cols: 2 });
  });

  test('right-click → Delete table removes the whole table', async ({ page }) => {
    await seedTable(page, 2, 2);
    await page.locator('.oe-editor td').first().click({ button: 'right' });
    await page.waitForSelector('.oe-menu', { state: 'visible' });
    await page.locator('.oe-menu').getByText('Delete table', { exact: true }).click();
    await page.waitForTimeout(60);
    const has = await page.evaluate(() => !!document.querySelector('.oe-editor table'));
    expect(has).toBe(false);
  });

  // Bug #1 regression — a real-browser selection spanning two cells + Backspace
  // must NOT merge the cells or dissolve the table (used to shred it via the
  // block-editing multi-block delete).
  test('cross-cell selection + Backspace preserves the table structure', async ({ page }) => {
    await seedTable(page, 2, 2);
    // Programmatically select from inside cell 0 to inside cell 3 (spans all 4).
    await page.evaluate(() => {
      const cells = document.querySelectorAll('.oe-editor td');
      const r = document.createRange();
      r.setStart(cells[0].firstChild, 1);
      r.setEnd(cells[3].firstChild, 2);
      const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
      window.__openEditorInstance.getEditorElement().focus();
    });
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(60);
    // Structure intact: one table, still 2x2, four cells.
    expect(await dims(page)).toEqual({ rows: 2, cols: 2 });
    const state = await page.evaluate(() => ({
      tables: document.querySelectorAll('.oe-editor table').length,
      cells: document.querySelectorAll('.oe-editor td').length,
    }));
    expect(state.tables).toBe(1);
    expect(state.cells).toBe(4);
  });

  // Defect #5 regression — a selection engulfing a whole table (from a paragraph
  // before it to a paragraph after it) + Backspace must NOT delete the table.
  test('selection engulfing a whole table + Backspace preserves it', async ({ page }) => {
    await page.evaluate(() => {
      window.__openEditorInstance.setHTML(
        '<p>before</p><table class="oe-table"><colgroup><col><col></colgroup>'
        + '<tbody><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></tbody></table><p>after</p>');
    });
    await page.evaluate(() => {
      const root = window.__openEditorInstance.getEditorElement();
      const p1 = root.querySelector('p'); // "before"
      const p2 = root.querySelectorAll('p')[1]; // "after"
      const r = document.createRange();
      r.setStart(p1.firstChild, 2);
      r.setEnd(p2.firstChild, 3);
      const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
      root.focus();
    });
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(60);
    const state = await page.evaluate(() => ({
      tables: document.querySelectorAll('.oe-editor table').length,
      cells: document.querySelectorAll('.oe-editor td').length,
    }));
    expect(state.tables).toBe(1); // table survives the engulfing delete
    expect(state.cells).toBe(4);
  });
});
