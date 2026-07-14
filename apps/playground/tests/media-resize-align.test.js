/**
 * media-resize-align.test.js — video embeds can be resized and aligned the
 * same way images already are: click to select, drag a corner handle to
 * resize (aspect ratio preserved), use the floating action bar to align or
 * delete, and undo/redo cross the whole thing cleanly.
 */
import { test, expect } from '@playwright/test';

async function embedViaDialog(page, url) {
  await page.locator('button[aria-label="Embed video" i]').click();
  await page.waitForTimeout(150);
  const modal = page.locator('.oe-modal, [role="dialog"]').last();
  await page.locator('.oe-embed-dialog__input').fill(url);
  await modal.locator('button:has-text("Embed")').click();
  await page.waitForTimeout(250);
}

test.describe('Video embed — select, resize, align, delete', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.oe-editor[contenteditable="true"]');
  });

  test('clicking the embed selects it and reveals the resize overlay + action bar', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await embedViaDialog(page, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');

    const fig = ed.locator('.oe-embed');
    await fig.click({ position: { x: 10, y: 10 } });
    await expect(page.locator('.oe-resize-overlay')).toBeVisible();
    await expect(page.locator('.oe-resize-handle--se')).toBeVisible();
    await expect(page.getByRole('toolbar', { name: 'Video actions' })).toBeVisible();
    const selected = await page.evaluate(() => document.querySelector('.oe-embed').classList.contains('oe-embed--selected'));
    expect(selected).toBe(true);
  });

  test('dragging the SE handle inward shrinks the embed while preserving 16:9', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await embedViaDialog(page, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    const fig = ed.locator('.oe-embed');
    await fig.click({ position: { x: 10, y: 10 } });

    const before = await fig.boundingBox();
    const handle = page.locator('.oe-resize-handle--se');
    const handleBox = await handle.boundingBox();
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(handleBox.x - 200, handleBox.y - 120, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(150);

    const after = await fig.boundingBox();
    expect(after.width).toBeLessThan(before.width);
    expect(after.height).toBeLessThan(before.height);
    const ratio = after.width / after.height;
    expect(ratio).toBeGreaterThan(1.6);
    expect(ratio).toBeLessThan(1.9);
  });

  test('resize does not overflow the editor even when dragged outward', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await embedViaDialog(page, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    const fig = ed.locator('.oe-embed');
    await fig.click({ position: { x: 10, y: 10 } });

    const handle = page.locator('.oe-resize-handle--se');
    const handleBox = await handle.boundingBox();
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(handleBox.x + 400, handleBox.y + 300, { steps: 10 }); // way past the editor edge
    await page.mouse.up();
    await page.waitForTimeout(150);

    const figBox = await fig.boundingBox();
    const edBox = await ed.boundingBox();
    expect(figBox.x + figBox.width).toBeLessThanOrEqual(edBox.x + edBox.width + 1);
  });

  test('undo reverts a resize back to the pre-drag dimensions', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await embedViaDialog(page, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    const fig = ed.locator('.oe-embed');
    await fig.click({ position: { x: 10, y: 10 } });

    const before = await fig.boundingBox();
    const handle = page.locator('.oe-resize-handle--se');
    const handleBox = await handle.boundingBox();
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(handleBox.x - 200, handleBox.y - 120, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(150);

    await page.evaluate(() => window.__openEditorInstance.undo());
    await page.waitForTimeout(150);
    const restored = await ed.locator('.oe-embed').boundingBox();
    expect(Math.round(restored.width)).toBe(Math.round(before.width));
  });

  test('align-center button centers the embed', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await embedViaDialog(page, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    const fig = ed.locator('.oe-embed');
    await fig.click({ position: { x: 10, y: 10 } });

    await page.getByRole('toolbar', { name: 'Video actions' })
      .locator('button[aria-label="Center" i]').click();
    await page.waitForTimeout(100);
    const hasCenter = await page.evaluate(() =>
      document.querySelector('.oe-embed').classList.contains('oe-embed--center'));
    expect(hasCenter).toBe(true);
  });

  test('align-left then align-right swaps the class cleanly (no leftover state)', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await embedViaDialog(page, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    const fig = ed.locator('.oe-embed');
    await fig.click({ position: { x: 10, y: 10 } });
    const bar = page.getByRole('toolbar', { name: 'Video actions' });

    await bar.locator('button[aria-label="Align left" i]').click();
    await page.waitForTimeout(80);
    await bar.locator('button[aria-label="Align right" i]').click();
    await page.waitForTimeout(80);
    const classes = await page.evaluate(() => [...document.querySelector('.oe-embed').classList]);
    expect(classes).toContain('oe-embed--right');
    expect(classes).not.toContain('oe-embed--left');
  });

  // REGRESSION: an iframe/shield inside .oe-embed are position:absolute (for
  // the aspect-ratio box), so there's no in-flow content left to establish a
  // shrink-to-fit width once floated — align-left/right with no prior resize
  // used to collapse the embed to 0x0 (invisible). Fixed with an explicit
  // default width on .oe-embed--left/--right.
  test('align-left does not collapse the embed to 0x0, and it stays resizable afterward', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await embedViaDialog(page, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    const fig = ed.locator('.oe-embed');
    await fig.click({ position: { x: 10, y: 10 } });

    await page.getByRole('toolbar', { name: 'Video actions' })
      .locator('button[aria-label="Align left" i]').click();
    await page.waitForTimeout(150);
    const alignedBox = await fig.boundingBox();
    expect(alignedBox.width).toBeGreaterThan(0);
    expect(alignedBox.height).toBeGreaterThan(0);

    const handle = page.locator('.oe-resize-handle--se');
    const handleBox = await handle.boundingBox();
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(handleBox.x - 100, handleBox.y - 60, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(150);

    const resizedBox = await fig.boundingBox();
    expect(resizedBox.width).toBeLessThan(alignedBox.width);
    const stillLeft = await page.evaluate(() =>
      document.querySelector('.oe-embed').classList.contains('oe-embed--left'));
    expect(stillLeft).toBe(true);
  });

  test('align-right does not collapse the embed to 0x0', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await embedViaDialog(page, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    const fig = ed.locator('.oe-embed');
    await fig.click({ position: { x: 10, y: 10 } });

    await page.getByRole('toolbar', { name: 'Video actions' })
      .locator('button[aria-label="Align right" i]').click();
    await page.waitForTimeout(150);
    const box = await fig.boundingBox();
    expect(box.width).toBeGreaterThan(0);
    expect(box.height).toBeGreaterThan(0);
  });

  test('two embeds in one document: selecting one does not select or overlay the other', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await embedViaDialog(page, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    await page.keyboard.press('End');
    await embedViaDialog(page, 'https://www.youtube.com/watch?v=jNQXAC9IVRw');

    const figs = ed.locator('.oe-embed');
    await expect(figs).toHaveCount(2);
    const first = figs.nth(0);
    const second = figs.nth(1);

    await first.click({ position: { x: 10, y: 10 } });
    await expect(page.locator('.oe-resize-overlay')).toHaveCount(1);
    expect(await first.evaluate((el) => el.classList.contains('oe-embed--selected'))).toBe(true);
    expect(await second.evaluate((el) => el.classList.contains('oe-embed--selected'))).toBe(false);

    await second.click({ position: { x: 10, y: 10 } });
    await expect(page.locator('.oe-resize-overlay')).toHaveCount(1); // still exactly one overlay, moved
    expect(await first.evaluate((el) => el.classList.contains('oe-embed--selected'))).toBe(false);
    expect(await second.evaluate((el) => el.classList.contains('oe-embed--selected'))).toBe(true);
  });

  test('delete via the action bar removes the embed', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await embedViaDialog(page, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    const fig = ed.locator('.oe-embed');
    await fig.click({ position: { x: 10, y: 10 } });
    await page.getByRole('toolbar', { name: 'Video actions' })
      .locator('button[aria-label="Delete video" i]').click();
    await page.waitForTimeout(100);
    await expect(ed.locator('.oe-embed')).toHaveCount(0);
  });

  test('keyboard Backspace deletes a selected embed', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await embedViaDialog(page, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    const fig = ed.locator('.oe-embed');
    await fig.click({ position: { x: 10, y: 10 } });
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(100);
    await expect(ed.locator('.oe-embed')).toHaveCount(0);
  });

  test('clicking outside the embed deselects it and hides the overlay/action bar', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await embedViaDialog(page, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    const fig = ed.locator('.oe-embed');
    await fig.click({ position: { x: 10, y: 10 } });
    await expect(page.locator('.oe-resize-overlay')).toBeVisible();

    await page.keyboard.type(' '); // types after the embed via the trailing paragraph focus path
    const wrapper = page.locator('.oe-wrapper');
    await wrapper.click({ position: { x: 5, y: 5 } });
    await page.waitForTimeout(100);
    await expect(page.locator('.oe-resize-overlay')).toHaveCount(0);
  });
});
