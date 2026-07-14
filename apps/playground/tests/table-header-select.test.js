/**
 * table-header-select.test.js — 16.7.6: click the thin top edge of a
 * first-row cell to select the whole column, or the left edge of a
 * first-column cell to select the whole row (CKEditor/Jodit "click a header"
 * pattern), reusing the existing rectangular-range selection machinery.
 * An interior click must NOT trigger it.
 */
import { test, expect } from '@playwright/test';

async function seedTable(page) {
  await page.evaluate(() => {
    window.__openEditorInstance.setHTML(
      '<table class="oe-table"><tbody>' +
      '<tr><td>a1</td><td>b1</td><td>c1</td></tr>' +
      '<tr><td>a2</td><td>b2</td><td>c2</td></tr>' +
      '<tr><td>a3</td><td>b3</td><td>c3</td></tr>' +
      '</tbody></table>'
    );
  });
  await page.waitForTimeout(100);
}

test('clicking the top edge of a first-row cell selects the whole column', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.oe-editor[contenteditable="true"]');
  const ed = page.locator('.oe-editor');
  await seedTable(page);
  // Middle column's top cell (b1).
  const cell = ed.locator('tr:first-child td:nth-child(2)');
  const box = await cell.boundingBox();
  // Click 3px below the top edge — the column header strip.
  await page.mouse.click(box.x + box.width / 2, box.y + 3);
  await page.waitForTimeout(120);
  const selectedCount = await page.evaluate(() =>
    document.querySelectorAll('.oe-editor .oe-cell--selected').length);
  console.log('SELECTED (column click):', selectedCount);
  expect(selectedCount).toBe(3);
  // All selected cells are in column index 1.
  const allCol1 = await page.evaluate(() =>
    [...document.querySelectorAll('.oe-editor .oe-cell--selected')].every((c) => c.cellIndex === 1));
  expect(allCol1).toBe(true);
});

test('clicking the left edge of a first-column cell selects the whole row', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.oe-editor[contenteditable="true"]');
  const ed = page.locator('.oe-editor');
  await seedTable(page);
  // Second row's first cell (a2).
  const cell = ed.locator('tr:nth-child(2) td:first-child');
  const box = await cell.boundingBox();
  await page.mouse.click(box.x + 3, box.y + box.height / 2);
  await page.waitForTimeout(120);
  const selectedCount = await page.evaluate(() =>
    document.querySelectorAll('.oe-editor .oe-cell--selected').length);
  console.log('SELECTED (row click):', selectedCount);
  expect(selectedCount).toBe(3);
});

test('clicking the interior of a cell does NOT select a whole column/row', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.oe-editor[contenteditable="true"]');
  const ed = page.locator('.oe-editor');
  await seedTable(page);
  const cell = ed.locator('tr:first-child td:first-child');
  const box = await cell.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(120);
  const selectedCount = await page.evaluate(() =>
    document.querySelectorAll('.oe-editor .oe-cell--selected').length);
  console.log('SELECTED (interior click):', selectedCount);
  expect(selectedCount).toBe(0);
});
