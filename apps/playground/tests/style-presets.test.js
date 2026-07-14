/**
 * style-presets.test.js — 17.5.8 live: dropdown from config, block + inline
 * application through real clicks.
 */
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.oe-editor[contenteditable="true"]');
  // A second editor configured WITH styles (the playground default has none —
  // which itself proves the conditional: no Styles trigger in the main toolbar).
  await page.evaluate(() => {
    const host = document.createElement('div');
    host.id = 'styles-host';
    document.body.appendChild(host);
    window.__stylesEd = new window.__OpenEditor(host, {
      styles: [
        { label: 'Callout', element: 'p', classes: ['callout'] },
        { label: 'Highlight', classes: ['hl'] },
      ],
    });
    window.__stylesEd.setHTML('<p>style target text</p>');
  });
});

test.afterEach(async ({ page }) => {
  await page.evaluate(() => {
    if (window.__stylesEd && !window.__stylesEd.isDestroyed()) window.__stylesEd.destroy();
    document.getElementById('styles-host')?.remove();
  });
});

test('default toolbar has no Styles dropdown; configured editor has one', async ({ page }) => {
  const main = page.locator('.oe-wrapper').first();
  await expect(main.locator('.oe-tb__dd-trigger[aria-label="Styles"]')).toHaveCount(0);
  const styled = page.locator('#styles-host');
  await expect(styled.locator('.oe-tb__dd-trigger[aria-label="Styles"]')).toHaveCount(1);
});

test('picking a block preset applies element + class live', async ({ page }) => {
  const host = page.locator('#styles-host');
  await host.locator('.oe-editor p').click();
  await host.locator('.oe-tb__dd-trigger[aria-label="Styles"]').click();
  await page.click('.oe-tb__dd-option:has-text("Callout")');
  await page.waitForTimeout(150);
  const html = await page.evaluate(() => window.__stylesEd.getHTML());
  expect(html).toContain('<p class="callout">');
});

test('picking an inline preset wraps the selection', async ({ page }) => {
  const host = page.locator('#styles-host');
  await page.evaluate(() => {
    const node = document.querySelector('#styles-host .oe-editor p').firstChild;
    const r = document.createRange();
    r.setStart(node, 6); r.setEnd(node, 12); // "target"
    const s = window.getSelection();
    s.removeAllRanges(); s.addRange(r);
  });
  await host.locator('.oe-tb__dd-trigger[aria-label="Styles"]').click();
  await page.click('.oe-tb__dd-option:has-text("Highlight")');
  await page.waitForTimeout(150);
  const html = await page.evaluate(() => window.__stylesEd.getHTML());
  expect(html).toContain('<span class="hl">target</span>');
});
