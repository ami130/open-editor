/**
 * todo-list.test.js — 16.7.3: to-do lists (checkbox list items).
 * Covers the toolbar button, [ ]/[x] autoformat triggers, click-to-toggle,
 * Ctrl/Cmd+Enter shortcut, Enter-split/exit behavior, Tab-indent nesting, and
 * undo — including the two real bugs found during live verification: a
 * genuinely childless <li> breaking subsequent typing, and a native
 * Enter-split cloning a checked item's state onto the new sibling.
 */
import { test, expect } from '@playwright/test';

test.describe('To-do lists', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.oe-editor[contenteditable="true"]');
  });

  test('toolbar button converts the current paragraph into a to-do item', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await page.keyboard.type('buy milk');
    await page.locator('button[aria-label="To-do list" i], button[title="To-do list" i]').first().click();
    await page.waitForTimeout(100);
    const li = ed.locator('li[data-todo]');
    await expect(li).toHaveCount(1);
    await expect(li).toContainText('buy milk');
    expect(await li.getAttribute('data-checked')).toBe('false');
  });

  test('[ ] + space creates an unchecked to-do item, and typing afterward lands inside it', async ({ page }) => {
    // REGRESSION: insertTodoList used to leave the <li> with a single
    // EMPTY text node (moved over from the just-marker-stripped block)
    // rather than truly empty — a real browser then refuses to place
    // subsequent typing inside it, producing a stray sibling <p> instead.
    const ed = page.locator('.oe-editor');
    await ed.click();
    await page.keyboard.type('[ ] ');
    await page.keyboard.type('walk the dog');
    await page.waitForTimeout(150);
    const li = ed.locator('li[data-todo]');
    await expect(li).toHaveCount(1);
    expect(await li.getAttribute('data-checked')).toBe('false');
    await expect(li).toContainText('walk the dog');
    await expect(ed.locator('p')).toHaveCount(0); // nothing leaked outside the list
  });

  test('[x] + space creates a CHECKED to-do item', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await page.keyboard.type('[x] ');
    await page.keyboard.type('done thing');
    await page.waitForTimeout(150);
    const li = ed.locator('li[data-todo]');
    await expect(li).toHaveCount(1);
    expect(await li.getAttribute('data-checked')).toBe('true');
    await expect(li).toContainText('done thing');
  });

  test('clicking the checkbox glyph toggles it; clicking the text does not', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await page.keyboard.type('[ ] ');
    await page.keyboard.type('toggle me');
    await page.waitForTimeout(120);
    const li = ed.locator('li[data-todo]');
    const box = await li.boundingBox();
    await page.mouse.click(box.x + 8, box.y + box.height / 2); // the checkbox zone
    await page.waitForTimeout(80);
    expect(await li.getAttribute('data-checked')).toBe('true');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); // the text
    await page.waitForTimeout(80);
    expect(await li.getAttribute('data-checked')).toBe('true'); // unchanged
  });

  test('Ctrl/Cmd+Enter toggles the current to-do item without a mouse', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await page.keyboard.type('[ ] ');
    await page.keyboard.type('shortcut toggle');
    await page.waitForTimeout(120);
    const li = ed.locator('li[data-todo]');
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${modifier}+Enter`);
    await page.waitForTimeout(80);
    expect(await li.getAttribute('data-checked')).toBe('true');
  });

  test('Enter on a non-empty CHECKED item creates a new UNCHECKED sibling item', async ({ page }) => {
    // REGRESSION: the browser's native Enter-split clones the split item's
    // attributes onto the new sibling, including data-checked="true" — a
    // freshly split item must always start unchecked.
    const ed = page.locator('.oe-editor');
    await ed.click();
    await page.keyboard.type('[x] ');
    await page.keyboard.type('first item');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.keyboard.type('second item');
    await page.waitForTimeout(150);
    const items = ed.locator('li[data-todo]');
    await expect(items).toHaveCount(2);
    expect(await items.nth(0).getAttribute('data-checked')).toBe('true');
    expect(await items.nth(1).getAttribute('data-checked')).toBe('false');
    await expect(items.nth(1)).toContainText('second item');
  });

  test('Enter on an empty to-do item exits the list to a plain paragraph', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await page.keyboard.type('[ ] ');
    await page.keyboard.type('only item');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(80);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
    await expect(ed.locator('li[data-todo]')).toHaveCount(1);
    await expect(ed.locator('p')).toHaveCount(1);
  });

  test('Tab nests a to-do item into a sublist under the previous item', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await page.keyboard.type('[ ] ');
    await page.keyboard.type('parent');
    await page.keyboard.press('Enter');
    await page.keyboard.type('child');
    await page.waitForTimeout(100);
    // Position the cursor at the true start of "child" deterministically —
    // the Home key's landing position after this exact sequence is not
    // consistent across browsers (WebKit/Firefox leave it at line-end).
    await page.evaluate(() => {
      const li = document.querySelectorAll('.oe-editor li[data-todo]')[1];
      const range = document.createRange();
      range.setStart(li.firstChild, 0);
      range.collapse(true);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    });
    await page.keyboard.press('Tab');
    await page.waitForTimeout(150);
    const nested = ed.locator('li[data-todo] li[data-todo]');
    await expect(nested).toHaveCount(1);
    await expect(nested).toContainText('child');
  });

  test('undo right after an autoformat-created to-do list reverts to plain text', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await page.keyboard.type('[ ] ');
    await page.waitForTimeout(100);
    await expect(ed.locator('li[data-todo]')).toHaveCount(1);
    await page.evaluate(() => window.__openEditorInstance.undo());
    await page.waitForTimeout(100);
    await expect(ed.locator('li[data-todo]')).toHaveCount(0);
  });
});
