/**
 * show-blocks.test.js — 17.5.4: the toggle live — outlines render, labels
 * appear, content untouched, second click clears.
 */
import { test, expect } from '@playwright/test';

test('show blocks outlines blocks with tag labels, and toggles off clean', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.oe-editor[contenteditable="true"]');
  await page.evaluate(() => window.__openEditorInstance.setHTML('<h2>title</h2><p>body</p>'));
  const before = await page.evaluate(() => window.__openEditorInstance.getHTML());

  await page.click('.oe-tb__btn[data-name="showBlocks"]');
  await page.waitForTimeout(120);
  const on = await page.evaluate(() => {
    const p = document.querySelector('.oe-editor p');
    const cs = getComputedStyle(p);
    const label = getComputedStyle(document.querySelector('.oe-editor h2'), '::before').content;
    return { outline: cs.outlineStyle, label };
  });
  expect(on.outline).toBe('dashed');
  expect(on.label).toContain('H2');

  // content untouched
  expect(await page.evaluate(() => window.__openEditorInstance.getHTML())).toBe(before);

  await page.click('.oe-tb__btn[data-name="showBlocks"]');
  await page.waitForTimeout(120);
  const off = await page.evaluate(() => getComputedStyle(document.querySelector('.oe-editor p')).outlineStyle);
  expect(off).not.toBe('dashed');
});
