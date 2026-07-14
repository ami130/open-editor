/**
 * modern-ux.test.js — Phase 16.6.5: cross-browser + keyboard-only verification
 * for the slash-command palette, markdown autoformat, @mentions, and block
 * drag-reorder (16.6.1–16.6.4). Runs on Chromium, Firefox, and WebKit.
 */
import { test, expect } from '@playwright/test';

test.describe('16.6.1 — Slash-command palette', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.oe-editor[contenteditable="true"]');
  });

  test('typing "/" opens the palette, filtering narrows it, click applies a heading', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await page.keyboard.type('/h1');
    await expect(page.locator('.oe-caret-popup')).toBeVisible();
    const options = page.locator('.oe-caret-popup__option');
    await expect(options).toHaveCount(1);
    await options.first().click();
    await expect(ed.locator('h1')).toHaveCount(1);
  });

  test('keyboard-only: ArrowDown + Enter picks an entry without a mouse', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await page.keyboard.type('/');
    await expect(page.locator('.oe-caret-popup')).toBeVisible();
    await page.keyboard.press('ArrowDown'); // move to first entry (Text is index 0, so this selects it or the next)
    await page.keyboard.press('Enter');
    // Whatever was picked, the "/" trigger text must be gone and the popup closed.
    await expect(page.locator('.oe-caret-popup')).toBeHidden();
    await expect(ed).not.toContainText('/');
  });

  test('Escape closes the palette without applying anything', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await page.keyboard.type('/table');
    await expect(page.locator('.oe-caret-popup')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.oe-caret-popup')).toBeHidden();
  });
});

test.describe('16.6.2 — Markdown autoformat', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.oe-editor[contenteditable="true"]');
  });

  test('typing "**bold**" converts to <strong> live', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await page.keyboard.type('**bold**');
    await expect(ed.locator('strong')).toHaveText('bold');
  });

  test('typing "# " at block start converts to a heading', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await page.keyboard.type('# ');
    await expect(ed.locator('h1')).toHaveCount(1);
  });

  test('typing "- " at block start converts to a bulleted list', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await page.keyboard.type('- ');
    await expect(ed.locator('ul li')).toHaveCount(1);
  });
});

test.describe('16.6.3 — @mentions autocomplete', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.oe-editor[contenteditable="true"]');
  });

  test('typing "@al" shows matching demo users, clicking inserts a mention', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await page.keyboard.type('@al');
    await expect(page.locator('.oe-caret-popup')).toBeVisible();
    await expect(page.locator('.oe-caret-popup__option')).toHaveCount(2, { timeout: 2000 }); // alice, alan
    await page.locator('.oe-caret-popup__option').first().click();

    const mention = ed.locator('[data-oe-mention]');
    await expect(mention).toHaveCount(1);
    await expect(mention).toHaveAttribute('contenteditable', 'false');
  });

  test('keyboard-only: type "@b", ArrowDown/Enter inserts the mention without a mouse', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await page.keyboard.type('@b');
    await expect(page.locator('.oe-caret-popup__option')).toHaveCount(1, { timeout: 2000 }); // bob
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(ed.locator('[data-oe-mention]')).toHaveCount(1);
    await expect(ed.locator('[data-oe-mention]')).toHaveText('@bob');
  });

  test('does not trigger for an email-like pattern', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await page.keyboard.type('user@host.com');
    await expect(page.locator('.oe-caret-popup')).toBeHidden();
  });
});

test.describe('16.6.4 — Block drag-reorder handles', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.oe-editor[contenteditable="true"]');
  });

  test('hovering a block reveals the drag handle', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await page.keyboard.type('first block');
    const p = ed.locator('p').first();
    const box = await p.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.locator('.oe-block-handle')).toBeVisible();
  });

  test('dragging a block handle reorders the blocks and takes one history snapshot', async ({ page }) => {
    await page.evaluate(() => {
      window.__openEditorInstance.setHTML('<p id="a">Alpha</p><p id="b">Bravo</p><p id="c">Charlie</p>');
    });
    const ed = page.locator('.oe-editor');

    // Hover block A to reveal its handle.
    const a = ed.locator('#a');
    const aBox = await a.boundingBox();
    await page.mouse.move(aBox.x + aBox.width / 2, aBox.y + aBox.height / 2);
    const handle = page.locator('.oe-block-handle');
    await expect(handle).toBeVisible();

    const handleBox = await handle.boundingBox();
    const cBox = await ed.locator('#c').boundingBox();

    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(cBox.x + cBox.width / 2, cBox.y + cBox.height + 2, { steps: 5 });
    await page.mouse.up();

    const order = await page.evaluate(() =>
      Array.from(window.__openEditorInstance.getEditorElement().children).map((el) => el.id)
    );
    expect(order).toEqual(['b', 'c', 'a']);

    // Exactly one undo step should revert the whole reorder.
    await page.evaluate(() => window.__openEditorInstance.undo());
    const reverted = await page.evaluate(() =>
      Array.from(window.__openEditorInstance.getEditorElement().children).map((el) => el.id)
    );
    expect(reverted).toEqual(['a', 'b', 'c']);
  });
});
