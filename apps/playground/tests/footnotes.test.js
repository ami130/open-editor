/**
 * Phase 19.3 — Footnotes e2e. Real ES256 license → gate → the toolbar button
 * inserts a numbered marker at the caret and keeps the notes section in sync;
 * verifies one-undo-step and round-trip survival in a real browser.
 */
import { test, expect } from '@playwright/test';

const NOTICE = '[data-oe-premium-notice]';

async function caretAtEnd(page) {
  await page.evaluate(() => {
    const ed = window.__openEditorInstance;
    const el = ed.getEditorElement();
    el.focus();
    const r = document.createRange();
    r.selectNodeContents(el); r.collapse(false);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
  });
}

test.describe('Phase 19.3 — Footnotes', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?nopremium');
    await page.waitForSelector('.oe-toolbar');
    await page.evaluate(() => window.__openEditorInstance.setHTML('<p>Some body text here.</p>'));
  });

  test('license granting footnotes → button appears, inserts a numbered marker + note', async ({ page }) => {
    await page.evaluate(() => window.__premium.apply(['footnotes']));
    await expect(page.locator('.oe-toolbar [data-name="insertFootnote"]')).toBeVisible();

    await caretAtEnd(page);
    await page.evaluate(() => window.__openEditorInstance.insertFootnote());

    await expect(page.locator('.oe-editor sup.oe-footnote-ref')).toHaveText('1');
    await expect(page.locator('.oe-editor ol.oe-footnotes > li')).toHaveCount(1);
  });

  test('a second footnote numbers 2; both notes present', async ({ page }) => {
    await page.evaluate(() => window.__premium.apply(['footnotes']));
    await caretAtEnd(page);
    await page.evaluate(() => window.__openEditorInstance.insertFootnote());
    await caretAtEnd(page);
    await page.evaluate(() => window.__openEditorInstance.insertFootnote());
    await expect(page.locator('.oe-editor sup.oe-footnote-ref')).toHaveCount(2);
    await expect(page.locator('.oe-editor ol.oe-footnotes > li')).toHaveCount(2);
  });

  test('insert is ONE undo step (undo removes marker AND note)', async ({ page }) => {
    await page.evaluate(() => window.__premium.apply(['footnotes']));
    await caretAtEnd(page);
    await page.evaluate(() => window.__openEditorInstance.insertFootnote());
    await expect(page.locator('.oe-editor sup.oe-footnote-ref')).toHaveCount(1);
    await page.evaluate(() => window.__openEditorInstance.undo());
    await expect(page.locator('.oe-editor sup.oe-footnote-ref')).toHaveCount(0);
    await expect(page.locator('.oe-editor ol.oe-footnotes')).toHaveCount(0);
  });

  test('footnotes survive a getHTML()/setHTML() round-trip', async ({ page }) => {
    await page.evaluate(() => window.__premium.apply(['footnotes']));
    await caretAtEnd(page);
    await page.evaluate(() => window.__openEditorInstance.insertFootnote());
    const survived = await page.evaluate(() => {
      const ed = window.__openEditorInstance;
      const saved = ed.getHTML();
      ed.setHTML(saved);
      const out = ed.getHTML();
      return out.includes('data-oe-footnote-ref="1"') && out.includes('data-oe-footnotes');
    });
    expect(survived).toBe(true);
  });

  test('NO license → no button, no insertFootnote handle, upgrade notice', async ({ page }) => {
    await page.evaluate(() => window.__premium.installFree());
    await expect(page.locator(NOTICE)).toBeVisible();
    expect(await page.locator('.oe-toolbar [data-name="insertFootnote"]').count()).toBe(0);
    expect(await page.evaluate(() => typeof window.__openEditorInstance.insertFootnote)).toBe('undefined');
  });
});
