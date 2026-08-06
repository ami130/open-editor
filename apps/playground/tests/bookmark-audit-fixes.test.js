/**
 * bookmark-audit-fixes.test.js — live proof for the bookmark deep-audit fixes:
 *  B1 renaming an existing bookmark is now a real undo step (undo restores
 *     the ORIGINAL name, it does not skip past the rename to a pre-insert state)
 *  B2/B3 the dialog shows a visible error for a blank name and for a name that
 *     collides with any id-bearing element, not just other bookmarks
 */
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.oe-editor[contenteditable="true"]');
});

test('B1: undo after a bookmark rename restores the ORIGINAL name', async ({ page }) => {
  await page.evaluate(() => window.__openEditorInstance.setHTML(
    '<p>x<a id="original" class="oe-bookmark" contenteditable="false"></a>y</p>'));
  await page.click('.oe-editor a.oe-bookmark');
  await page.waitForTimeout(200);
  await page.fill('.oe-bm-dialog__input', 'renamed');
  await page.click('.oe-modal__btn--primary');
  await page.waitForTimeout(200);

  let html = await page.evaluate(() => window.__openEditorInstance.getHTML());
  expect(html).toContain('id="renamed"');

  await page.evaluate(() => window.__openEditorInstance.undo());
  await page.waitForTimeout(100);
  html = await page.evaluate(() => window.__openEditorInstance.getHTML());
  expect(html).toContain('id="original"');
  expect(html).not.toContain('id="renamed"');
});

test('B2: renaming to a name already used by a non-bookmark element shows an error', async ({ page }) => {
  await page.evaluate(() => window.__openEditorInstance.setHTML(
    '<p id="taken">hi</p><p><a id="mine" class="oe-bookmark" contenteditable="false"></a></p>'));
  await page.click('.oe-editor a.oe-bookmark');
  await page.waitForTimeout(200);
  await page.fill('.oe-bm-dialog__input', 'taken');
  await page.waitForTimeout(80);
  const err = await page.locator('.oe-bm-dialog__error').textContent();
  expect(err.trim()).not.toBe('');
  await page.click('.oe-modal button:has-text("Save")').catch(() => {});
  // Cancel out cleanly.
  const cancelBtn = page.locator('.oe-modal button:has-text("Remove")');
  if (await cancelBtn.count()) await cancelBtn.click();
});

test('B3: a blank name shows a visible validation error', async ({ page }) => {
  await page.click('.oe-tb__btn[data-name="bookmark"]');
  await page.waitForTimeout(200);
  await page.fill('.oe-bm-dialog__input', '   ');
  await page.waitForTimeout(80);
  const err = await page.locator('.oe-bm-dialog__error').textContent();
  expect(err.trim()).not.toBe('');
  await page.click('.oe-modal button:has-text("Cancel")');
});

// B4 — re-audit finding: the dialog's Remove button bypassed undo entirely.
// PROVEN before the fix: undo() right after a dialog-Remove was a total no-op.
test('B4: undo after removing a bookmark via the dialog restores it', async ({ page }) => {
  await page.evaluate(() => window.__openEditorInstance.setHTML(
    '<p>x <a id="gone" class="oe-bookmark" contenteditable="false"></a> y</p>'));
  await page.click('.oe-editor a.oe-bookmark');
  await page.waitForTimeout(200);
  await page.click('.oe-modal button:has-text("Remove")');
  await page.waitForTimeout(200);

  let html = await page.evaluate(() => window.__openEditorInstance.getHTML());
  expect(html).not.toContain('oe-bookmark');

  await page.evaluate(() => window.__openEditorInstance.undo());
  await page.waitForTimeout(100);
  html = await page.evaluate(() => window.__openEditorInstance.getHTML());
  expect(html).toContain('id="gone"');
});
