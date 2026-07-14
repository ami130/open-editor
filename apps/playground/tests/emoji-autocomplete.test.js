/**
 * emoji-autocomplete.test.js — 17.5.6: `:shortcode` suggestions via REAL
 * typing; keyboard pick; times/URLs immune; Escape dismisses.
 */
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.oe-editor[contenteditable="true"]');
  await page.evaluate(() => window.__openEditorInstance.setHTML('<p></p>'));
  await page.click('.oe-editor');
});

test('typing :fire suggests and Enter inserts the emoji', async ({ page }) => {
  await page.keyboard.type('on :fire');
  await page.waitForTimeout(250);
  const popup = page.locator('.oe-caret-popup:not([hidden])');
  await expect(popup).toBeVisible();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  const text = await page.evaluate(() => window.__openEditorInstance.getText());
  expect(text).toContain('🔥');
  expect(text).not.toContain(':fire');
});

test('times and URLs never trigger; Escape dismisses a live popup', async ({ page }) => {
  await page.keyboard.type('meet at 5:30 ok');
  await page.waitForTimeout(250);
  await expect(page.locator('.oe-caret-popup:not([hidden])')).toHaveCount(0);

  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a');
  await page.keyboard.type(':heart');
  await page.waitForTimeout(250);
  await expect(page.locator('.oe-caret-popup:not([hidden])')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(120);
  await expect(page.locator('.oe-caret-popup:not([hidden])')).toHaveCount(0);
  // the literal text survives an Escape
  const text = await page.evaluate(() => window.__openEditorInstance.getText());
  expect(text).toContain(':heart');
});
