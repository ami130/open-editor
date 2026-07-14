/**
 * find-replace-whole-word.test.js — 16.7.4: whole-word toggle for Find &
 * Replace, matching every other editor's standard whole-word matching
 * (a match only counts when non-word characters, or the string edge, sit on
 * both sides of it — "cat" matches standalone but not inside "category").
 */
import { test, expect } from '@playwright/test';

test.describe('Find & Replace — whole-word toggle', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.oe-editor[contenteditable="true"]');
  });

  test('narrows results to standalone-word matches only', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await page.keyboard.type('a cat sat in the category');
    await page.locator('button[aria-label="Find and replace" i]').click();
    await page.waitForTimeout(120);
    await page.locator('.oe-find__input').first().fill('cat');
    await page.waitForTimeout(80);
    await expect(page.locator('.oe-find__count')).toHaveText('1/2');

    await page.locator('button[aria-label="Whole word" i]').click();
    await page.waitForTimeout(80);
    await expect(page.locator('.oe-find__count')).toHaveText('1/1');
  });

  test('toggling back off restores full substring matching', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await page.keyboard.type('a cat sat in the category');
    await page.locator('button[aria-label="Find and replace" i]').click();
    await page.waitForTimeout(120);
    await page.locator('.oe-find__input').first().fill('cat');
    const wordBtn = page.locator('button[aria-label="Whole word" i]');
    await wordBtn.click();
    await page.waitForTimeout(80);
    await expect(page.locator('.oe-find__count')).toHaveText('1/1');
    await wordBtn.click();
    await page.waitForTimeout(80);
    await expect(page.locator('.oe-find__count')).toHaveText('1/2');
  });

  test('reflects on/off state via aria-pressed and a visual --on class', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await page.locator('button[aria-label="Find and replace" i]').click();
    await page.waitForTimeout(80);
    const btn = page.locator('button[aria-label="Whole word" i]');
    expect(await btn.getAttribute('aria-pressed')).toBe('false');
    await btn.click();
    expect(await btn.getAttribute('aria-pressed')).toBe('true');
    expect(await btn.evaluate((b) => b.classList.contains('oe-find__word--on'))).toBe(true);
  });
});
