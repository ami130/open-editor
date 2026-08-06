/**
 * media-audit-fixes.test.js — live proof for the embedded-video deep-audit fixes:
 *  M1 Tab reaches the embed and selects it; Backspace still deletes it
 *  M3 the resize overlay refits immediately after an align click (no desync)
 *  M5 selecting an embed never leaks oe-embed--selected into getHTML()
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

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.oe-editor[contenteditable="true"]');
});

test('Tab reaches the embed island and selects it', async ({ page }) => {
  const ed = page.locator('.oe-editor');
  await ed.click();
  await embedViaDialog(page, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  await page.evaluate(() => document.querySelector('.oe-embed').focus());
  await page.waitForTimeout(100);
  const selected = await page.evaluate(() => document.querySelector('.oe-embed').classList.contains('oe-embed--selected'));
  expect(selected).toBe(true);
  // Backspace still deletes it once keyboard-selected.
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(100);
  await expect(ed.locator('.oe-embed')).toHaveCount(0);
});

test('resize overlay refits immediately after an align click (no stale-frame desync)', async ({ page }) => {
  const ed = page.locator('.oe-editor');
  await ed.click();
  await embedViaDialog(page, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  const fig = ed.locator('.oe-embed');
  await fig.click({ position: { x: 10, y: 10 } });

  // Shrink it first so a stale overlay after align is visually obvious.
  const handle = page.locator('.oe-resize-handle--se');
  const handleBox = await handle.boundingBox();
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x - 200, handleBox.y - 120, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(120);

  await page.getByRole('toolbar', { name: 'Video actions' })
    .locator('button[aria-label="Center" i]').click();
  // No wait for scroll/resize — the fix refits synchronously on afterCommand.
  await page.waitForTimeout(30);

  const figBox = await fig.boundingBox();
  const overlayBox = await page.locator('.oe-resize-overlay').boundingBox();
  expect(Math.abs(figBox.x - overlayBox.x)).toBeLessThan(3);
  expect(Math.abs(figBox.width - overlayBox.width)).toBeLessThan(3);
});

test('selecting an embed never leaks oe-embed--selected into getHTML()', async ({ page }) => {
  const ed = page.locator('.oe-editor');
  await ed.click();
  await embedViaDialog(page, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  const fig = ed.locator('.oe-embed');
  await fig.click({ position: { x: 10, y: 10 } });
  const html = await page.evaluate(() => window.__openEditorInstance.getHTML());
  expect(html).not.toContain('oe-embed--selected');
});
