/**
 * text-transformations.test.js — 17.5.2: autocorrect via REAL incremental
 * keystrokes (the 16.6.2 lesson: only true typing catches premature fires).
 */
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.oe-editor[contenteditable="true"]');
  await page.evaluate(() => window.__openEditorInstance.setHTML('<p></p>'));
  await page.click('.oe-editor');
});

async function text(page) {
  return page.evaluate(() => window.__openEditorInstance.getText());
}

test('(c) becomes © as the paren closes; typing continues cleanly', async ({ page }) => {
  await page.keyboard.type('copyright (c) 2026');
  expect(await text(page)).toContain('copyright © 2026');
  expect(await text(page)).not.toContain('(c)');
});

test('1/2 converts on the following space — but 11/2 and 1/25 never do', async ({ page }) => {
  await page.keyboard.type('add 1/2 cup');
  expect(await text(page)).toContain('add ½ cup');
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a');
  await page.keyboard.type('lot 11/2 and 1/25 left');
  const t = await text(page);
  expect(t).toContain('11/2');
  expect(t).toContain('1/25');
  expect(t).not.toContain('½');
});

test('-- and --- become dashes on space; ---- is left alone', async ({ page }) => {
  await page.keyboard.type('a -- b');
  expect(await text(page)).toContain('a – b');
  await page.keyboard.type(' then --- c');
  expect(await text(page)).toContain('— c');
  await page.keyboard.type(' and ---- d');
  expect(await text(page)).toContain('---- d');
});

test('smart quotes and apostrophes pair correctly while typing', async ({ page }) => {
  await page.keyboard.type('she said "hi" and don\'t');
  const t = await text(page);
  expect(t).toContain('“hi”');
  expect(t).toContain('don’t');
});

test('inside a code block, quotes and dashes stay literal', async ({ page }) => {
  await page.evaluate(() => window.__openEditorInstance.setHTML('<pre><code>x</code></pre>'));
  const code = page.locator('.oe-editor code');
  await code.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' s = "raw" -- ok');
  const html = await page.evaluate(() => window.__openEditorInstance.getHTML());
  expect(html).toContain('"raw"');
  expect(html).toContain('--');
  expect(html).not.toContain('“');
  expect(html).not.toContain('–');
});

test('one undo restores the literal characters', async ({ page }) => {
  await page.keyboard.type('brand (tm)');
  expect(await text(page)).toContain('brand ™');
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
  expect(await text(page)).toContain('brand (tm)');
});
