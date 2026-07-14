/**
 * status-selection-count.test.js — 16.7.9: the status bar shows a
 * selection-scoped word/char count while a non-collapsed selection exists, and
 * reverts to the whole-document count when the selection collapses. Reuses the
 * existing count path (StatusBar._render, driven by the selectionChange event).
 */
import { test, expect } from '@playwright/test';

test('status bar switches to a selection-scoped count and back', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.oe-editor[contenteditable="true"]');
  await page.evaluate(() =>
    window.__openEditorInstance.setHTML('<p>alpha beta gamma delta epsilon</p>'));
  await page.waitForTimeout(80);

  const bar = page.locator('.oe-statusbar');
  await expect(bar).toBeVisible();
  // Whole-document count first — 5 words, no "selected".
  await expect(bar).toContainText('5 words');
  await expect(bar).not.toContainText('selected');

  // Select the entire paragraph via the DOM range + fire selectionchange.
  await page.evaluate(() => {
    const p = document.querySelector('.oe-editor p');
    const r = document.createRange();
    r.selectNodeContents(p);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await page.waitForTimeout(80);
  // Now the scoped readout: 5 words selected.
  await expect(bar).toContainText('5 words');
  await expect(bar).toContainText('selected');

  // Collapse the selection → reverts to the document count, no "selected".
  await page.evaluate(() => {
    const s = window.getSelection();
    s.collapseToEnd();
    document.dispatchEvent(new Event('selectionchange'));
  });
  await page.waitForTimeout(80);
  await expect(bar).toContainText('5 words');
  await expect(bar).not.toContainText('selected');
});

test('selecting only part of the text counts only the selected words', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.oe-editor[contenteditable="true"]');
  await page.evaluate(() =>
    window.__openEditorInstance.setHTML('<p>one two three four five six</p>'));
  await page.waitForTimeout(80);

  // Select the first two words ("one two") by ranging over the first 7 chars.
  await page.evaluate(() => {
    const textNode = document.querySelector('.oe-editor p').firstChild;
    const r = document.createRange();
    r.setStart(textNode, 0);
    r.setEnd(textNode, 7); // "one two"
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await page.waitForTimeout(80);

  const bar = page.locator('.oe-statusbar');
  await expect(bar).toContainText('2 words');
  await expect(bar).toContainText('selected');
});
