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
  await page.fill('.oe-bm-dialog__input', 'sec-1');
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

// ── Regression for the reported bug (2026-07-16): bookmarking a SELECTION
//    used to swallow the selected text into the marker and break the line. ──
test('bookmarking a SELECTION preserves the text (no swallow, no break)', async ({ page }) => {
  await page.evaluate(() => window.__openEditorInstance.setHTML('<p>keep every word of this</p>'));
  // select the whole paragraph's text
  await page.evaluate(() => {
    const p = document.querySelector('.oe-editor p');
    const r = document.createRange();
    r.selectNodeContents(p);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  });
  await page.click('.oe-tb__btn[data-name="bookmark"]');
  await page.waitForTimeout(200);
  await page.fill('.oe-bm-dialog__input', 'sel-mark');
  await page.click('.oe-modal__btn--primary');
  await page.waitForTimeout(200);

  const text = await page.evaluate(() => document.querySelector('.oe-editor').textContent);
  expect(text).toContain('keep every word of this');           // text intact
  const emptyMarker = await page.evaluate(() =>
    document.querySelector('.oe-editor a.oe-bookmark').childNodes.length);
  expect(emptyMarker).toBe(0);                                  // marker holds NO text
});

test('right-click a bookmark opens the manage context menu', async ({ page }) => {
  await page.evaluate(() => window.__openEditorInstance.setHTML(
    '<p>a <a id="ctx" class="oe-bookmark" contenteditable="false"></a> b</p>'));
  await page.click('.oe-editor a.oe-bookmark', { button: 'right' });
  await page.waitForTimeout(200);
  // the shared context menu should be showing our Edit/Remove items
  const menu = page.locator('.oe-menu');
  await expect(menu).toBeVisible();
});

test('marker has NO underline and its glyph is centered', async ({ page }) => {
  await page.evaluate(() => window.__openEditorInstance.setHTML(
    '<p>text <a id="u" class="oe-bookmark" contenteditable="false"></a> more</p>'));
  const deco = await page.evaluate(() =>
    getComputedStyle(document.querySelector('.oe-editor a.oe-bookmark')).textDecorationLine);
  expect(deco).toBe('none');                       // the reported underline is gone
  const display = await page.evaluate(() =>
    getComputedStyle(document.querySelector('.oe-editor a.oe-bookmark')).display);
  expect(display).toBe('inline-flex');             // centered flex marker
});

test('a custom hex color renders and round-trips', async ({ page }) => {
  await page.evaluate(() => window.__openEditorInstance.setHTML(
    '<p>x <a id="cc" class="oe-bookmark" contenteditable="false" style="--oe-bm-color: #ff8800"></a> y</p>'));
  const color = await page.evaluate(() => {
    const m = document.querySelector('.oe-editor a.oe-bookmark');
    return getComputedStyle(m, '::before').color;  // resolved marker glyph color
  });
  // #ff8800 → rgb(255, 136, 0)
  expect(color.replace(/\s/g, '')).toBe('rgb(255,136,0)');
  const html = await page.evaluate(() => window.__openEditorInstance.getHTML());
  expect(html).toContain('--oe-bm-color: #ff8800');
});

test('bookmark dialog embeds the REAL HSV color picker and applies a color', async ({ page }) => {
  await page.click('.oe-tb__btn[data-name="bookmark"]');
  await page.waitForTimeout(250);
  // the same advanced picker as text color is embedded in the dialog
  const dialogPicker = page.locator('.oe-modal .oe-bm-dialog__cp');
  await expect(dialogPicker).toBeVisible();
  await expect(dialogPicker.locator('.oe-cp__grad')).toBeVisible();   // HSV gradient canvas
  await expect(dialogPicker.locator('.oe-cp__hex-input')).toBeVisible(); // hex field
  await expect(dialogPicker.locator('.oe-tb__swatch').first()).toBeVisible(); // preset swatches

  await page.fill('.oe-bm-dialog__input', 'colored');
  // pick a preset swatch inside the embedded picker
  await dialogPicker.locator('.oe-tb__swatch').nth(3).click();
  await page.click('.oe-modal__btn--primary');
  await page.waitForTimeout(200);

  const html = await page.evaluate(() => window.__openEditorInstance.getHTML());
  expect(html).toContain('id="colored"');
  // a concrete color was stored on the marker (inline var), text intact
  expect(html).toMatch(/--oe-bm-color:\s*#[0-9a-f]{6}/i);
});

test('DRAGGING the gradient then Save applies the color (mouseup ends on document)', async ({ page }) => {
  // The reported bug: makeDraggable ends drags with mouseup on `document`, so
  // the old panel-level tracking missed them and Save stored no color. This
  // reproduces a gradient drag whose mousedown is on the wrap and mouseup on
  // document (dispatched to sidestep cross-engine synthetic-mouse hit-testing
  // through the transformed modal — the interaction path is identical).
  await page.click('.oe-tb__btn[data-name="bookmark"]');
  await page.waitForTimeout(250);
  await page.fill('.oe-bm-dialog__input', 'dragged');

  const changed = await page.evaluate(() => {
    const wrap = document.querySelector('.oe-bm-dialog__cp .oe-cp__grad-wrap');
    const hex = document.querySelector('.oe-bm-dialog__cp .oe-cp__hex-input');
    const before = hex.value;
    const r = wrap.getBoundingClientRect();
    wrap.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: r.right - 6, clientY: r.top + 6 }));
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: r.right - 6, clientY: r.top + 6 }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); // ends on document
    return before !== hex.value;
  });
  expect(changed).toBe(true);                                // the drag moved the picker

  await page.click('.oe-modal__btn--primary');
  await page.waitForTimeout(200);
  const html = await page.evaluate(() => window.__openEditorInstance.getHTML());
  expect(html).toContain('id="dragged"');
  expect(html).toMatch(/--oe-bm-color:\s*#[0-9a-f]{6}/i);   // the dragged color stuck
});

test('Clear in the embedded picker then Save stores NO color', async ({ page }) => {
  await page.click('.oe-tb__btn[data-name="bookmark"]');
  await page.waitForTimeout(250);
  await page.fill('.oe-bm-dialog__input', 'cleared');
  // interact with the picker first (type a hex), then hit Clear
  await page.fill('.oe-bm-dialog__cp .oe-cp__hex-input', '#00ff00');
  await page.click('.oe-bm-dialog__cp .oe-cp__clear-btn');
  await page.click('.oe-modal__btn--primary');
  await page.waitForTimeout(200);
  const html = await page.evaluate(() => window.__openEditorInstance.getHTML());
  expect(html).toContain('id="cleared"');
  expect(html).not.toContain('--oe-bm-color');
});

test('bookmark dialog looks modern: icon grid + labelled sections present', async ({ page }) => {
  await page.click('.oe-tb__btn[data-name="bookmark"]');
  await page.waitForTimeout(200);
  const dialog = page.locator('.oe-modal .oe-bm-dialog');
  await expect(dialog).toBeVisible();
  // icon grid with multiple choices
  const icons = dialog.locator('.oe-bm-dialog__icon');
  expect(await icons.count()).toBeGreaterThanOrEqual(12);
  // uppercase section labels (name / icon / color)
  const labels = await dialog.locator('.oe-bm-dialog__label').count();
  expect(labels).toBeGreaterThanOrEqual(3);
});
