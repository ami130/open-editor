/**
 * type-around.test.js — 17.5.9 live: hover near a first-block table's top
 * edge reveals the escape line; clicking inserts a paragraph and typing lands
 * ABOVE the table (the classic trap, escaped).
 */
import { test, expect } from '@playwright/test';

test('the table-at-document-start trap is escapable by pointer', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.oe-editor[contenteditable="true"]');
  await page.evaluate(() => window.__openEditorInstance.setHTML(
    '<table><tbody><tr><td>only content</td></tr></tbody></table>'));
  await page.waitForTimeout(150);

  // Hover just inside the table's top edge.
  const box = await page.locator('.oe-editor table').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + 2);
  await page.waitForTimeout(150);
  const line = page.locator('.oe-type-around');
  await expect(line).toBeVisible();

  await line.click();
  await page.waitForTimeout(150);
  await page.keyboard.type('escaped!');
  const html = await page.evaluate(() => window.__openEditorInstance.getHTML());
  expect(html).toMatch(/^<p>escaped!<\/p>\s*<table/);
});

test('between two adjacent islands, the line appears and inserts between them', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.oe-editor[contenteditable="true"]');
  await page.evaluate(() => window.__openEditorInstance.setHTML(
    '<table><tbody><tr><td>one</td></tr></tbody></table>'
    + '<table><tbody><tr><td>two</td></tr></tbody></table>'));
  await page.waitForTimeout(150);

  const first = await page.locator('.oe-editor table').first().boundingBox();
  await page.mouse.move(first.x + first.width / 2, first.y + first.height - 2);
  await page.waitForTimeout(150);
  await expect(page.locator('.oe-type-around')).toBeVisible();
  await page.locator('.oe-type-around').click();
  await page.keyboard.type('middle');
  const html = await page.evaluate(() => window.__openEditorInstance.getHTML());
  expect(html).toMatch(/one.*<p>middle<\/p>.*two/s);
});
