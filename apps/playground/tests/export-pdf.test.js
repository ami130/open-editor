/**
 * Phase 19.5 — Export to PDF e2e. Real ES256 license → gate → the exportPdf
 * action builds a styled print document. window.open is stubbed in-page (real
 * headless print can't be asserted and popups may be blocked), so we verify
 * the document that WOULD be printed: gated correctly, styled, content intact.
 */
import { test, expect } from '@playwright/test';

const NOTICE = '[data-oe-premium-notice]';

// Install an in-page window.open stub that records the written document.
async function stubPrintWindow(page) {
  await page.evaluate(() => {
    window.__pdf = { writes: [], printed: 0, openedNull: false };
    window.__realOpen = window.open;
    window.open = () => {
      const win = {
        document: { write: (s) => window.__pdf.writes.push(s), close() {} },
        focus() {}, print() { window.__pdf.printed++; },
        requestAnimationFrame: (cb) => cb(),
      };
      return win;
    };
  });
}

test.describe('Phase 19.5 — Export to PDF', () => {
  test.beforeEach(async ({ page }) => {
    // ?nopremium: start clean so we drive the gate explicitly (the playground
    // otherwise auto-grants all features by default).
    await page.goto('/?nopremium');
    await page.waitForSelector('.oe-toolbar');
    // Put known content in the editor.
    await page.evaluate(() => window.__openEditorInstance.setHTML(
      '<h1>My Report</h1><p>Hello <strong>world</strong>.</p><table><tbody><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></tbody></table>'));
    await stubPrintWindow(page);
  });

  test('license granting export.pdf → toolbar button appears, exportPdf builds a styled doc', async ({ page }) => {
    await page.evaluate(() => window.__premium.apply(['export.pdf']));
    await expect(page.locator('.oe-toolbar [data-name="exportPdf"]')).toBeVisible();

    const ok = await page.evaluate(() => window.__openEditorInstance.exportPdf());
    expect(ok).toBe(true);
    const doc = await page.evaluate(() => window.__pdf.writes[0]);
    expect(doc).toContain('<!DOCTYPE html>');
    expect(doc).toContain('@page');
    expect(doc).toContain('<h1>My Report</h1>');       // content preserved
    expect(doc).toContain('<strong>world</strong>');   // inline formatting preserved
    expect(doc).toContain('<th>A</th>');                // table preserved
    expect(await page.evaluate(() => window.__pdf.printed)).toBe(1);
  });

  test('clicking the toolbar button triggers the export', async ({ page }) => {
    await page.evaluate(() => window.__premium.apply(['export.pdf']));
    await page.locator('.oe-toolbar [data-name="exportPdf"]').click();
    expect(await page.evaluate(() => window.__pdf.writes.length)).toBe(1);
  });

  test('per-call page setup reaches the @page block', async ({ page }) => {
    await page.evaluate(() => window.__premium.apply(['export.pdf']));
    await page.evaluate(() => window.__openEditorInstance.exportPdf({ pageSize: 'Letter', orientation: 'landscape' }));
    const doc = await page.evaluate(() => window.__pdf.writes[0]);
    expect(doc).toMatch(/size:\s*Letter landscape/);
  });

  test('NO license → no button, no exportPdf handle, upgrade notice shown', async ({ page }) => {
    await page.evaluate(() => window.__premium.installFree());
    await expect(page.locator(NOTICE)).toBeVisible();
    expect(await page.locator('.oe-toolbar [data-name="exportPdf"]').count()).toBe(0);
    expect(await page.evaluate(() => typeof window.__openEditorInstance.exportPdf)).toBe('undefined');
  });

  test('valid license WITHOUT export.pdf → degraded, notice shown, no button', async ({ page }) => {
    await page.evaluate(() => window.__premium.apply(['seo']));
    await expect(page.locator(NOTICE)).toBeVisible();
    expect(await page.locator('.oe-toolbar [data-name="exportPdf"]').count()).toBe(0);
  });

  test('the free editor is untouched by the denied plugin', async ({ page }) => {
    await page.evaluate(() => window.__premium.installFree());
    await page.locator('.oe-editor').click();
    await page.keyboard.press('End');
    await page.keyboard.type(' still editable');
    await expect(page.locator('.oe-editor')).toContainText('still editable');
  });
});
