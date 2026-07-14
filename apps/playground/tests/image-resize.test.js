/**
 * Phase 9 — Image resize e2e tests.
 * Covers: overlay appears on select, corner-drag resizes the img, dimension
 * badge shows during drag, undo restores pre-resize size.
 *
 * The 1×1 data-URI image is given an explicit width/height so the figure has a
 * stable starting box to drag from.
 */
import { test, expect } from '@playwright/test';

const isMac = process.platform === 'darwin';
const MOD   = isMac ? 'Meta' : 'Control';
const DATA_IMG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==';

// Insert a figure with a known starting size directly via setHTML, then click
// it to spawn the resize overlay.
async function insertSizedFigureAndSelect(page) {
  await page.evaluate((src) => {
    const ed = window.__openEditorInstance;
    ed.setHTML(
      `<p>before</p>` +
      `<figure contenteditable="false" data-oe-island="image" class="oe-figure">` +
      `<img src="${src}" width="120" height="80" style="width:120px;height:80px">` +
      `<figcaption contenteditable="true" data-oe-caption=""></figcaption></figure>` +
      `<p>after</p>`
    );
  }, DATA_IMG);
  const fig = page.locator('.oe-editor figure[data-oe-island]').first();
  await fig.scrollIntoViewIfNeeded();
  await fig.click({ position: { x: 10, y: 10 } });
  await page.waitForTimeout(80);
  return fig;
}

test.describe('Phase 9 — Image Resize', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.oe-toolbar');
    await page.locator('.oe-editor').click();
  });

  test('selecting an image shows the resize overlay with 8 handles', async ({ page }) => {
    await insertSizedFigureAndSelect(page);
    const overlay = page.locator('.oe-resize-overlay').first();
    await expect(overlay).toBeVisible();
    const handleCount = await page.locator('.oe-resize-handle').count();
    expect(handleCount).toBe(8);
  });

  test('dragging the SE corner handle grows the image', async ({ page }) => {
    await insertSizedFigureAndSelect(page);

    const before = await page.evaluate(() => {
      const img = document.querySelector('.oe-editor figure img');
      return img.getBoundingClientRect().width;
    });

    const seHandle = page.locator('.oe-resize-handle--se').first();
    const box = await seHandle.boundingBox();
    expect(box).not.toBeNull();

    // Drag the SE handle 60px right and 40px down.
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 40, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(80);

    const after = await page.evaluate(() => {
      const img = document.querySelector('.oe-editor figure img');
      return img.getBoundingClientRect().width;
    });

    expect(after).toBeGreaterThan(before);
  });

  test('dimension badge appears during drag', async ({ page }) => {
    await insertSizedFigureAndSelect(page);
    const seHandle = page.locator('.oe-resize-handle--se').first();
    const box = await seHandle.boundingBox();

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 50, box.y + box.height / 2 + 30, { steps: 6 });

    const badgeText = await page.evaluate(() => {
      const b = document.querySelector('.oe-resize-badge');
      return b ? b.textContent : '';
    });
    await page.mouse.up();

    expect(badgeText).toMatch(/\d+\s*×\s*\d+/);
  });

  test('undo restores the pre-resize dimensions', async ({ page }) => {
    await insertSizedFigureAndSelect(page);

    const seHandle = page.locator('.oe-resize-handle--se').first();
    const box = await seHandle.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 70, box.y + box.height / 2 + 50, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(80);

    const resized = await page.evaluate(() =>
      document.querySelector('.oe-editor figure img').getBoundingClientRect().width
    );
    expect(resized).toBeGreaterThan(120);

    // Undo — should return to the 120px starting width.
    await page.locator('.oe-editor').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press(`${MOD}+z`);
    await page.waitForTimeout(120);

    const restored = await page.evaluate(() =>
      document.querySelector('.oe-editor figure img').getBoundingClientRect().width
    );
    // Allow a small tolerance for sub-pixel rounding.
    expect(Math.abs(restored - 120)).toBeLessThan(8);
  });
});
