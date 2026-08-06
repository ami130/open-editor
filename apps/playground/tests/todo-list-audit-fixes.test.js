/**
 * todo-list-audit-fixes.test.js — live proof for the to-do list deep-audit fixes:
 *  T1 checkbox click/toggle is refused while the editor is readonly
 *  T2 checkbox click/toggle is refused when 'edit.todoList' isn't granted
 *  T3 the checkbox is reachable by Tab and toggleable with Enter/Space
 */
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.oe-editor[contenteditable="true"]');
});

test('T1: checkbox click does nothing while the editor is readonly', async ({ page }) => {
  const ed = page.locator('.oe-editor');
  await ed.click();
  await page.keyboard.type('[ ] ');
  await page.keyboard.type('readonly test');
  await page.waitForTimeout(120);
  await page.evaluate(() => window.__openEditorInstance.setReadOnly(true));
  const li = ed.locator('li[data-todo]');
  const box = await li.boundingBox();
  await page.mouse.click(box.x + 8, box.y + box.height / 2);
  await page.waitForTimeout(80);
  expect(await li.getAttribute('data-checked')).toBe('false');
  await page.evaluate(() => window.__openEditorInstance.setReadOnly(false));
});

test('T3: Tab reaches the checkbox and Enter toggles it', async ({ page }) => {
  const ed = page.locator('.oe-editor');
  await ed.click();
  await page.keyboard.type('[ ] ');
  await page.keyboard.type('keyboard test');
  await page.waitForTimeout(120);
  const li = ed.locator('li[data-todo]');
  await page.evaluate(() => document.querySelector('.oe-todo-check').focus());
  const focused = await page.evaluate(() => document.activeElement.classList.contains('oe-todo-check'));
  expect(focused).toBe(true);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(80);
  expect(await li.getAttribute('data-checked')).toBe('true');
});

test('T3: Space toggles the focused checkbox', async ({ page }) => {
  const ed = page.locator('.oe-editor');
  await ed.click();
  await page.keyboard.type('[ ] ');
  await page.keyboard.type('space test');
  await page.waitForTimeout(120);
  const li = ed.locator('li[data-todo]');
  await page.evaluate(() => document.querySelector('.oe-todo-check').focus());
  await page.keyboard.press(' ');
  await page.waitForTimeout(80);
  expect(await li.getAttribute('data-checked')).toBe('true');
});

// T4 — re-audit finding: ensureCheckBox only set tabindex on a freshly-created
// box, so a checkbox span already present in loaded HTML (legacy content saved
// before this fix, or hand-authored markup) never gained one.
test('T4: a checkbox span already present in loaded HTML still gets tabindex', async ({ page }) => {
  await page.evaluate(() => window.__openEditorInstance.setHTML(
    '<ul data-todo-list><li data-todo data-checked="false">'
    + '<span class="oe-todo-check" role="checkbox" contenteditable="false" aria-label="To-do"></span>legacy'
    + '</li></ul>'));
  await page.waitForTimeout(100);
  const tabindex = await page.evaluate(() =>
    document.querySelector('.oe-todo-check').getAttribute('tabindex'));
  expect(tabindex).toBe('0');
});

// T5 — re-audit finding: no visible focus indicator existed on the checkbox
// at all (WCAG 2.4.7) — a keyboard user tabbing to it got no visual cue.
test('T5: the focused checkbox shows a visible focus outline', async ({ page }) => {
  const ed = page.locator('.oe-editor');
  await ed.click();
  await page.keyboard.type('[ ] ');
  await page.keyboard.type('focus style test');
  await page.waitForTimeout(120);
  await page.evaluate(() => document.querySelector('.oe-todo-check').focus());
  const outline = await page.evaluate(() =>
    getComputedStyle(document.querySelector('.oe-todo-check'), null).outlineStyle);
  expect(outline).not.toBe('none');
});
