/**
 * Phase 9.1 + 9.4 e2e — Image Properties dialog + selected-image action bar.
 * Covers: double-click opens properties, editing size/alt persists, dialog
 * Delete removes the image, and the floating action bar (select → align/edit/delete).
 */
import { test, expect } from '@playwright/test';

const isMac = process.platform === 'darwin';
const MOD   = isMac ? 'Meta' : 'Control';
const DATA_IMG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==';

// Seed one figure directly, then select it.
async function seedFigure(page, extra = '') {
  await page.evaluate(({ src, extra }) => {
    window.__openEditorInstance.setHTML(
      `<p>before</p>` +
      `<figure contenteditable="false" data-oe-island="image" class="oe-figure">` +
      `<img src="${src}" width="120" height="80" style="width:120px;height:80px"${extra}>` +
      `<figcaption contenteditable="true" data-oe-caption=""></figcaption></figure>` +
      `<p>after</p>`
    );
  }, { src: DATA_IMG, extra });
}

test.describe('Phase 9.1 / 9.4 — Image Properties + Action Bar', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.oe-toolbar');
    await page.locator('.oe-editor').click();
  });

  // ── 9.1 Properties dialog ─────────────────────────────────────────────────────

  test('double-click an image opens the Image properties dialog', async ({ page }) => {
    await seedFigure(page);
    await page.locator('.oe-editor figure[data-oe-island] img').first().dblclick();
    await page.waitForSelector('.oe-modal', { state: 'visible' });
    await expect(page.locator('#oe-imgp-src')).toHaveValue(DATA_IMG);
  });

  test('editing width/height + alt via the dialog persists to the image', async ({ page }) => {
    await seedFigure(page);
    await page.locator('.oe-editor figure[data-oe-island] img').first().dblclick();
    await page.waitForSelector('.oe-modal', { state: 'visible' });
    // Turn off aspect-lock so we can set both freely.
    await page.locator('#oe-imgp-lock').uncheck();
    await page.locator('#oe-imgp-w').fill('250');
    await page.locator('#oe-imgp-h').fill('90');
    await page.locator('#oe-imgp-alt').fill('described');
    await page.locator('.oe-modal button').filter({ hasText: 'Apply' }).first().click();
    await page.waitForTimeout(100);
    const info = await page.evaluate(() => {
      const img = document.querySelector('.oe-editor figure img');
      return { w: img.style.width, h: img.style.height, alt: img.getAttribute('alt') };
    });
    expect(info.w).toBe('250px');
    expect(info.h).toBe('90px');
    expect(info.alt).toBe('described');
  });

  test('border radius set via the dialog persists', async ({ page }) => {
    await seedFigure(page);
    await page.locator('.oe-editor figure[data-oe-island] img').first().dblclick();
    await page.waitForSelector('.oe-modal', { state: 'visible' });
    await page.locator('#oe-imgp-radius').fill('10');
    await page.locator('.oe-modal button').filter({ hasText: 'Apply' }).first().click();
    await page.waitForTimeout(100);
    const radius = await page.evaluate(() =>
      document.querySelector('.oe-editor figure img').style.borderRadius);
    expect(radius).toBe('10px');
  });

  test('dialog Delete button removes the image', async ({ page }) => {
    await seedFigure(page);
    await page.locator('.oe-editor figure[data-oe-island] img').first().dblclick();
    await page.waitForSelector('.oe-modal', { state: 'visible' });
    await page.locator('.oe-modal button').filter({ hasText: 'Delete' }).first().click();
    await page.waitForTimeout(100);
    const has = await page.evaluate(() => !!document.querySelector('.oe-editor figure[data-oe-island]'));
    expect(has).toBe(false);
  });

  // ── 9.4 Action bar ──────────────────────────────────────────────────────────────

  test('selecting an image shows the action bar', async ({ page }) => {
    await seedFigure(page);
    await page.locator('.oe-editor figure[data-oe-island]').first().click({ position: { x: 10, y: 10 } });
    await page.waitForTimeout(100);
    const visible = await page.evaluate(() => {
      const b = document.querySelector('.oe-img-actionbar');
      return !!b && !b.hidden;
    });
    expect(visible).toBe(true);
  });

  test('action bar Center button aligns the image', async ({ page }) => {
    await seedFigure(page);
    await page.locator('.oe-editor figure[data-oe-island]').first().click({ position: { x: 10, y: 10 } });
    await page.waitForTimeout(100);
    await page.locator('.oe-img-actionbar__btn[aria-label="Center"]').first().click();
    await page.waitForTimeout(80);
    const centered = await page.evaluate(() =>
      !!document.querySelector('.oe-editor .oe-figure--center'));
    expect(centered).toBe(true);
  });

  test('action bar Delete removes the image', async ({ page }) => {
    await seedFigure(page);
    await page.locator('.oe-editor figure[data-oe-island]').first().click({ position: { x: 10, y: 10 } });
    await page.waitForTimeout(100);
    await page.locator('.oe-img-actionbar__btn[aria-label="Delete image"]').first().click();
    await page.waitForTimeout(100);
    const has = await page.evaluate(() => !!document.querySelector('.oe-editor figure[data-oe-island]'));
    expect(has).toBe(false);
  });

  test('action bar Edit opens the properties dialog', async ({ page }) => {
    await seedFigure(page);
    await page.locator('.oe-editor figure[data-oe-island]').first().click({ position: { x: 10, y: 10 } });
    await page.waitForTimeout(100);
    await page.locator('.oe-img-actionbar__btn[aria-label="Edit image"]').first().click();
    await page.waitForSelector('.oe-modal', { state: 'visible' });
    await expect(page.locator('#oe-imgp-src')).toHaveValue(DATA_IMG);
  });
});
