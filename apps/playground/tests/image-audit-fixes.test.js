/**
 * image-audit-fixes.test.js — live proof (Chromium/Firefox/WebKit) for the
 * behaviour-dependent fixes from the deep-audit round:
 *   #1 getHTML has no oe-figure--selected after selecting
 *   #2 centered image does NOT de-center when west-shrunk
 *   #5 data:image/svg+xml is blocked on insert
 *   #6 ContextMenu / Shift+F10 opens the image actions menu (keyboard)
 *   #7 tap (touch) selects an image
 *   #10 inserting inside a table cell keeps the figure in the cell
 */
import { test, expect } from '@playwright/test';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHgAAABQCAIAAABd+SbeAAAAqElEQVR4nO3QAQkAIBDAQDt9/waGsoXCPFiAcWvP6ELr+cEngQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnSrA8HI1ZX2ePpXAAAAAElFTkSuQmCC';

async function insert(page) {
  await page.locator('.oe-editor').click();
  await page.locator('[title="Insert Image"], [aria-label="Insert Image"]').first().click();
  await page.waitForSelector('.oe-modal', { state: 'visible' });
  await page.locator('#oe-img-url').first().fill(PNG);
  await page.locator('.oe-modal button').filter({ hasText: 'Insert Image' }).first().click();
  await page.waitForSelector('.oe-editor figure[data-oe-island]');
  await page.waitForFunction(() => {
    const i = document.querySelector('.oe-editor figure img');
    return i && (i.complete || i.naturalWidth > 0);
  }).catch(() => {});
  await page.waitForTimeout(80);
}

async function selectImage(page) {
  await page.locator('.oe-editor figure[data-oe-island]').first().click({ position: { x: 6, y: 6 } });
  await page.waitForTimeout(100);
}

test.describe('Image deep-audit fixes (live)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.oe-toolbar');
    await page.evaluate(() => window.__openEditorInstance.setHTML('<p>hello</p>'));
  });

  // #1 — selection class must not ship in saved output
  test('getHTML has no oe-figure--selected even while an image is selected', async ({ page }) => {
    await insert(page);
    await selectImage(page);
    const html = await page.evaluate(() => window.__openEditorInstance.getHTML());
    expect(html).not.toContain('oe-figure--selected');
    expect(html).toContain('data-oe-island="image"'); // the image itself survives
  });

  // #2 — centered image keeps centered when west-shrunk
  test('centered image is not de-centered by a west-handle shrink', async ({ page }) => {
    await insert(page);
    await selectImage(page);
    await page.locator('.oe-img-actionbar__btn[aria-label="Center"]').first().click();
    await page.waitForTimeout(200);
    await page.waitForSelector('.oe-resize-handle--w');
    const wh = await page.evaluate(() => {
      const h = document.querySelector('.oe-resize-handle--w').getBoundingClientRect();
      return { x: h.left + h.width / 2, y: h.top + h.height / 2 };
    });
    await page.mouse.move(wh.x, wh.y);
    await page.mouse.down();
    await page.mouse.move(wh.x + 40, wh.y, { steps: 10 }); // drag inward = shrink
    await page.mouse.up();
    await page.waitForTimeout(150);
    const ml = await page.evaluate(() =>
      document.querySelector('.oe-editor figure img').style.marginLeft || '');
    expect(ml).toBe(''); // no stray inline margin-left overriding margin:auto
  });

  // #5 — svg data URI blocked on insert (no figure created; error surfaced)
  test('data:image/svg+xml is blocked on insert', async ({ page }) => {
    await page.locator('.oe-editor').click();
    await page.locator('[title="Insert Image"], [aria-label="Insert Image"]').first().click();
    await page.waitForSelector('.oe-modal', { state: 'visible' });
    await page.locator('#oe-img-url').first()
      .fill('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg==');
    await page.locator('.oe-modal button').filter({ hasText: 'Insert Image' }).first().click();
    await page.waitForTimeout(300);
    const hasFig = await page.evaluate(() =>
      !!document.querySelector('.oe-editor figure[data-oe-island]'));
    expect(hasFig).toBe(false); // svg data URI rejected → no figure inserted
  });

  // #6 — keyboard opens the actions menu
  test('ContextMenu key opens the image actions menu', async ({ page }) => {
    await insert(page);
    await selectImage(page);
    await page.keyboard.press('ContextMenu');
    await page.waitForTimeout(120);
    const menuVisible = await page.evaluate(() =>
      !!document.querySelector('[role="menu"], .oe-context-menu, [class*="context-menu"]'));
    expect(menuVisible).toBe(true);
  });

  // #7 — touch tap selects. Dispatch a real touchend on the image (the default
  // Playwright contexts have hasTouch:false, so page.touchscreen isn't available;
  // this drives the actual _handleTouchEnd listener directly).
  test('a touch tap selects the image', async ({ page }) => {
    await insert(page);
    const selected = await page.evaluate(() => {
      const img = document.querySelector('.oe-editor figure[data-oe-island] img');
      const ev = new Event('touchend', { bubbles: true, cancelable: true });
      Object.defineProperty(ev, 'target', { value: img, enumerable: true });
      Object.defineProperty(ev, 'changedTouches', { value: [{ target: img }], enumerable: true });
      img.dispatchEvent(ev);
      return !!document.querySelector('.oe-figure--selected');
    });
    expect(selected).toBe(true);
  });

  // #10 — insert into a table cell keeps the figure inside the cell
  test('inserting inside a table cell keeps the figure in the cell', async ({ page }) => {
    await page.evaluate(() => window.__openEditorInstance.setHTML(
      '<table><tbody><tr><td><p id="cellp">cell text</p></td></tr></tbody></table>'));
    // Place the caret inside the cell paragraph.
    await page.evaluate(() => {
      const p = document.getElementById('cellp');
      const r = document.createRange(); r.setStart(p.firstChild, 3); r.collapse(true);
      const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
      document.querySelector('.oe-editor').focus();
    });
    await page.locator('[title="Insert Image"], [aria-label="Insert Image"]').first().click();
    await page.waitForSelector('.oe-modal', { state: 'visible' });
    await page.locator('#oe-img-url').first().fill(PNG);
    await page.locator('.oe-modal button').filter({ hasText: 'Insert Image' }).first().click();
    await page.waitForSelector('.oe-editor figure[data-oe-island]');
    await page.waitForTimeout(100);
    const inCell = await page.evaluate(() =>
      !!document.querySelector('.oe-editor td figure[data-oe-island]'));
    expect(inCell).toBe(true);
  });
});
