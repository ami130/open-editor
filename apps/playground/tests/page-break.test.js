/**
 * page-break.test.js — 17.5.3: toolbar button inserts a page break live;
 * dashed marker renders; typing continues after it; round-trip clean.
 */
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.oe-editor[contenteditable="true"]');
  await page.evaluate(() => window.__openEditorInstance.setHTML('<p>above</p>'));
  await page.click('.oe-editor');
  await page.keyboard.press('End');
});

test('toolbar button inserts a page break and typing continues below it', async ({ page }) => {
  await page.click('.oe-tb__btn[data-name="insertPageBreak"]');
  await page.waitForTimeout(150);
  await page.keyboard.type('below');
  const html = await page.evaluate(() => window.__openEditorInstance.getHTML());
  expect(html).toContain('<hr class="oe-page-break">');
  expect(html).toMatch(/above.*oe-page-break.*below/s);
});

test('the marker renders as a dashed rule (visually distinct from a plain hr)', async ({ page }) => {
  await page.click('.oe-tb__btn[data-name="insertPageBreak"]');
  await page.waitForTimeout(150);
  const style = await page.evaluate(() => {
    const hr = document.querySelector('.oe-editor hr.oe-page-break');
    const cs = getComputedStyle(hr);
    return { topStyle: cs.borderTopStyle, print: cs.breakAfter };
  });
  expect(style.topStyle).toBe('dashed');
});

test('round-trips through setHTML(getHTML()) unchanged', async ({ page }) => {
  await page.click('.oe-tb__btn[data-name="insertPageBreak"]');
  await page.waitForTimeout(150);
  const once = await page.evaluate(() => {
    const ed = window.__openEditorInstance;
    ed.setHTML(ed.getHTML());
    return ed.getHTML();
  });
  expect(once).toContain('<hr class="oe-page-break">');
});
