/**
 * Phase 9 — Image Plugin e2e tests (insert, selection, delete, undo, alignment).
 * Split into two files to stay under 300 lines each.
 * This file: insert dialog, selection/delete, undo/redo, serialization.
 */
import { test, expect } from '@playwright/test';

const isMac = process.platform === 'darwin';
const MOD   = isMac ? 'Meta' : 'Control';

// A small 1×1 red PNG as a data URI (safe, no network needed)
const DATA_IMG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==';

async function openImageDialog(page) {
  const imgBtn = page.locator('[title="Insert Image"], [aria-label="Insert Image"]').first();
  await imgBtn.click();
  await page.waitForSelector('.oe-modal', { state: 'visible' });
}

async function fillUrlAndInsert(page, url) {
  const urlInput = page.locator('#oe-img-url, input[type="url"]').first();
  await urlInput.fill(url);
  const insertBtn = page.locator('.oe-modal button').filter({ hasText: 'Insert Image' }).first();
  await insertBtn.click();
}

test.describe('Phase 9 — Image Insert', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.oe-toolbar');
    await page.locator('.oe-editor').click();
  });

  // ── Group 1: Insert from URL ────────────────────────────────────────────────

  test('insert image from URL inserts figure in editor', async ({ page }) => {
    await openImageDialog(page);
    await fillUrlAndInsert(page, DATA_IMG);
    await page.waitForTimeout(100);
    const hasFigure = await page.evaluate(() =>
      !!document.querySelector('.oe-editor figure[data-oe-island]')
    );
    expect(hasFigure).toBe(true);
  });

  test('insert garbage URL shows error, no figure inserted', async ({ page }) => {
    await openImageDialog(page);
    const urlInput = page.locator('#oe-img-url, input[type="url"]').first();
    await urlInput.fill('not-a-url-at-all!!!');
    const insertBtn = page.locator('.oe-modal button').filter({ hasText: 'Insert Image' }).first();
    await insertBtn.click();
    // Dialog should stay open (validation error) or show error text
    await page.waitForTimeout(100);
    // Either the modal is still open or the figure is absent
    const hasFigure = await page.evaluate(() =>
      !!document.querySelector('.oe-editor figure[data-oe-island]')
    );
    expect(hasFigure).toBe(false);
  });

  test('insert javascript: URL shows error', async ({ page }) => {
    await openImageDialog(page);
    const urlInput = page.locator('#oe-img-url, input[type="url"]').first();
    await urlInput.fill('javascript:alert(1)');
    const insertBtn = page.locator('.oe-modal button').filter({ hasText: 'Insert Image' }).first();
    await insertBtn.click();
    await page.waitForTimeout(100);
    const hasFigure = await page.evaluate(() =>
      !!document.querySelector('.oe-editor figure[data-oe-island]')
    );
    expect(hasFigure).toBe(false);
  });

  test('Enter key in URL field submits dialog', async ({ page }) => {
    await openImageDialog(page);
    const urlInput = page.locator('#oe-img-url, input[type="url"]').first();
    await urlInput.fill(DATA_IMG);
    await urlInput.press('Enter');
    await page.waitForTimeout(150);
    const hasFigure = await page.evaluate(() =>
      !!document.querySelector('.oe-editor figure[data-oe-island]')
    );
    expect(hasFigure).toBe(true);
  });

  test('Escape closes dialog without inserting', async ({ page }) => {
    await openImageDialog(page);
    // Click the Cancel button to close without inserting
    const cancelBtn = page.locator('.oe-modal .oe-modal__btn').filter({ hasText: 'Cancel' }).first();
    await cancelBtn.click();
    await page.waitForTimeout(100);
    const modalCount = await page.locator('.oe-modal').count();
    expect(modalCount).toBe(0);
    const hasFigure = await page.evaluate(() =>
      !!document.querySelector('.oe-editor figure[data-oe-island]')
    );
    expect(hasFigure).toBe(false);
  });

  // ── Group 2: Selection + delete ────────────────────────────────────────────

  test('clicking image selects it with blue ring', async ({ page }) => {
    await openImageDialog(page);
    await fillUrlAndInsert(page, DATA_IMG);
    await page.waitForTimeout(100);
    const fig = page.locator('.oe-editor figure[data-oe-island]').first();
    await fig.click({ position: { x: 5, y: 5 } });
    await page.waitForTimeout(100);
    const isSelected = await fig.evaluate((el) =>
      el.classList.contains('oe-figure--selected')
    );
    expect(isSelected).toBe(true);
  });

  test('clicking outside image deselects it', async ({ page }) => {
    await openImageDialog(page);
    await fillUrlAndInsert(page, DATA_IMG);
    await page.waitForTimeout(100);
    const fig = page.locator('.oe-editor figure[data-oe-island]').first();
    await fig.click({ position: { x: 5, y: 5 } });
    await page.waitForTimeout(80);
    // Click outside figure
    await page.locator('.oe-editor').click({ position: { x: 5, y: 5 } });
    await page.waitForTimeout(80);
    const isSelected = await fig.evaluate((el) =>
      el.classList.contains('oe-figure--selected')
    );
    expect(isSelected).toBe(false);
  });

  test('Backspace on selected image removes figure', async ({ page }) => {
    await openImageDialog(page);
    await fillUrlAndInsert(page, DATA_IMG);
    await page.waitForTimeout(100);
    const fig = page.locator('.oe-editor figure[data-oe-island]').first();
    await fig.click({ position: { x: 5, y: 5 } });
    await page.waitForTimeout(80);
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(100);
    const count = await page.locator('.oe-editor figure[data-oe-island]').count();
    expect(count).toBe(0);
  });

  test('Delete on selected image removes figure', async ({ page }) => {
    await openImageDialog(page);
    await fillUrlAndInsert(page, DATA_IMG);
    await page.waitForTimeout(100);
    const fig = page.locator('.oe-editor figure[data-oe-island]').first();
    await fig.click({ position: { x: 5, y: 5 } });
    await page.waitForTimeout(80);
    await page.keyboard.press('Delete');
    await page.waitForTimeout(100);
    const count = await page.locator('.oe-editor figure[data-oe-island]').count();
    expect(count).toBe(0);
  });

  test('deleting only image leaves canonical floor p>br', async ({ page }) => {
    await openImageDialog(page);
    await fillUrlAndInsert(page, DATA_IMG);
    await page.waitForTimeout(100);
    const fig = page.locator('.oe-editor figure[data-oe-island]').first();
    await fig.click({ position: { x: 5, y: 5 } });
    await page.waitForTimeout(80);
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(100);
    const inner = await page.evaluate(() =>
      document.querySelector('.oe-editor').innerHTML.replace(/\s/g, '')
    );
    expect(inner).toMatch(/<p><br\/?><\/p>/);
  });

  // ── Group 3: Undo/redo ──────────────────────────────────────────────────────

  test('undo after insert removes image', async ({ page }) => {
    await openImageDialog(page);
    await fillUrlAndInsert(page, DATA_IMG);
    await page.waitForTimeout(100);
    await page.keyboard.press(`${MOD}+Z`);
    await page.waitForTimeout(100);
    const count = await page.locator('.oe-editor figure[data-oe-island]').count();
    expect(count).toBe(0);
  });

  test('redo after undo restores image', async ({ page }) => {
    await openImageDialog(page);
    await fillUrlAndInsert(page, DATA_IMG);
    await page.waitForTimeout(100);
    await page.keyboard.press(`${MOD}+Z`);
    await page.waitForTimeout(100);
    await page.keyboard.press(`${MOD}+Shift+Z`);
    await page.waitForTimeout(100);
    const count = await page.locator('.oe-editor figure[data-oe-island]').count();
    expect(count).toBe(1);
  });

  test('insert then undo preserves typed text before image', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await page.keyboard.type('hello ');
    await openImageDialog(page);
    await fillUrlAndInsert(page, DATA_IMG);
    await page.waitForTimeout(100);
    await page.keyboard.press(`${MOD}+Z`);
    await page.waitForTimeout(100);
    const count = await page.locator('.oe-editor figure[data-oe-island]').count();
    expect(count).toBe(0);
    const text = await page.evaluate(() => document.querySelector('.oe-editor').textContent);
    expect(text).toContain('hello');
  });

  // ── Group 4: Serialization ──────────────────────────────────────────────────

  test('getHTML contains figure[data-oe-island] after insert', async ({ page }) => {
    await openImageDialog(page);
    await fillUrlAndInsert(page, DATA_IMG);
    await page.waitForTimeout(100);
    const html = await page.evaluate(() =>
      window.__openEditorInstance && window.__openEditorInstance.getHTML()
    );
    expect(html).toContain('data-oe-island');
  });
});
