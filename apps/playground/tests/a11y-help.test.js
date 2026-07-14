/**
 * a11y-help.test.js — 17.5.5: Alt+0 opens the shortcut reference live;
 * Escape closes it; rows come from the real registry.
 */
import { test, expect } from '@playwright/test';

test('Alt+0 opens the keyboard-shortcuts dialog; Escape closes it', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.oe-editor[contenteditable="true"]');
  await page.click('.oe-editor');
  await page.keyboard.press('Alt+0');
  await page.waitForTimeout(200);
  const table = page.locator('.oe-a11y-help__table');
  await expect(table).toBeVisible();
  await expect(table).toContainText('Bold');
  await expect(table).toContainText('Undo');
  const kbds = await page.locator('.oe-a11y-help kbd').count();
  expect(kbds).toBeGreaterThan(5);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  await expect(table).toHaveCount(0);
});
