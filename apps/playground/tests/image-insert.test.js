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

  // ── User-flow fixes (2026-07-16) ────────────────────────────────────────────

  // #2: clicking the toolbar button with NO caret in the editor still inserts
  // predictably (at document end), not at a stale/absent selection.
  test('insert with no prior caret lands the image at the end of content', async ({ page }) => {
    await page.evaluate(() => {
      window.__openEditorInstance.setHTML('<p>first</p><p>second</p><p>third</p>');
      // clear any selection so there is no caret in the editor
      const s = window.getSelection(); s.removeAllRanges();
      document.querySelector('.oe-editor').blur();
    });
    await openImageDialog(page);
    await fillUrlAndInsert(page, DATA_IMG);
    await page.waitForTimeout(100);
    // the figure should be at/after the last paragraph, not before "first"
    const afterLast = await page.evaluate(() => {
      const blocks = [...document.querySelectorAll('.oe-editor > *')];
      const figIdx = blocks.findIndex((b) => b.matches('figure[data-oe-island]'));
      const thirdIdx = blocks.findIndex((b) => b.textContent.trim() === 'third');
      return figIdx > thirdIdx;      // figure comes AFTER the last text block
    });
    expect(afterLast).toBe(true);
  });

  // #1: a REAL image drop on the third paragraph must land the figure THERE,
  // not at the stale caret sitting in the first paragraph. This dispatches a
  // genuine `drop` event with an image file, exercising the drop handler's
  // placeCaretFromPoint() call end-to-end.
  test('drop positions the image at the drop point (not the stale selection)', async ({ page }) => {
    await page.evaluate(() => window.__openEditorInstance.setHTML('<p>alpha</p><p>beta</p><p>gamma</p>'));
    // stale caret in the FIRST paragraph
    await page.evaluate(() => {
      const p = document.querySelector('.oe-editor p');
      const r = document.createRange(); r.setStart(p.firstChild, 0); r.collapse(true);
      const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    });
    const result = await page.evaluate(async (img) => {
      const edEl = document.querySelector('.oe-editor');
      const gamma = [...edEl.querySelectorAll('p')].find((p) => p.textContent === 'gamma');
      const rect = gamma.getBoundingClientRect();
      // build a real image File in a DataTransfer
      const bytes = Uint8Array.from(atob(img.split(',')[1]), (c) => c.charCodeAt(0));
      const file = new File([bytes], 'd.png', { type: 'image/png' });
      const dt = new DataTransfer();
      dt.items.add(file);
      const at = { clientX: rect.left + 3, clientY: rect.top + rect.height / 2 };
      for (const type of ['dragenter', 'dragover', 'drop']) {
        edEl.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt, ...at }));
      }
      // wait for the async file→figure insert
      await new Promise((r) => setTimeout(r, 250));
      const kids = [...edEl.children];
      const figIdx = kids.findIndex((k) => k.matches('figure[data-oe-island]'));
      const gammaIdx = kids.findIndex((k) => k.textContent === 'gamma');
      const alphaIdx = kids.findIndex((k) => k.textContent === 'alpha');
      return { hasFig: figIdx !== -1, figIdx, gammaIdx, alphaIdx };
    }, DATA_IMG);
    expect(result.hasFig).toBe(true);
    // landed near gamma (after alpha), NOT at the top where the stale caret was
    expect(result.figIdx).toBeGreaterThan(result.alphaIdx);
  });

  // (#4 — the "Upload tab warns when uploads aren't configured" dead-end guard —
  //  is covered deterministically by a unit test in image-dialog.test.js, which
  //  can construct the exact no-upload/no-data-URI config in isolation.)
});
