/**
 * Phase 13 e2e — content plugins in a real browser: source-view toggle,
 * code block insert, special-characters + emoji grids, spellcheck toggle.
 */
import { test, expect } from '@playwright/test';

test.describe('Phase 13 — content plugins', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.oe-toolbar');
    await page.locator('.oe-editor').click();
  });

  test('Source code view toggles to a textarea and back, applying edits', async ({ page }) => {
    await page.evaluate(() => window.__openEditorInstance.setHTML('<p>hello</p>'));
    // enter source
    await page.locator('[title="Source code"], [aria-label="Source code"]').first().click();
    const ta = page.locator('.oe-source__textarea');
    await expect(ta).toBeVisible();
    await expect(ta).toHaveValue(/<p>/);
    // edit the source
    await ta.fill('<p>edited via source</p>');
    // exit source
    await page.locator('[title="Source code"], [aria-label="Source code"]').first().click();
    await expect(page.locator('.oe-source__textarea')).toHaveCount(0);
    await expect(page.locator('.oe-editor')).toContainText('edited via source');
  });

  test('Source view sanitizes a <script> typed in source mode', async ({ page }) => {
    await page.evaluate(() => window.__openEditorInstance.setHTML('<p>safe</p>'));
    await page.locator('[title="Source code"], [aria-label="Source code"]').first().click();
    await page.locator('.oe-source__textarea').fill('<p>x</p><script>window.__xss=1<\/script>');
    await page.locator('[title="Source code"], [aria-label="Source code"]').first().click();
    const scriptInDom = await page.evaluate(() => !!document.querySelector('.oe-editor script'));
    expect(scriptInDom).toBe(false);
    const xss = await page.evaluate(() => window.__xss);
    expect(xss).toBeUndefined();
  });

  test('Code block button inserts a <pre><code> with a language class', async ({ page }) => {
    await page.locator('[title="Code block"], [aria-label="Code block"]').first().click();
    await page.waitForSelector('.oe-codeblock-dialog', { state: 'visible' });
    await page.locator('.oe-codeblock-dialog__select').selectOption('javascript');
    // scope to the modal footer — "Insert" also appears on other toolbar buttons
    await page.locator('.oe-modal__btn', { hasText: 'Insert' }).click();
    await page.waitForTimeout(60);
    const hasCode = await page.evaluate(() => !!document.querySelector('.oe-editor pre > code.language-javascript'));
    expect(hasCode).toBe(true);
  });

  test('Special characters grid inserts a character', async ({ page }) => {
    await page.locator('[title="Special characters"], [aria-label="Special characters"]').first().click();
    await page.waitForSelector('.oe-chargrid', { state: 'visible' });
    const firstCell = page.locator('.oe-chargrid__cell').first();
    const ch = await firstCell.textContent();
    await firstCell.click();
    await page.waitForTimeout(50);
    await expect(page.locator('.oe-editor')).toContainText(ch.trim());
  });

  test('Spellcheck toggle flips the editable spellcheck attribute', async ({ page }) => {
    const before = await page.evaluate(() => document.querySelector('.oe-editor').getAttribute('spellcheck'));
    await page.locator('[title="Spellcheck"], [aria-label="Spellcheck"]').first().click();
    const after = await page.evaluate(() => document.querySelector('.oe-editor').getAttribute('spellcheck'));
    expect(after).not.toBe(before);
  });

  test('Special characters dialog is compact & organized: category select, footer, switching', async ({ page }) => {
    await page.locator('[title="Special characters"], [aria-label="Special characters"]').first().click();
    await page.waitForSelector('.oe-chargrid', { state: 'visible' });
    // a category SELECT (compact) present with several options
    const select = page.locator('.oe-chargrid__select');
    await expect(select).toBeVisible();
    expect(await select.locator('option').count()).toBeGreaterThanOrEqual(5);
    // slim footer present
    await expect(page.locator('.oe-chargrid__foot')).toBeVisible();
    // switching to Currency shows the Euro sign
    await select.selectOption({ label: 'Currency' });
    await page.waitForTimeout(50);
    const cellTexts = await page.locator('.oe-chargrid__cell').allTextContents();
    expect(cellTexts).toContain('€');
    // hovering a cell updates the footer name
    await page.locator('.oe-chargrid__cell').first().hover();
    await expect(page.locator('.oe-chargrid__foot-name')).not.toBeEmpty();
    // fills the modal body width (no fixed 300px pin) — the grid spans the
    // body's CONTENT box (body width minus its horizontal padding), and is much
    // wider than the old fixed 300px.
    const { gridW, contentW } = await page.evaluate(() => {
      const grid = document.querySelector('.oe-chargrid');
      const body = grid.closest('.oe-modal__body') || grid.parentElement;
      const cs = getComputedStyle(body);
      const contentW = body.getBoundingClientRect().width
        - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      return { gridW: grid.getBoundingClientRect().width, contentW };
    });
    expect(gridW).toBeGreaterThan(360);              // no longer pinned at 300px
    expect(Math.abs(gridW - contentW)).toBeLessThanOrEqual(2); // fills the body
  });

  test('Special characters search spans all categories', async ({ page }) => {
    await page.locator('[title="Special characters"], [aria-label="Special characters"]').first().click();
    await page.waitForSelector('.oe-chargrid', { state: 'visible' });
    await page.fill('.oe-chargrid__search', 'omega');   // a Greek char, not the default tab
    await page.waitForTimeout(50);
    const cells = await page.locator('.oe-chargrid__cell').allTextContents();
    expect(cells.join('')).toContain('Ω');
  });
});
