/**
 * source-highlight.test.js — 16.7.7: source view syntax highlighting via a
 * scroll-synced overlay (transparent-text textarea over a colored <pre>).
 * Verifies the colored token spans render, the textarea text is truly
 * transparent, live re-highlighting on edit, and that source edits still
 * re-enter through the sanitizer on exit (a typed <script> is stripped).
 */
import { test, expect } from '@playwright/test';

test('source view renders a colored highlight overlay behind the textarea', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.oe-editor[contenteditable="true"]');
  const ed = page.locator('.oe-editor');
  await ed.click();
  await page.evaluate(() => window.__openEditorInstance.setHTML('<p>hello <a href="https://x.com">world</a></p>'));
  await page.waitForTimeout(100);
  await page.locator('button[aria-label="Source code" i]').click();
  await page.waitForTimeout(150);

  const overlay = page.locator('.oe-source__highlight');
  await expect(overlay).toHaveCount(1);
  const ta = page.locator('.oe-source__textarea');
  await expect(ta).toHaveCount(1);

  // Overlay contains colored token spans for the tag/attr/string.
  const overlayHtml = await overlay.innerHTML();
  console.log('OVERLAY HTML:', overlayHtml.slice(0, 200));
  expect(overlayHtml).toContain('oe-hl-tag');
  expect(overlayHtml).toContain('oe-hl-attr');
  expect(overlayHtml).toContain('oe-hl-str');

  // The textarea's text is transparent (only caret shows); confirm via computed style.
  const fill = await ta.evaluate((t) => getComputedStyle(t).webkitTextFillColor || getComputedStyle(t).color);
  console.log('TEXTAREA TEXT FILL:', fill);
  expect(fill).toMatch(/rgba?\(0, 0, 0, 0\)|transparent/);
});

test('editing in source view re-highlights live', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.oe-editor[contenteditable="true"]');
  const ed = page.locator('.oe-editor');
  await ed.click();
  await page.evaluate(() => window.__openEditorInstance.setHTML('<p>x</p>'));
  await page.waitForTimeout(80);
  await page.locator('button[aria-label="Source code" i]').click();
  await page.waitForTimeout(120);
  const ta = page.locator('.oe-source__textarea');
  await ta.click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a');
  await page.keyboard.type('<strong>bold</strong>');
  await page.waitForTimeout(120);
  const overlayHtml = await page.locator('.oe-source__highlight').innerHTML();
  console.log('OVERLAY AFTER EDIT:', overlayHtml.slice(0, 200));
  expect(overlayHtml).toContain('oe-hl-tag');
  expect(overlayHtml).toContain('strong');
});

test('exiting source view applies edited HTML through the sanitizer', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.oe-editor[contenteditable="true"]');
  const ed = page.locator('.oe-editor');
  await ed.click();
  await page.evaluate(() => window.__openEditorInstance.setHTML('<p>x</p>'));
  await page.waitForTimeout(80);
  await page.locator('button[aria-label="Source code" i]').click();
  await page.waitForTimeout(120);
  const ta = page.locator('.oe-source__textarea');
  await ta.click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a');
  await page.keyboard.type('<p>edited <script>alert(1)</script></p>');
  await page.locator('button[aria-label="Source code" i]').click(); // exit
  await page.waitForTimeout(150);
  const html = await page.evaluate(() => window.__openEditorInstance.getHTML());
  console.log('HTML AFTER EXIT:', html);
  expect(html).toContain('edited');
  expect(html).not.toContain('<script>'); // sanitized on the way back
});
