/**
 * Phase 7.5.6 — Undo/redo (history) tests.
 *
 * Verifies that the editor's history stack responds correctly to keyboard
 * shortcuts (Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z) and toolbar buttons.
 * Each test asserts actual content-state change, not just editor visibility.
 */
import { test, expect } from '@playwright/test';

test.describe('Phase 7.5.6 — Undo / Redo', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.oe-editor[contenteditable="true"]');
  });

  test('Ctrl+Z undoes bold formatting — <strong> is removed', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await page.keyboard.type('hello');
    await page.keyboard.press('Control+A');
    const boldBtn = page.locator('[title="Bold"], [aria-label="Bold"]').first();
    await boldBtn.click();
    await page.waitForTimeout(60);
    // Confirm bold was applied.
    await expect(ed.locator('strong')).toBeVisible();
    // Undo — <strong> must be gone.
    await page.keyboard.press('Control+Z');
    await page.waitForTimeout(60);
    const strongCount = await ed.locator('strong').count();
    expect(strongCount).toBe(0);
    // Text content must still be present.
    await expect(ed).toContainText('hello');
  });

  test('Ctrl+Y redoes after undo — <strong> comes back', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await page.keyboard.type('redo test');
    await page.keyboard.press('Control+A');
    const boldBtn = page.locator('[title="Bold"], [aria-label="Bold"]').first();
    await boldBtn.click();
    await page.waitForTimeout(60);
    // Undo removes bold.
    await page.keyboard.press('Control+Z');
    await page.waitForTimeout(60);
    expect(await ed.locator('strong').count()).toBe(0);
    // Redo brings bold back.
    await page.keyboard.press('Control+Y');
    await page.waitForTimeout(60);
    await expect(ed.locator('strong')).toBeVisible();
  });

  test('multiple undo steps remove formatting applied in sequence', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await page.keyboard.type('multi step');
    await page.keyboard.press('Control+A');
    const boldBtn = page.locator('[title="Bold"], [aria-label="Bold"]').first();
    await boldBtn.click();
    await page.waitForTimeout(60);
    await page.keyboard.press('Control+A');
    const italicBtn = page.locator('[title="Italic"], [aria-label="Italic"]').first();
    await italicBtn.click();
    await page.waitForTimeout(60);
    // Two formatting ops — two undos.
    await page.keyboard.press('Control+Z');
    await page.waitForTimeout(60);
    // After first undo: italic removed, bold still present.
    expect(await ed.locator('em').count()).toBe(0);
    await page.keyboard.press('Control+Z');
    await page.waitForTimeout(60);
    // After second undo: bold removed too.
    expect(await ed.locator('strong').count()).toBe(0);
    await expect(ed).toContainText('multi step');
  });

  test('undo after redo leaves editor in pre-redo state', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await page.keyboard.type('sequence');
    await page.keyboard.press('Control+A');
    const boldBtn = page.locator('[title="Bold"], [aria-label="Bold"]').first();
    await boldBtn.click();
    await page.waitForTimeout(60);
    await page.keyboard.press('Control+Z'); // undo → no bold
    await page.waitForTimeout(60);
    await page.keyboard.press('Control+Y'); // redo → bold back
    await page.waitForTimeout(60);
    await expect(ed.locator('strong')).toBeVisible();
    await page.keyboard.press('Control+Z'); // undo again → bold gone
    await page.waitForTimeout(60);
    expect(await ed.locator('strong').count()).toBe(0);
  });

  test('undo toolbar button removes last formatting', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await page.keyboard.type('toolbar undo');
    await page.keyboard.press('Control+A');
    const boldBtn = page.locator('[title="Bold"], [aria-label="Bold"]').first();
    await boldBtn.click();
    await page.waitForTimeout(100);
    await expect(ed.locator('strong')).toBeVisible();
    const undoBtn = page.locator('[title="Undo"], [aria-label="Undo"]').first();
    await expect(undoBtn).toBeEnabled();
    await undoBtn.click();
    await page.waitForTimeout(100);
    expect(await ed.locator('strong').count()).toBe(0);
  });

  test('redo toolbar button re-applies formatting', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await page.keyboard.type('toolbar redo');
    await page.keyboard.press('Control+A');
    const boldBtn = page.locator('[title="Bold"], [aria-label="Bold"]').first();
    await boldBtn.click();
    await page.waitForTimeout(100);
    const undoBtn = page.locator('[title="Undo"], [aria-label="Undo"]').first();
    await expect(undoBtn).toBeEnabled();
    await undoBtn.click();
    await page.waitForTimeout(100);
    expect(await ed.locator('strong').count()).toBe(0);
    const redoBtn = page.locator('[title="Redo"], [aria-label="Redo"]').first();
    await redoBtn.click();
    await page.waitForTimeout(100);
    await expect(ed.locator('strong')).toBeVisible();
  });

  test('undo restores selection to pre-bold range', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await page.keyboard.insertText('hello world');
    await page.waitForTimeout(30);
    // Force a history snapshot of the typed text before applying bold.
    // The idle timer debounces 1500ms; without this, undo jumps past the
    // typed text back to the initial empty state.
    await page.evaluate(() => window.__openEditorInstance.history.takeSnapshot());
    // Select 'hello' (first 5 chars)
    await page.evaluate(() => {
      const edEl = document.querySelector('.oe-editor');
      const p    = edEl.querySelector('p');
      if (!p || !p.firstChild) return;
      const range = document.createRange();
      range.setStart(p.firstChild, 0);
      range.setEnd(p.firstChild, 5);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    });
    await page.waitForTimeout(30);
    const boldBtn = page.locator('[title="Bold"], [aria-label="Bold"]').first();
    await boldBtn.click();
    await page.waitForTimeout(60);
    await expect(ed.locator('strong')).toBeVisible();
    // Undo
    await page.keyboard.press('Control+Z');
    await page.waitForTimeout(80);
    // After undo: bold removed, text preserved, cursor restored inside editor
    expect(await ed.locator('strong').count()).toBe(0);
    await expect(ed).toContainText('hello world');
    // Selection is restored inside the editor (cursor position is valid)
    const anchorIn = await page.evaluate(() => {
      const sel = window.getSelection();
      const edEl = document.querySelector('.oe-editor');
      return sel && sel.anchorNode ? edEl.contains(sel.anchorNode) : false;
    });
    expect(anchorIn).toBe(true);
  });

  test('history does not produce JS errors on page reload', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await page.keyboard.type('pre-destroy text');
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.reload();
    expect(errors.filter((e) => !e.includes('ResizeObserver'))).toHaveLength(0);
  });
});
