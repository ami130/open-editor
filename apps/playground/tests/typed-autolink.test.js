/**
 * typed-autolink.test.js — 16.7.2: typing a bare URL then Space/Enter wraps it
 * in a real <a>, matching CKEditor's live autolink (installPasteAutolink only
 * covered paste before this). Covers both trigger paths plus the guards that
 * must NOT fire (non-URL text, YouTube URLs claimed by media auto-embed,
 * inside a code block) and the exact text-fidelity bugs found while building
 * this (missing/misplaced separators around the new anchor).
 */
import { test, expect } from '@playwright/test';

test.describe('Typed-URL autolink (space trigger)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.oe-editor[contenteditable="true"]');
  });

  test('typing a bare URL then space auto-links it, preserving surrounding text exactly', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await page.keyboard.type('check https://example.com/page more');
    await page.waitForTimeout(150);
    await expect(ed.locator('a')).toHaveCount(1);
    expect(await ed.locator('a').getAttribute('href')).toBe('https://example.com/page');
    const text = await ed.locator('p').first().textContent();
    // Normalize the (possibly nbsp) separators to plain spaces for the compare.
    expect(text.replace(/[\s ]+/g, ' ')).toBe('check https://example.com/page more');
  });

  test('typing then continuing to type more text stays outside the new anchor', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await page.keyboard.type('https://example.com/x and then some extra words');
    await page.waitForTimeout(150);
    expect(await ed.locator('a').textContent()).toBe('https://example.com/x');
    const trailing = await ed.locator('a').evaluate((a) => a.nextSibling && a.nextSibling.textContent);
    expect(trailing.replace(/[\s ]+/g, ' ')).toContain('and then some extra words');
  });

  test('typing a non-URL word then space does NOT create a link', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await page.keyboard.type('hello world foo bar');
    await page.waitForTimeout(150);
    await expect(ed.locator('a')).toHaveCount(0);
  });

  test('typing a YouTube URL then space is claimed by media auto-embed, not autolink', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await page.keyboard.type('https://www.youtube.com/watch?v=dQw4w9WgXcQ ');
    await page.waitForTimeout(150);
    await expect(ed.locator('a')).toHaveCount(0);
  });

  test('bare email then space auto-links to a mailto: href', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await page.keyboard.type('contact mailto:test@example.com please');
    await page.waitForTimeout(150);
    await expect(ed.locator('a')).toHaveCount(1);
    expect(await ed.locator('a').getAttribute('href')).toBe('mailto:test@example.com');
  });

  test('does not trigger inside a code block', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await page.evaluate(() => window.__openEditorInstance.setHTML('<pre><code>x</code></pre>'));
    await page.waitForTimeout(80);
    await ed.locator('code').click();
    await page.keyboard.press('End');
    await page.keyboard.type(' https://example.com/page more');
    await page.waitForTimeout(150);
    await expect(ed.locator('a')).toHaveCount(0);
  });

  test('undo right after the autolink cleanly reverts it', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await page.keyboard.type('https://example.com/undo');
    await page.keyboard.press('Space');
    await page.waitForTimeout(150);
    await expect(ed.locator('a')).toHaveCount(1);
    await page.evaluate(() => window.__openEditorInstance.undo());
    await page.waitForTimeout(120);
    await expect(ed.locator('a')).toHaveCount(0);
  });
});

test.describe('Typed-URL autolink (Enter trigger)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.oe-editor[contenteditable="true"]');
  });

  test('typing a bare URL then Enter auto-links it and the new block stays independently editable', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await page.keyboard.type('https://example.com/page2');
    await page.keyboard.press('Enter');
    await page.keyboard.type('next line');
    await page.waitForTimeout(150);
    await expect(ed.locator('a')).toHaveCount(1);
    expect(await ed.locator('a').getAttribute('href')).toBe('https://example.com/page2');
    const paras = ed.locator('p');
    await expect(paras).toHaveCount(2);
    // REGRESSION: the cursor must stay in the NEW (second) block after the
    // Enter-triggered autolink — it was being moved back into the just-linked
    // first block, causing subsequent typing to land in the wrong paragraph.
    await expect(paras.nth(1)).toHaveText('next line');
  });

  test('typing a non-URL word then Enter does NOT create a link', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await page.keyboard.type('hello world');
    await page.keyboard.press('Enter');
    await page.keyboard.type('second line');
    await page.waitForTimeout(150);
    await expect(ed.locator('a')).toHaveCount(0);
  });
});
