/**
 * Phase 15 Stage 7 — dark-mode surface snapshots.
 *
 * The original dark snapshot only captured the EMPTY editor, so un-tokenized
 * panels/dialogs/callouts stayed light without any test noticing (GAP-1). These
 * tests OPEN each themeable surface with the dark theme active and screenshot it,
 * so a surface that fails to reskin is caught as a visual diff.
 *
 * Baselines were generated with --update-snapshots and each was inspected by eye
 * (dark surface, legible light text) before being committed.
 */
import { test, expect } from '@playwright/test';

test.describe('Phase 15 — dark-mode surfaces', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.oe-editor[contenteditable="true"]');
    await page.addStyleTag({ content: '* { caret-color: transparent !important; }' });
    await page.evaluate(() => window.__openEditorInstance.setTheme('dark'));
    await page.waitForTimeout(60);
  });

  test('callouts reskin dark (legible, not light-on-light)', async ({ page }) => {
    await page.evaluate(() => {
      window.__openEditorInstance.setHTML(
        '<blockquote data-bq-style="callout-info"><p>Info callout</p></blockquote>' +
        '<blockquote data-bq-style="callout-warning"><p>Warning callout</p></blockquote>' +
        '<blockquote data-bq-style="callout-success"><p>Success callout</p></blockquote>' +
        '<blockquote data-bq-style="callout-danger"><p>Danger callout</p></blockquote>' +
        '<blockquote data-bq-style="pull"><p>A pull quote</p></blockquote>'
      );
    });
    await page.waitForTimeout(60);
    await expect(page.locator('.oe-editor')).toHaveScreenshot('dark-callouts.png', { maxDiffPixelRatio: 0.02 });
  });

  test('source view reskins dark', async ({ page }) => {
    await page.locator('[title="Source code"], [aria-label="Source code"]').first().click();
    await page.waitForTimeout(80);
    await expect(page.locator('.oe-wrapper')).toHaveScreenshot('dark-source.png', { maxDiffPixelRatio: 0.02 });
  });

  test('special-characters grid reskins dark', async ({ page }) => {
    await page.locator('[title="Special characters"], [aria-label="Special characters"]').first().click();
    await page.waitForSelector('.oe-chargrid', { state: 'visible' });
    await page.waitForTimeout(60);
    await expect(page.locator('.oe-chargrid')).toHaveScreenshot('dark-chargrid.png', { maxDiffPixelRatio: 0.02 });
  });
});
