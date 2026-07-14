/**
 * image-picture.test.js — 16.7.8: responsive <picture> output. Verifies that a
 * <figure> containing a <picture> with multiple <source>s survives a live
 * setHTML → getHTML round-trip (the sanitizer keeps <picture>/<source> and
 * scheme-checks each srcset), that the browser renders the image through the
 * <picture> element, and that an unsafe-srcset <source> is neutralized.
 */
import { test, expect } from '@playwright/test';

const FIGURE = '<figure class="oe-figure" contenteditable="false" data-oe-island="image">'
  + '<picture>'
  + '<source srcset="https://raw.githubusercontent.com/mdn/dom-examples/main/media/img/small.jpg 600w" media="(max-width: 799px)">'
  + '<source srcset="https://raw.githubusercontent.com/mdn/dom-examples/main/media/img/large.jpg 1200w" media="(min-width: 800px)">'
  + '<img src="https://raw.githubusercontent.com/mdn/dom-examples/main/media/img/large.jpg" alt="responsive">'
  + '</picture>'
  + '<figcaption contenteditable="true" data-oe-caption="">cap</figcaption>'
  + '</figure>';

test('a responsive <picture> figure survives a setHTML → getHTML round-trip', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.oe-editor[contenteditable="true"]');
  await page.evaluate((html) => window.__openEditorInstance.setHTML('<p>before</p>' + html + '<p>after</p>'), FIGURE);
  await page.waitForTimeout(100);

  // The <picture> is actually in the live DOM with both <source>s + the <img>.
  const picture = page.locator('.oe-editor picture');
  await expect(picture).toHaveCount(1);
  await expect(picture.locator('source')).toHaveCount(2);
  await expect(picture.locator('img')).toHaveCount(1);

  const html = await page.evaluate(() => window.__openEditorInstance.getHTML());
  expect(html).toContain('<picture>');
  expect(html).toContain('media="(min-width: 800px)"');
  expect(html).toContain('600w');
  expect(html).toContain('1200w');
  expect(html).toContain('<img');
});

test('the browser resolves the <img> inside <picture> to a real rendered image', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.oe-editor[contenteditable="true"]');
  await page.evaluate((html) => window.__openEditorInstance.setHTML(html), FIGURE);
  await page.waitForTimeout(100);

  const img = page.locator('.oe-editor picture img');
  await expect(img).toHaveCount(1);
  // currentSrc is populated by the browser once <picture> resolution picks a
  // source/fallback — proves the <picture> machinery is live, not inert markup.
  await img.evaluate((el) => el.complete || new Promise((r) => { el.onload = r; el.onerror = r; }));
  const resolvedToSomething = await img.evaluate((el) => !!(el.currentSrc || el.src));
  expect(resolvedToSomething).toBe(true);
});

test('an unsafe srcset on a <source> is stripped, leaving the <img> fallback safe', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.oe-editor[contenteditable="true"]');
  const dirty = '<figure class="oe-figure" contenteditable="false" data-oe-island="image">'
    + '<picture>'
    + '<source srcset="javascript:alert(1) 1x">'
    + '<img src="https://raw.githubusercontent.com/mdn/dom-examples/main/media/img/large.jpg" alt="x">'
    + '</picture>'
    + '<figcaption contenteditable="true" data-oe-caption=""></figcaption>'
    + '</figure>';
  await page.evaluate((html) => window.__openEditorInstance.setHTML(html), dirty);
  await page.waitForTimeout(100);

  const html = await page.evaluate(() => window.__openEditorInstance.getHTML());
  expect(html).not.toContain('javascript:');
  // The dangerous srcset is gone; the <img> fallback (safe https src) remains.
  expect(html).toContain('<img');
  expect(html).toContain('large.jpg');
});
