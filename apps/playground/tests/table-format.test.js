/**
 * Phase 11.D e2e — the "Table format" submenu: header toggle + cell alignment.
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

test.describe('Phase 11.D — Table format menu', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.oe-toolbar');
    await page.locator('.oe-editor').click();
  });

  test('Table format → Toggle header row converts the first row to <th>', async ({ page }) => {
    await seedTable(page, 2, 2);
    await page.locator('.oe-editor td').first().click({ button: 'right' });
    await page.waitForSelector('.oe-menu', { state: 'visible' });
    // Hover the submenu parent, then click the item.
    await page.locator('.oe-menu').getByText('Table format', { exact: true }).hover();
    await page.waitForTimeout(80);
    await page.locator('.oe-menu').getByText('Toggle header row', { exact: true }).click();
    await page.waitForTimeout(80);
    const ths = await page.evaluate(() =>
      document.querySelectorAll('.oe-editor table tr:first-child th').length);
    expect(ths).toBe(2);
  });

  // 16.7.5 — cell alignment moved from a flat menu entry into the Cell
  // properties dialog (the "Horizontal align" select).
  test('Cell properties dialog centres the cell horizontally', async ({ page }) => {
    await seedTable(page, 1, 2);
    await page.locator('.oe-editor td').first().click({ button: 'right' });
    await page.waitForSelector('.oe-menu', { state: 'visible' });
    await page.locator('.oe-menu').getByText('Table format', { exact: true }).hover();
    await page.waitForTimeout(80);
    await page.locator('.oe-menu').getByText('Cell properties…', { exact: true }).click();
    await page.waitForTimeout(120);
    await page.locator('.oe-modal #oe-tprops-horizontal-align').selectOption('center');
    await page.locator('.oe-modal button:has-text("Apply")').click();
    await page.waitForTimeout(80);
    const align = await page.evaluate(() =>
      document.querySelector('.oe-editor td').style.textAlign);
    expect(align).toBe('center');
  });

  test('header toggle survives getHTML with scope', async ({ page }) => {
    await seedTable(page, 2, 2);
    await page.locator('.oe-editor td').first().click({ button: 'right' });
    await page.waitForSelector('.oe-menu', { state: 'visible' });
    await page.locator('.oe-menu').getByText('Table format', { exact: true }).hover();
    await page.waitForTimeout(80);
    await page.locator('.oe-menu').getByText('Toggle header row', { exact: true }).click();
    await page.waitForTimeout(80);
    const html = await page.evaluate(() => window.__openEditorInstance.getHTML());
    expect(html).toContain('<th');
    expect(html).toContain('scope="col"');
  });

  // 16.7.5 — per-side cell borders moved into the Cell properties dialog with
  // a real width/style/color picker (side defaults to "all").
  test('Cell properties dialog applies an all-sides border to the cell', async ({ page }) => {
    await seedTable(page, 1, 2);
    await page.locator('.oe-editor td').first().click({ button: 'right' });
    await page.waitForSelector('.oe-menu', { state: 'visible' });
    await page.locator('.oe-menu').getByText('Table format', { exact: true }).hover();
    await page.waitForTimeout(80);
    await page.locator('.oe-menu').getByText('Cell properties…', { exact: true }).click();
    await page.waitForTimeout(120);
    // Side defaults to "all"; width defaults to 1, style to solid.
    await page.locator('.oe-modal button:has-text("Apply")').click();
    await page.waitForTimeout(80);
    const border = await page.evaluate(() =>
      document.querySelector('.oe-editor td').style.border);
    expect(border).toContain('solid');
  });

  // 11.18 — table preset (extra class) chosen on insert.
  test('inserting with a preset applies the chosen class', async ({ page }) => {
    await page.locator('[title="Insert Table"], [aria-label="Insert Table"]').first().click();
    await page.waitForSelector('.oe-table-picker', { state: 'visible' });
    // The preset selector exists (config provides Bordered / Striped).
    await expect(page.locator('.oe-table-picker__preset')).toBeVisible();
    await page.locator('.oe-table-picker__preset').selectOption('table-bordered');
    await page.locator('.oe-table-picker__cell[aria-label="2 by 2"]').first().click();
    await page.waitForTimeout(100);
    const cls = await page.evaluate(() => {
      const t = document.querySelector('.oe-editor table');
      return t ? t.className : null;
    });
    expect(cls).toContain('table-bordered');
    expect(cls).toContain('oe-table'); // base class preserved
  });
});
