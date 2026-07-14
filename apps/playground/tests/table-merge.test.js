/**
 * Phase 11.C e2e — cell selection + merge/split via the context menu.
 */
import { test, expect } from '@playwright/test';

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
function dims(page) {
  return page.evaluate(() => {
    const t = document.querySelector('.oe-editor table');
    if (!t) return null;
    return { rows: t.querySelectorAll('tbody tr').length,
             cols: t.querySelectorAll('tbody tr:first-child td').length };
  });
}
// Drag-select from cell index a to b using real mouse events over their centres.
async function dragSelect(page, a, b) {
  const boxes = await page.evaluate(({ a, b }) => {
    const cells = document.querySelectorAll('.oe-editor td');
    const r1 = cells[a].getBoundingClientRect();
    const r2 = cells[b].getBoundingClientRect();
    return [
      { x: r1.left + r1.width / 2, y: r1.top + r1.height / 2 },
      { x: r2.left + r2.width / 2, y: r2.top + r2.height / 2 },
    ];
  }, { a, b });
  await page.mouse.move(boxes[0].x, boxes[0].y);
  await page.mouse.down();
  await page.mouse.move(boxes[1].x, boxes[1].y, { steps: 6 });
  await page.mouse.up();
}

test.describe('Phase 11.C — Table merge/split', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.oe-toolbar');
    await page.locator('.oe-editor').click();
  });

  test('drag-select highlights a rectangular range of cells', async ({ page }) => {
    await seedTable(page, 2, 2);
    await dragSelect(page, 0, 3); // (0,0) → (1,1)
    const selected = await page.locator('.oe-cell--selected').count();
    expect(selected).toBe(4);
  });

  test('right-click a selected range → Merge cells merges them', async ({ page }) => {
    await seedTable(page, 2, 2);
    await dragSelect(page, 0, 1); // select the top row (2 cells)
    // Right-click on the first (still-selected) cell.
    await page.locator('.oe-editor td').first().click({ button: 'right' });
    await page.waitForSelector('.oe-menu', { state: 'visible' });
    await page.locator('.oe-menu').getByText('Merge cells', { exact: true }).click();
    await page.waitForTimeout(80);
    const colspan = await page.evaluate(() =>
      document.querySelector('.oe-editor td').getAttribute('colspan'));
    expect(colspan).toBe('2');
  });

  test('right-click → Split cell vertically adds a column', async ({ page }) => {
    await seedTable(page, 2, 2);
    await page.locator('.oe-editor td').first().click({ button: 'right' });
    await page.waitForSelector('.oe-menu', { state: 'visible' });
    await page.locator('.oe-menu').getByText('Split cell vertically', { exact: true }).click();
    await page.waitForTimeout(80);
    expect(await dims(page)).toEqual({ rows: 2, cols: 3 });
  });

  test('merged cell survives getHTML with colspan', async ({ page }) => {
    await seedTable(page, 2, 2);
    await dragSelect(page, 0, 1);
    await page.locator('.oe-editor td').first().click({ button: 'right' });
    await page.waitForSelector('.oe-menu', { state: 'visible' });
    await page.locator('.oe-menu').getByText('Merge cells', { exact: true }).click();
    await page.waitForTimeout(80);
    const html = await page.evaluate(() => window.__openEditorInstance.getHTML());
    expect(html).toContain('colspan="2"');
  });
});
