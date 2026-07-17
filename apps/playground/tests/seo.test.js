/**
 * Phase 19.4 — SEO Analyzer e2e. Real ES256 license → gate → the toolbar
 * button opens the analysis panel in a modal; live inputs re-run analysis
 * against the current editor content.
 */
import { test, expect } from '@playwright/test';

const NOTICE = '[data-oe-premium-notice]';
const PANEL = '[data-oe-seo-panel]';

test.describe('Phase 19.4 — SEO Analyzer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?nopremium');
    await page.waitForSelector('.oe-toolbar');
    await page.evaluate(() => window.__openEditorInstance.setHTML(
      '<h1>Guide to Widgets</h1><p>' + 'widget content here '.repeat(30) + 'widgets are great.</p>'));
  });

  test('license granting seo → button appears, opens the analysis panel', async ({ page }) => {
    await page.evaluate(() => window.__premium.apply(['seo']));
    await expect(page.locator('.oe-toolbar [data-name="seo"]')).toBeVisible();

    await page.locator('.oe-toolbar [data-name="seo"]').click();
    await expect(page.locator(PANEL)).toBeVisible();
    // Report reflects the content: word count + a heading were found.
    await expect(page.locator(PANEL)).toContainText('Words:');
    await expect(page.locator(PANEL)).toContainText('Headings:');
  });

  test('headless analyzeSeo() returns a scored report', async ({ page }) => {
    await page.evaluate(() => window.__premium.apply(['seo']));
    const report = await page.evaluate(() => window.__openEditorInstance.analyzeSeo({ keyword: 'widget' }));
    expect(report.wordCount).toBeGreaterThan(50);
    expect(report.headings.length).toBe(1);
    expect(report.keyword.count).toBeGreaterThan(0);
    expect(report.score).toBeGreaterThanOrEqual(0);
    expect(report.score).toBeLessThanOrEqual(100);
  });

  test('typing a focus keyword in the panel re-runs the analysis live', async ({ page }) => {
    await page.evaluate(() => window.__premium.apply(['seo']));
    await page.locator('.oe-toolbar [data-name="seo"]').click();
    await expect(page.locator(PANEL)).toBeVisible();
    // No keyword check until a keyword is typed.
    await expect(page.locator(PANEL)).not.toContainText('Keyword');
    await page.locator(`${PANEL} .oe-seo__input`).first().fill('widget');
    await expect(page.locator(PANEL)).toContainText('Keyword');
  });

  test('panel shows the advanced sections: search preview + related phrases', async ({ page }) => {
    await page.evaluate(() => window.__openEditorInstance.setHTML(
      '<h1>Guide</h1><p>' + 'rich text editor and rich text tools '.repeat(5) + '</p>'));
    await page.evaluate(() => window.__premium.apply(['seo']));
    await page.locator('.oe-toolbar [data-name="seo"]').click();
    await expect(page.locator('[data-oe-seo-panel] .oe-seo__snippet')).toBeVisible();
    await expect(page.locator('[data-oe-seo-panel]')).toContainText('Search preview');
    // repeated bigram surfaces as a related-phrase chip
    await expect(page.locator('[data-oe-seo-panel] .oe-seo__related')).toContainText('rich text');
  });

  test('advanced checks appear (images missing alt, links)', async ({ page }) => {
    await page.evaluate(() => window.__openEditorInstance.setHTML(
      '<h1>T</h1><p>Text with <a href="https://x.com">a link</a>.</p>'
      + '<figure class="oe-figure" data-oe-island="image"><img src="x.png"></figure>'));
    await page.evaluate(() => window.__premium.apply(['seo']));
    const report = await page.evaluate(() => window.__openEditorInstance.analyzeSeo());
    expect(report.linkImage.links.external).toBeGreaterThanOrEqual(1);
    expect(report.linkImage.images.missingAlt).toBeGreaterThanOrEqual(1);
    expect(report.depth).toBeTruthy();
    expect(report.snippet).toBeTruthy();
  });

  test('NO license → no button, no analyzeSeo handle, upgrade notice', async ({ page }) => {
    await page.evaluate(() => window.__premium.installFree());
    await expect(page.locator(NOTICE)).toBeVisible();
    expect(await page.locator('.oe-toolbar [data-name="seo"]').count()).toBe(0);
    expect(await page.evaluate(() => typeof window.__openEditorInstance.analyzeSeo)).toBe('undefined');
  });

  test('read-only analysis never mutates the document', async ({ page }) => {
    const before = await page.evaluate(() => window.__openEditorInstance.getHTML());
    await page.evaluate(() => window.__premium.apply(['seo']));
    await page.locator('.oe-toolbar [data-name="seo"]').click();
    await page.locator(`${PANEL} .oe-seo__input`).first().fill('widget');
    const after = await page.evaluate(() => window.__openEditorInstance.getHTML());
    expect(after).toBe(before);
  });
});
