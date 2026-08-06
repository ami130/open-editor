/**
 * source-audit-fixes.test.js — live proof (Chromium/Firefox/WebKit) for the
 * source-view deep-audit fixes:
 *   S1 the Source toggle is refused (and disabled) while the editor is readonly
 *   S2 the formatting toolbar disables while Source view is open, re-enables on exit
 */
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.oe-editor[contenteditable="true"]');
});

test('S1: the Source button is disabled in readonly, and toggling it does nothing', async ({ page }) => {
  await page.evaluate(() => window.__openEditorInstance.setHTML('<p>hi</p>'));
  await page.evaluate(() => window.__openEditorInstance.setReadOnly(true));
  await page.waitForTimeout(80);
  const btn = page.locator('button[aria-label="Source code" i]');
  await expect(btn).toBeDisabled();
  // Even a direct plugin call must refuse to open source view in readonly.
  const openedSource = await page.evaluate(() => {
    const ed = window.__openEditorInstance;
    ed.plugins.get('source').toggle();
    return !!document.querySelector('.oe-source__textarea');
  });
  expect(openedSource).toBe(false);
  await page.evaluate(() => window.__openEditorInstance.setReadOnly(false));
});

test('S2: formatting buttons disable while Source view is open, re-enable on exit', async ({ page }) => {
  await page.evaluate(() => window.__openEditorInstance.setHTML('<p>hello</p>'));
  const boldBtn = page.locator('button[aria-label="Bold" i]').first();
  const sourceBtn = page.locator('button[aria-label="Source code" i]');
  await expect(boldBtn).toBeEnabled();
  await sourceBtn.click();
  await page.waitForTimeout(120);
  await expect(boldBtn).toBeDisabled();
  await expect(sourceBtn).toBeEnabled(); // must stay clickable to exit
  await sourceBtn.click(); // exit
  await page.waitForTimeout(120);
  await expect(boldBtn).toBeEnabled();
});
