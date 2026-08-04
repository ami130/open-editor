/**
 * image-overlay-refit.test.js — proves the resize overlay ("selection border")
 * and the action bar REFIT to the image's new box after a geometry-changing
 * command (align / properties), instead of catching the previous size/position.
 *
 * Regression: aligning via float changes the figure's POSITION without changing
 * its box size, so the ResizeObserver (which watches size) never fired and the
 * marching-ants border stayed at the old spot — reproduced here at ~700px drift.
 * Runs across Chromium, Firefox, WebKit.
 */
import { test, expect } from '@playwright/test';

const DATA_IMG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHgAAABQCAIAAABd+SbeAAAAqElEQVR4nO3QAQkAIBDAQDt9/waGsoXCPFiAcWvP6ELr+cEngQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnSrA8HI1ZX2ePpXAAAAAElFTkSuQmCC';

async function insertImage(page) {
  await page.locator('.oe-editor').click();
  await page.locator('[title="Insert Image"], [aria-label="Insert Image"]').first().click();
  await page.waitForSelector('.oe-modal', { state: 'visible' });
  await page.locator('#oe-img-url').first().fill(DATA_IMG);
  await page.locator('.oe-modal button').filter({ hasText: 'Insert Image' }).first().click();
  await page.waitForSelector('.oe-editor figure[data-oe-island]');
  await page.waitForFunction(() => {
    const img = document.querySelector('.oe-editor figure img');
    return img && (img.complete || img.naturalWidth > 0);
  }).catch(() => {});
  await page.waitForTimeout(60);
}

// Drift between the overlay and the IMAGE box it hugs (the frame targets the
// <img>, not the figure+caption — see image-frame-anchor.test.js).
function readDrift(page) {
  return page.evaluate(() => {
    const ov = document.querySelector('.oe-resize-overlay');
    const im = document.querySelector('.oe-editor figure[data-oe-island] img');
    if (!ov || !im) return { ok: false };
    const o = ov.getBoundingClientRect(), r = im.getBoundingClientRect();
    return {
      ok: true,
      drift: Math.abs(o.left - r.left) + Math.abs(o.top - r.top)
           + Math.abs(o.width - r.width) + Math.abs(o.height - r.height),
      overlayLeft: Math.round(o.left), figLeft: Math.round(r.left),
    };
  });
}

test.describe('Image overlay refit after geometry commands', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.oe-toolbar');
    // Wide paragraph so float-right visibly relocates the figure to the far edge.
    await page.evaluate(() =>
      window.__openEditorInstance.setHTML('<p>' + 'word '.repeat(60) + '</p>'));
  });

  test('overlay tracks the figure when float changes POSITION but not size', async ({ page }) => {
    await insertImage(page);
    const fig = page.locator('.oe-editor figure[data-oe-island]').first();
    await fig.click({ position: { x: 6, y: 6 } });
    await page.waitForTimeout(80);

    // Left float → shrink-wraps to 120px on the left.
    await page.locator('.oe-img-actionbar__btn[aria-label="Align left"]').first().click();
    await page.waitForTimeout(120);
    const afterLeft = await readDrift(page);
    expect(afterLeft.ok).toBe(true);
    expect(afterLeft.drift).toBeLessThanOrEqual(2);

    // Right float → same 120px width, POSITION jumps to the far right. This is the
    // case the ResizeObserver misses; the overlay must still follow.
    await page.locator('.oe-img-actionbar__btn[aria-label="Align right"]').first().click();
    await page.waitForTimeout(150);
    const afterRight = await readDrift(page);
    expect(afterRight.ok).toBe(true);
    // Before the fix this was ~698px. Allow a couple px for sub-pixel rounding.
    expect(afterRight.drift).toBeLessThanOrEqual(2);
    // Sanity: the figure genuinely moved far to the right.
    expect(afterRight.figLeft).toBeGreaterThan(afterLeft.figLeft + 200);
  });

  test('overlay refits after aligning center then back to left', async ({ page }) => {
    await insertImage(page);
    const fig = page.locator('.oe-editor figure[data-oe-island]').first();
    await fig.click({ position: { x: 6, y: 6 } });
    await page.waitForTimeout(80);

    await page.locator('.oe-img-actionbar__btn[aria-label="Center"]').first().click();
    await page.waitForTimeout(150);
    expect((await readDrift(page)).drift).toBeLessThanOrEqual(2);

    await page.locator('.oe-img-actionbar__btn[aria-label="Align left"]').first().click();
    await page.waitForTimeout(150);
    expect((await readDrift(page)).drift).toBeLessThanOrEqual(2);
  });
});
