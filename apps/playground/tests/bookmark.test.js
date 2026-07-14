/**
 * bookmark.test.js — 17.5.7 live: insert via dialog, flag renders, link
 * dialog suggests the anchor, click-manage removes.
 */
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.oe-editor[contenteditable="true"]');
  await page.evaluate(() => window.__openEditorInstance.setHTML('<p>hello world</p>'));
  await page.click('.oe-editor p');
  await page.keyboard.press('End');
});

test('insert a bookmark via the dialog; flag marker renders; round-trips', async ({ page }) => {
  await page.click('.oe-tb__btn[data-name="bookmark"]');
  await page.waitForTimeout(200);
  await page.fill('.oe-bookmark-dialog__input', 'sec-1');
  await page.click('.oe-modal__btn--primary');
  await page.waitForTimeout(200);
  const html = await page.evaluate(() => window.__openEditorInstance.getHTML());
  expect(html).toContain('id="sec-1"');
  const marker = page.locator('.oe-editor a.oe-bookmark');
  await expect(marker).toBeVisible();
  const flag = await page.evaluate(() =>
    getComputedStyle(document.querySelector('.oe-editor a.oe-bookmark'), '::before').content);
  expect(flag).toContain('⚑');
});

test('the link dialog suggests existing anchors and accepts #fragment hrefs', async ({ page }) => {
  await page.evaluate(() => window.__openEditorInstance.setHTML(
    '<p><a id="target-x" class="oe-bookmark" contenteditable="false"></a>top</p><p>link me</p>'));
  const p2 = page.locator('.oe-editor p').nth(1);
  await p2.click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a');
  // select only the second paragraph's text for the link
  await page.evaluate(() => {
    const p = document.querySelectorAll('.oe-editor p')[1];
    const r = document.createRange();
    r.selectNodeContents(p);
    const s = window.getSelection();
    s.removeAllRanges(); s.addRange(r);
  });
  await page.click('.oe-tb__btn[data-name="insertLink"]');
  await page.waitForTimeout(250);
  const hasDatalist = await page.evaluate(() => {
    const dl = document.querySelector('#oe-link-anchors');
    return dl ? [...dl.options].map((o) => o.value) : null;
  });
  expect(hasDatalist).toEqual(['#target-x']);
  await page.fill('#oe-link-url', '#target-x');
  await page.click('.oe-modal__btn--primary');
  await page.waitForTimeout(250);
  const html = await page.evaluate(() => window.__openEditorInstance.getHTML());
  expect(html).toContain('href="#target-x"');
});

test('clicking a bookmark opens manage; Remove deletes it', async ({ page }) => {
  await page.evaluate(() => window.__openEditorInstance.setHTML(
    '<p>x <a id="gone" class="oe-bookmark" contenteditable="false"></a> y</p>'));
  await page.click('.oe-editor a.oe-bookmark');
  await page.waitForTimeout(200);
  await page.click('.oe-modal__btn:has-text("Remove")');
  await page.waitForTimeout(200);
  const html = await page.evaluate(() => window.__openEditorInstance.getHTML());
  expect(html).not.toContain('oe-bookmark');
  expect(html).toContain('x');
  expect(html).toContain('y');
});
