/**
 * Phase 7.5.8 — Snapshot regression tests.
 *
 * Uses Playwright's built-in visual comparison to lock in:
 *   - editor initial state
 *   - editor with typed content
 *   - editor with bold formatting applied
 *   - editor in fullscreen (if supported)
 *
 * Run with --update-snapshots to regenerate baselines.
 * Snapshots are stored under tests/snapshots/.
 */
import { test, expect } from '@playwright/test';

test.describe('Phase 7.5.8 — Snapshot regression', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.oe-editor[contenteditable="true"]');
    // Hide any flashing cursors for deterministic screenshots.
    await page.addStyleTag({ content: '* { caret-color: transparent !important; }' });
  });

  test('editor initial state matches snapshot', async ({ page }) => {
    const wrapper = page.locator('.oe-wrapper');
    await expect(wrapper).toHaveScreenshot('editor-empty.png', {
      maxDiffPixelRatio: 0.02,
    });
  });

  test('editor with plain text content matches snapshot', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await page.keyboard.type('The quick brown fox');
    // Click outside editor to remove caret.
    await page.mouse.click(0, 0);
    await page.waitForTimeout(100);
    const wrapper = page.locator('.oe-wrapper');
    await expect(wrapper).toHaveScreenshot('editor-with-text.png', {
      maxDiffPixelRatio: 0.02,
    });
  });

  test('editor with bold formatting matches snapshot', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await page.keyboard.type('Bold content here');
    await page.keyboard.press('Control+A');
    const boldBtn = page.locator('[title="Bold"], [aria-label="Bold"]').first();
    await boldBtn.click();
    // Click outside to deselect.
    await page.mouse.click(0, 0);
    await page.waitForTimeout(100);
    const wrapper = page.locator('.oe-wrapper');
    await expect(wrapper).toHaveScreenshot('editor-bold.png', {
      maxDiffPixelRatio: 0.02,
    });
  });

  test('toolbar initial state matches snapshot', async ({ page }) => {
    const toolbar = page.locator('.oe-toolbar');
    await expect(toolbar).toHaveScreenshot('toolbar-initial.png', {
      maxDiffPixelRatio: 0.02,
    });
  });

  test('bold toolbar button active state matches snapshot', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await page.keyboard.type('snapshot bold');
    await page.keyboard.press('Control+A');
    const boldBtn = page.locator('[title="Bold"], [aria-label="Bold"]').first();
    await boldBtn.click();
    // Move cursor into the bold text to trigger active state.
    await ed.click();
    await page.keyboard.press('Control+Home');
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(150);
    await expect(boldBtn).toHaveScreenshot('toolbar-bold-active.png', {
      maxDiffPixelRatio: 0.05,
    });
  });

  // Phase 15 — theme snapshots. Prove dark/minimal actually re-skin the editor
  // (the light baseline above already proved tokenization is pixel-faithful).
  test('dark theme re-skins the editor', async ({ page }) => {
    await page.evaluate(() => window.__openEditorInstance.setTheme('dark'));
    await page.waitForTimeout(80);
    const wrapper = page.locator('.oe-wrapper');
    await expect(wrapper).toHaveScreenshot('editor-dark.png', { maxDiffPixelRatio: 0.02 });
  });

  test('minimal theme flattens the chrome', async ({ page }) => {
    await page.evaluate(() => window.__openEditorInstance.setTheme('minimal'));
    await page.waitForTimeout(80);
    const wrapper = page.locator('.oe-wrapper');
    await expect(wrapper).toHaveScreenshot('editor-minimal.png', { maxDiffPixelRatio: 0.02 });
  });

  test('switching dark then back to light restores the light appearance', async ({ page }) => {
    await page.evaluate(() => {
      window.__openEditorInstance.setTheme('dark');
      window.__openEditorInstance.setTheme('light');
    });
    await page.waitForTimeout(80);
    const wrapper = page.locator('.oe-wrapper');
    // Must match the ORIGINAL light baseline — proves the switch leaves no residue.
    await expect(wrapper).toHaveScreenshot('editor-empty.png', { maxDiffPixelRatio: 0.02 });
  });

  test('read-only treatment reads as viewable (not the harsh disabled dim)', async ({ page }) => {
    await page.evaluate(() => { window.__openEditorInstance.getEditorElement().innerHTML = '<p>Read-only content stays legible.</p>'; window.__openEditorInstance.setReadOnly(true); });
    await page.waitForTimeout(80);
    const wrapper = page.locator('.oe-wrapper');
    await expect(wrapper).toHaveScreenshot('editor-readonly.png', { maxDiffPixelRatio: 0.02 });
  });
});
