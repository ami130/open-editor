/**
 * Phase 11.A e2e — insert a table via the toolbar grid-picker.
 * Covers: toolbar button opens the picker, hovering + clicking a cell inserts a
 * clean <table> with the chosen dimensions and a <colgroup>, cursor lands in it.
 */
import { test, expect } from '@playwright/test';

test.describe('Phase 11 — Table insert', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.oe-toolbar');
    await page.locator('.oe-editor').click();
  });

  async function openPicker(page) {
    const btn = page.locator('[title="Insert Table"], [aria-label="Insert Table"]').first();
    await btn.click();
    await page.waitForSelector('.oe-table-picker', { state: 'visible' });
  }

  test('toolbar button opens the grid picker', async ({ page }) => {
    await openPicker(page);
    const count = await page.locator('.oe-table-picker__cell').count();
    expect(count).toBe(80); // 8 x 10 default grid
  });

  test('picking 3x2 inserts a 3-row, 2-col table with a colgroup', async ({ page }) => {
    await page.evaluate(() => window.__openEditorInstance.setHTML('<p>seed</p>'));
    await page.locator('.oe-editor').click();
    await openPicker(page);
    // The cell with aria-label "3 by 2" → 3 rows, 2 cols.
    await page.locator('.oe-table-picker__cell[aria-label="3 by 2"]').first().click();
    await page.waitForTimeout(120);
    const dims = await page.evaluate(() => {
      const t = document.querySelector('.oe-editor table');
      if (!t) return null;
      return {
        rows: t.querySelectorAll('tbody tr').length,
        cols: t.querySelectorAll('tbody tr:first-child td').length,
        cols_in_colgroup: t.querySelectorAll('colgroup col').length,
      };
    });
    expect(dims).toEqual({ rows: 3, cols: 2, cols_in_colgroup: 2 });
  });

  test('inserted table survives getHTML with colgroup intact', async ({ page }) => {
    await openPicker(page);
    await page.locator('.oe-table-picker__cell[aria-label="2 by 2"]').first().click();
    await page.waitForTimeout(120);
    const html = await page.evaluate(() => window.__openEditorInstance.getHTML());
    expect(html).toContain('<table');
    expect(html).toContain('<colgroup>');
    expect(html).toContain('</table>');
  });

  test('cancelling the picker inserts nothing', async ({ page }) => {
    await openPicker(page);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    const has = await page.evaluate(() => !!document.querySelector('.oe-editor table'));
    expect(has).toBe(false);
  });
});
