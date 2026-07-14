/**
 * change-case.test.js — 17.5.1: the Case dropdown live. Select text, apply
 * UPPERCASE / Title Case via the real toolbar dropdown, verify markup
 * survives and undo reverts. (CKEditor premium / Jodit PRO feature — free here.)
 */
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.oe-editor[contenteditable="true"]');
});

test('UPPERCASE via the Case dropdown preserves inline markup', async ({ page }) => {
  await page.evaluate(() => window.__openEditorInstance.setHTML('<p>hello <strong>bold</strong> world</p>'));
  await page.click('.oe-editor');
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a');
  await page.click('.oe-tb__dd-trigger[aria-label="Case"]');
  await page.click('.oe-tb__dd-option:has-text("UPPERCASE")');
  await page.waitForTimeout(150);
  const html = await page.evaluate(() => window.__openEditorInstance.getHTML());
  expect(html).toBe('<p>HELLO <strong>BOLD</strong> WORLD</p>');
});

test('Title Case handles a word split by markup as one word', async ({ page }) => {
  await page.evaluate(() => window.__openEditorInstance.setHTML('<p>he<strong>llo</strong> world</p>'));
  await page.click('.oe-editor');
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a');
  await page.click('.oe-tb__dd-trigger[aria-label="Case"]');
  await page.click('.oe-tb__dd-option:has-text("Title Case")');
  await page.waitForTimeout(150);
  const html = await page.evaluate(() => window.__openEditorInstance.getHTML());
  expect(html).toBe('<p>He<strong>llo</strong> World</p>');
});

test('undo reverts a case change in one step', async ({ page }) => {
  await page.evaluate(() => window.__openEditorInstance.setHTML('<p>quiet text</p>'));
  await page.click('.oe-editor');
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a');
  await page.click('.oe-tb__dd-trigger[aria-label="Case"]');
  await page.click('.oe-tb__dd-option:has-text("UPPERCASE")');
  await page.waitForTimeout(150);
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
  await page.waitForTimeout(150);
  const html = await page.evaluate(() => window.__openEditorInstance.getHTML());
  expect(html).toContain('quiet text');
  expect(html).not.toContain('QUIET');
});
