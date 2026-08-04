/**
 * image-frame-anchor.test.js — the selection frame must hug the IMAGE (not the
 * figure + caption strip), and a west/north handle must move the edge you grab
 * (opposite edge pinned), not stretch from the far side.
 *
 * Before the fix: overlay measured the whole <figure> (818×106 around a 120×80
 * image), and dragging the west handle left grew the box from the RIGHT edge.
 * Runs across Chromium, Firefox, WebKit.
 */
import { test, expect } from '@playwright/test';

const IMG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHgAAABQCAIAAABd+SbeAAAAqElEQVR4nO3QAQkAIBDAQDt9/waGsoXCPFiAcWvP6ELr+cEngQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnSrA8HI1ZX2ePpXAAAAAElFTkSuQmCC';

async function insert(page) {
  await page.evaluate(() => window.__openEditorInstance.setHTML('<p>hello</p>'));
  await page.locator('.oe-editor').click();
  await page.locator('[title="Insert Image"], [aria-label="Insert Image"]').first().click();
  await page.waitForSelector('.oe-modal', { state: 'visible' });
  await page.locator('#oe-img-url').first().fill(IMG);
  await page.locator('.oe-modal button').filter({ hasText: 'Insert Image' }).first().click();
  await page.waitForSelector('.oe-editor figure[data-oe-island]');
  await page.waitForFunction(() => {
    const i = document.querySelector('.oe-editor figure img');
    return i && (i.complete || i.naturalWidth > 0);
  }).catch(() => {});
  await page.waitForTimeout(120);
}

async function selectImage(page) {
  const fig = page.locator('.oe-editor figure[data-oe-island]').first();
  await fig.click({ position: { x: 6, y: 6 } });
  await page.waitForTimeout(120);
}

test.describe('Image selection frame hugs the image + anchored resize', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.oe-toolbar');
  });

  test('overlay matches the IMAGE box, not the figure+caption', async ({ page }) => {
    await insert(page);
    await selectImage(page);
    const r = await page.evaluate(() => {
      const ov = document.querySelector('.oe-resize-overlay').getBoundingClientRect();
      const im = document.querySelector('.oe-editor figure img').getBoundingClientRect();
      return {
        dW: Math.abs(ov.width - im.width),
        dH: Math.abs(ov.height - im.height),
        dL: Math.abs(ov.left - im.left),
        dT: Math.abs(ov.top - im.top),
      };
    });
    // Frame coincides with the image box within a couple px (was 818×106 vs 120×80).
    expect(r.dW).toBeLessThanOrEqual(2);
    expect(r.dH).toBeLessThanOrEqual(2);
    expect(r.dL).toBeLessThanOrEqual(2);
    expect(r.dT).toBeLessThanOrEqual(2);
  });

  test('west handle on a right-floated image moves the LEFT edge (right edge pinned)', async ({ page }) => {
    await insert(page);
    await selectImage(page);
    // Float right so the image's RIGHT edge is pinned to the column edge and it has
    // room to grow left. Dragging the west handle must move the left edge — the
    // exact "grab this edge, this edge moves" the user asked for. (The image stays
    // selected after aligning; re-clicking would deselect it.)
    await page.locator('.oe-img-actionbar__btn[aria-label="Align right"]').first().click();
    await page.waitForTimeout(250);
    await page.waitForSelector('.oe-resize-handle--w', { timeout: 3000 });
    const before = await page.evaluate(() => {
      const i = document.querySelector('.oe-editor figure img').getBoundingClientRect();
      return { L: Math.round(i.left), R: Math.round(i.right), w: Math.round(i.width) };
    });
    const wh = await page.evaluate(() => {
      const h = document.querySelector('.oe-resize-handle--w').getBoundingClientRect();
      return { x: h.left + h.width / 2, y: h.top + h.height / 2 };
    });
    await page.mouse.move(wh.x, wh.y);
    await page.mouse.down();
    await page.mouse.move(wh.x - 50, wh.y, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(150);
    const after = await page.evaluate(() => {
      const i = document.querySelector('.oe-editor figure img').getBoundingClientRect();
      return { L: Math.round(i.left), R: Math.round(i.right), w: Math.round(i.width) };
    });
    // The image grew, the LEFT (grabbed) edge moved out, the RIGHT edge stayed put.
    expect(after.w).toBeGreaterThan(before.w);
    expect(before.L - after.L).toBeGreaterThan(20);   // grabbed edge moved
    expect(Math.abs(after.R - before.R)).toBeLessThanOrEqual(4); // opposite edge pinned
  });

  test('west handle on a flush-left image never overshoots the content edge', async ({ page }) => {
    await insert(page);
    await selectImage(page);
    const contentLeft = await page.evaluate(() => {
      const ed = document.querySelector('.oe-editor');
      const cs = getComputedStyle(ed);
      return Math.round(ed.getBoundingClientRect().left + parseFloat(cs.paddingLeft));
    });
    const wh = await page.evaluate(() => {
      const h = document.querySelector('.oe-resize-handle--w').getBoundingClientRect();
      return { x: h.left + h.width / 2, y: h.top + h.height / 2 };
    });
    // Drag far left. A flush-left image can't move past the content edge; it must
    // NOT overshoot (the old bug let the frame/box run off to the left).
    await page.mouse.move(wh.x, wh.y);
    await page.mouse.down();
    await page.mouse.move(wh.x - 120, wh.y, { steps: 12 });
    const duringLeft = await page.evaluate(() =>
      Math.round(document.querySelector('.oe-editor figure img').getBoundingClientRect().left));
    await page.mouse.up();
    await page.waitForTimeout(150);
    const afterLeft = await page.evaluate(() =>
      Math.round(document.querySelector('.oe-editor figure img').getBoundingClientRect().left));
    expect(duringLeft).toBeGreaterThanOrEqual(contentLeft - 2);
    expect(afterLeft).toBeGreaterThanOrEqual(contentLeft - 2);
  });

  test('east handle still grows to the right (unchanged behavior)', async ({ page }) => {
    await insert(page);
    await selectImage(page);
    const before = await page.evaluate(() => {
      const i = document.querySelector('.oe-editor figure img').getBoundingClientRect();
      return { L: Math.round(i.left), R: Math.round(i.right) };
    });
    const eh = await page.evaluate(() => {
      const h = document.querySelector('.oe-resize-handle--e').getBoundingClientRect();
      return { x: h.left + h.width / 2, y: h.top + h.height / 2 };
    });
    await page.mouse.move(eh.x, eh.y);
    await page.mouse.down();
    await page.mouse.move(eh.x + 60, eh.y, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(150);
    const after = await page.evaluate(() => {
      const i = document.querySelector('.oe-editor figure img').getBoundingClientRect();
      return { L: Math.round(i.left), R: Math.round(i.right) };
    });
    expect(after.R - before.R).toBeGreaterThan(20);   // right edge moved out
    expect(Math.abs(after.L - before.L)).toBeLessThanOrEqual(4); // left edge pinned
  });
});
