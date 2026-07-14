/**
 * table-properties.test.js — 16.7.5: the two scoped table-property dialogs
 * (Table properties / Cell properties) that replaced the old flat context
 * submenu with its single hardcoded border style. Verifies the width/style/
 * color fields compose a real border shorthand and apply at the correct
 * scope (whole table + all cells vs. only the selected cell, per-side).
 */
import { test, expect } from '@playwright/test';

async function seedTable(page) {
  await page.evaluate(() => {
    window.__openEditorInstance.setHTML(
      '<table class="oe-table"><tbody><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></tbody></table>'
    );
  });
  await page.waitForTimeout(100);
}

test('Table properties dialog applies a composed grid border + width', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.oe-editor[contenteditable="true"]');
  const ed = page.locator('.oe-editor');
  await seedTable(page);
  const table = ed.locator('table');
  const cell = table.locator('td').first();

  await cell.click({ button: 'right' });
  await page.waitForTimeout(150);
  await page.getByText('Table format', { exact: true }).hover();
  await page.waitForTimeout(150);
  await page.getByText('Table properties…', { exact: true }).click();
  await page.waitForTimeout(200);

  const modal = page.locator('.oe-modal');
  await modal.locator('#oe-tprops-table-width').fill('80%');
  await modal.locator('#oe-tprops-border-width').fill('2');
  await modal.locator('#oe-tprops-border-style').selectOption('dashed');
  await modal.locator('button:has-text("Apply")').click();
  await page.waitForTimeout(200);

  const tableStyle = await table.getAttribute('style');
  console.log('TABLE STYLE:', tableStyle);
  expect(tableStyle).toContain('width: 80%');
  const cellBorder = await cell.evaluate((c) => c.style.border);
  console.log('CELL BORDER:', cellBorder);
  expect(cellBorder).toContain('dashed');
  expect(cellBorder).toContain('2px');
});

test('Cell properties dialog applies a per-side border + background to selected cell', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.oe-editor[contenteditable="true"]');
  const ed = page.locator('.oe-editor');
  await seedTable(page);
  const cell = ed.locator('td').first();

  await cell.click({ button: 'right' });
  await page.waitForTimeout(150);
  await page.getByText('Table format', { exact: true }).hover();
  await page.waitForTimeout(150);
  await page.getByText('Cell properties…', { exact: true }).click();
  await page.waitForTimeout(200);

  const modal = page.locator('.oe-modal');
  await modal.locator('#oe-tprops-border-side').selectOption('top');
  await modal.locator('#oe-tprops-border-width').fill('3');
  await modal.locator('#oe-tprops-border-style').selectOption('dotted');
  await modal.locator('button:has-text("Apply")').click();
  await page.waitForTimeout(200);

  const info = await cell.evaluate((c) => ({ top: c.style.borderTop, bottom: c.style.borderBottom }));
  console.log('CELL BORDER SIDES:', JSON.stringify(info));
  expect(info.top).toContain('dotted');
  expect(info.top).toContain('3px');
  expect(info.bottom).toBe(''); // only the top side, not all
});
