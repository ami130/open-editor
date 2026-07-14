/**
 * text-part-language.test.js — 17.5.10 live: dropdown from config, real
 * selection → Arabic span with dir=rtl, screen-reader-relevant markup.
 */
import { test, expect } from '@playwright/test';

test('marking a fragment Arabic produces lang+dir markup via the dropdown', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.oe-editor[contenteditable="true"]');
  await page.evaluate(() => {
    const host = document.createElement('div');
    host.id = 'lang-host';
    document.body.appendChild(host);
    window.__langEd = new window.__OpenEditor(host, {
      textPartLanguages: [{ code: 'ar', label: 'العربية' }, { code: 'fr', label: 'Français' }],
    });
    window.__langEd.setHTML('<p>hello مرحبا world</p>');
  });
  const host = page.locator('#lang-host');
  await expect(host.locator('.oe-tb__dd-trigger[aria-label="Language"]')).toHaveCount(1);

  await page.evaluate(() => {
    const node = document.querySelector('#lang-host .oe-editor p').firstChild;
    const r = document.createRange();
    r.setStart(node, 6); r.setEnd(node, 11);
    const s = window.getSelection();
    s.removeAllRanges(); s.addRange(r);
  });
  await host.locator('.oe-tb__dd-trigger[aria-label="Language"]').click();
  await page.click('.oe-tb__dd-option:has-text("العربية")');
  await page.waitForTimeout(150);
  const html = await page.evaluate(() => window.__langEd.getHTML());
  expect(html).toContain('<span lang="ar" dir="rtl">مرحبا</span>');
  await page.evaluate(() => { window.__langEd.destroy(); document.getElementById('lang-host').remove(); });
});
