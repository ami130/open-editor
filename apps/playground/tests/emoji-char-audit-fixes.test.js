/**
 * emoji-char-audit-fixes.test.js — live proof (Chromium/Firefox/WebKit) for the
 * emoji + special-char deep-audit fixes that are behaviour-dependent:
 *   E1 emoji autocomplete insert is undoable in ONE step
 *   E3 emoji autocomplete does NOT trigger inside a code block
 *   E4 Tab accepts the active emoji (like Enter)
 */
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.oe-editor[contenteditable="true"]');
});

test('E1: a picked emoji is undoable back to the :query text', async ({ page }) => {
  await page.evaluate(() => window.__openEditorInstance.setHTML('<p></p>'));
  await page.click('.oe-editor');
  await page.keyboard.type('on :fire');
  await page.waitForTimeout(250);
  await expect(page.locator('.oe-caret-popup:not([hidden])')).toBeVisible();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => window.__openEditorInstance.getText())).toContain('🔥');
  // One undo restores the ":fire" text (regression: the direct nodeValue write
  // fired no input event, so undo used to skip past the whole insert).
  await page.evaluate(() => window.__openEditorInstance.undo());
  await page.waitForTimeout(120);
  const text = await page.evaluate(() => window.__openEditorInstance.getText());
  expect(text).toContain(':fire');
  expect(text).not.toContain('🔥');
});

test('E3: no emoji popup inside a code block', async ({ page }) => {
  await page.evaluate(() =>
    window.__openEditorInstance.setHTML('<pre><code>x</code></pre>'));
  // Put the caret at the end of the code text and type a shortcode.
  await page.evaluate(() => {
    const code = document.querySelector('.oe-editor code');
    const n = code.firstChild;
    const r = document.createRange(); r.setStart(n, n.length); r.collapse(true);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    document.querySelector('.oe-editor').focus();
  });
  await page.keyboard.type(' :fire');
  await page.waitForTimeout(250);
  await expect(page.locator('.oe-caret-popup:not([hidden])')).toHaveCount(0);
  // The literal text stays (not replaced by an emoji).
  expect(await page.evaluate(() => window.__openEditorInstance.getText())).toContain(':fire');
});

test('E4: Tab accepts the active emoji', async ({ page }) => {
  await page.evaluate(() => window.__openEditorInstance.setHTML('<p></p>'));
  await page.click('.oe-editor');
  await page.keyboard.type('go :fire');
  await page.waitForTimeout(250);
  await expect(page.locator('.oe-caret-popup:not([hidden])')).toBeVisible();
  await page.keyboard.press('Tab');
  await page.waitForTimeout(150);
  const text = await page.evaluate(() => window.__openEditorInstance.getText());
  expect(text).toContain('🔥');
  expect(text).not.toContain(':fire');
});
