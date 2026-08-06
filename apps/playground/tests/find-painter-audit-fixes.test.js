/**
 * find-painter-audit-fixes.test.js — live proof (Chromium/Firefox/WebKit) for the
 * find-replace + format-painter deep-audit fixes:
 *   FR1/FR2 the replace row is REACHABLE from the find panel (toggle) and a
 *           replace actually swaps text
 *   FP1     format painter copies COLOR (not just bold/italic) onto a new selection
 *   FP3     typing disarms an armed painter
 */
import { test, expect } from '@playwright/test';

const isMac = process.platform === 'darwin';
const MOD = isMac ? 'Meta' : 'Control';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.oe-toolbar');
});

test('FR1/FR2: reveal Replace from the find panel and replace text', async ({ page }) => {
  await page.evaluate(() => window.__openEditorInstance.setHTML('<p>cat cat cat</p>'));
  await page.locator('.oe-editor').click();
  // Open Find (find-only mode) via the toolbar button.
  await page.locator('button[aria-label="Find and replace" i]').click();
  await expect(page.locator('.oe-find')).toBeVisible();
  // The replace row starts hidden.
  await expect(page.locator('.oe-find__row--replace')).toBeHidden();
  // FR1: the toggle reveals it.
  await page.locator('.oe-find__toggle').click();
  await expect(page.locator('.oe-find__row--replace')).toBeVisible();
  // Type a query + replacement and Replace All.
  await page.locator('.oe-find__row:not(.oe-find__row--replace) .oe-find__input').fill('cat');
  await page.waitForTimeout(120);
  const rep = page.locator('.oe-find__row--replace .oe-find__input');
  await rep.fill('dog');
  await page.locator('button[aria-label="Replace all matches"]').click();
  await page.waitForTimeout(150);
  const text = await page.evaluate(() => window.__openEditorInstance.getText());
  expect(text).toContain('dog');
  expect(text).not.toContain('cat');
});

test('FR2: Enter in the replace field replaces the current match', async ({ page }) => {
  await page.evaluate(() => window.__openEditorInstance.setHTML('<p>foo bar foo</p>'));
  await page.locator('.oe-editor').click();
  await page.locator('button[aria-label="Find and replace" i]').click();
  await page.locator('.oe-find__toggle').click();
  await page.locator('.oe-find__row:not(.oe-find__row--replace) .oe-find__input').fill('foo');
  await page.waitForTimeout(120);
  const rep = page.locator('.oe-find__row--replace .oe-find__input');
  await rep.fill('X');
  await rep.press('Enter'); // FR2: Enter in the replace box replaces
  await page.waitForTimeout(120);
  const text = await page.evaluate(() => window.__openEditorInstance.getText());
  expect(text).toContain('X'); // at least one foo replaced
});

test('FP1: format painter copies COLOR onto a new selection', async ({ page }) => {
  await page.evaluate(() =>
    window.__openEditorInstance.setHTML('<p><span style="color: rgb(220, 20, 60)">src</span> target</p>'));
  // Put the caret inside the colored "src".
  await page.evaluate(() => {
    const s = document.querySelector('.oe-editor span');
    const r = document.createRange(); r.setStart(s.firstChild, 1); r.collapse(true);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
    document.querySelector('.oe-editor').focus();
  });
  // Arm the painter.
  await page.locator('button[aria-label="Format painter" i]').click();
  await page.waitForTimeout(80);
  // Select "target" and mouseup to paint (simulate via a real range + mouseup event).
  await page.evaluate(() => {
    const p = document.querySelector('.oe-editor p');
    const targetText = p.childNodes[p.childNodes.length - 1]; // " target"
    const r = document.createRange();
    r.setStart(targetText, 1); r.setEnd(targetText, 7); // "target"
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
    document.querySelector('.oe-editor').dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  await page.waitForTimeout(120);
  // "target" now sits in a span carrying the crimson color.
  const painted = await page.evaluate(() => {
    const spans = [...document.querySelectorAll('.oe-editor span[style*="color"]')];
    return spans.some((s) => s.textContent.includes('target')
      && s.style.color.replace(/\s/g, '') === 'rgb(220,20,60)');
  });
  expect(painted).toBe(true);
});

test('FP3: typing disarms an armed painter', async ({ page }) => {
  await page.evaluate(() =>
    window.__openEditorInstance.setHTML('<p><strong>bold</strong> plain</p>'));
  await page.evaluate(() => {
    const b = document.querySelector('.oe-editor strong');
    const r = document.createRange(); r.setStart(b.firstChild, 1); r.collapse(true);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
    document.querySelector('.oe-editor').focus();
  });
  const btn = page.locator('button[aria-label="Format painter" i]');
  await btn.click();
  await page.waitForTimeout(60);
  await expect(btn).toHaveAttribute('aria-pressed', 'true'); // armed
  await page.keyboard.type('x'); // FP3: typing cancels
  await page.waitForTimeout(80);
  await expect(btn).toHaveAttribute('aria-pressed', 'false'); // disarmed
});
