/**
 * image-ux-fixes.test.js — e2e proof for the image UX-round fixes that are
 * behaviour-dependent (real layout / focus / keyboard / async load), which the
 * jsdom unit tests can't fully exercise. Runs across Chromium, Firefox, WebKit.
 *
 * Covers: IMG1-3 (keyboard select/props/resize/deselect), IMG4 (missing-alt
 * badge), IMG13 (broken-image toast), IMG17 (caption action-bar button),
 * IMG20 (type-to-replace a selected image).
 */
import { test, expect } from '@playwright/test';

// A 120×80 solid raster PNG. Unlike a 1×1 PNG (which decodes to a 0×0 layout
// box in Firefox, making keyboard-resize a legitimate no-op), this has a real
// intrinsic size in every engine. Raster (not SVG) because data:image/svg+xml
// is now blocked by the image src subtype gate.
const DATA_IMG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHgAAABQCAIAAABd+SbeAAAAqElEQVR4nO3QAQkAIBDAQDt9/waGsoXCPFiAcWvP6ELr+cEngQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnSrA8HI1ZX2ePpXAAAAAElFTkSuQmCC';

async function openImageDialog(page) {
  const imgBtn = page.locator('[title="Insert Image"], [aria-label="Insert Image"]').first();
  await imgBtn.click();
  await page.waitForSelector('.oe-modal', { state: 'visible' });
}

async function fillUrlAndInsert(page, url, { alt } = {}) {
  const urlInput = page.locator('#oe-img-url, input[type="url"]').first();
  await urlInput.fill(url);
  if (alt != null) {
    const altInput = page.locator('#oe-img-alt, input[name="alt"]').first();
    if (await altInput.count()) await altInput.fill(alt);
  }
  const insertBtn = page.locator('.oe-modal button').filter({ hasText: 'Insert Image' }).first();
  await insertBtn.click();
  await page.waitForSelector('.oe-editor figure[data-oe-island]', { timeout: 5000 });
}

async function insertImage(page, opts) {
  await openImageDialog(page);
  await fillUrlAndInsert(page, DATA_IMG, opts);
  // Wait for the image to actually decode so its layout size is defined.
  await page.waitForFunction(() => {
    const img = document.querySelector('.oe-editor figure img');
    return img && (img.complete || img.naturalWidth > 0);
  }, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(50);
}

test.describe('Image UX fixes (behaviour-dependent)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.oe-toolbar');
    await page.locator('.oe-editor').click();
  });

  // ── IMG1-3: keyboard accessibility ─────────────────────────────────────────
  test('IMG1-3: figure is focusable (tabindex/role) and keyboard-focusing selects it', async ({ page }) => {
    await insertImage(page, { alt: 'a red dot' });
    const meta = await page.evaluate(() => {
      const f = document.querySelector('.oe-editor figure[data-oe-island]');
      return { tabindex: f.getAttribute('tabindex'), role: f.getAttribute('role'),
               label: f.getAttribute('aria-label') };
    });
    expect(meta.tabindex).toBe('0');
    expect(meta.role).toBe('group');
    expect(meta.label).toContain('a red dot');

    // Focus the figure programmatically → focusin selects it.
    await page.evaluate(() => document.querySelector('.oe-editor figure[data-oe-island]').focus());
    await page.waitForTimeout(50);
    const selected = await page.evaluate(() =>
      !!document.querySelector('.oe-editor figure.oe-figure--selected'));
    expect(selected).toBe(true);
  });

  test('IMG1-3: ArrowRight on a selected image resizes it', async ({ page }) => {
    await insertImage(page);
    const fig = page.locator('.oe-editor figure[data-oe-island]').first();
    await fig.click({ position: { x: 4, y: 4 } });
    await page.waitForTimeout(50);
    const before = await page.evaluate(() => {
      const img = document.querySelector('.oe-editor figure img');
      return Math.round(img.getBoundingClientRect().width);
    });
    // Fire ArrowRight with Shift for a 10px step so the change is unmistakable.
    await page.keyboard.press('Shift+ArrowRight');
    await page.waitForTimeout(50);
    const after = await page.evaluate(() => {
      const img = document.querySelector('.oe-editor figure img');
      return { w: Math.round(img.getBoundingClientRect().width),
               styleW: img.style.width };
    });
    // The resize writes an explicit px width, and the box grew.
    expect(after.styleW).toMatch(/^\d+px$/);
    expect(parseInt(after.styleW, 10)).toBeGreaterThan(before);
    expect(after.w).toBeGreaterThanOrEqual(before);
  });

  test('IMG1-3: Escape deselects and returns focus to the editor', async ({ page }) => {
    await insertImage(page);
    const fig = page.locator('.oe-editor figure[data-oe-island]').first();
    await fig.click({ position: { x: 4, y: 4 } });
    await page.waitForTimeout(40);
    expect(await page.evaluate(() =>
      !!document.querySelector('.oe-figure--selected'))).toBe(true);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(40);
    expect(await page.evaluate(() =>
      !!document.querySelector('.oe-figure--selected'))).toBe(false);
  });

  // ── IMG20: type-to-replace ─────────────────────────────────────────────────
  test('IMG20: typing a character over a selected image replaces it with that text', async ({ page }) => {
    await insertImage(page);
    const fig = page.locator('.oe-editor figure[data-oe-island]').first();
    await fig.click({ position: { x: 4, y: 4 } });
    await page.waitForTimeout(40);
    await page.keyboard.press('Z');
    await page.waitForTimeout(50);
    const state = await page.evaluate(() => {
      const ed = document.querySelector('.oe-editor');
      return { hasFigure: !!ed.querySelector('figure[data-oe-island]'),
               text: ed.textContent };
    });
    expect(state.hasFigure).toBe(false);
    expect(state.text.toLowerCase()).toContain('z');
  });

  test('IMG20: the replace is undoable back to the image', async ({ page }) => {
    await insertImage(page);
    const fig = page.locator('.oe-editor figure[data-oe-island]').first();
    await fig.click({ position: { x: 4, y: 4 } });
    await page.waitForTimeout(40);
    await page.keyboard.press('Z');
    await page.waitForTimeout(50);
    expect(await page.evaluate(() =>
      !!document.querySelector('.oe-editor figure[data-oe-island]'))).toBe(false);
    // A single undo restores the image (regression: the type-replace used to
    // drop the image from history so undo skipped straight past it).
    await page.evaluate(() => window.__openEditorInstance.undo());
    await page.waitForTimeout(80);
    expect(await page.evaluate(() =>
      !!document.querySelector('.oe-editor figure[data-oe-island]'))).toBe(true);
  });

  // ── IMG17: caption action-bar button ───────────────────────────────────────
  test('IMG17: caption button focuses the figcaption for editing', async ({ page }) => {
    await insertImage(page);
    const fig = page.locator('.oe-editor figure[data-oe-island]').first();
    await fig.click({ position: { x: 4, y: 4 } });
    await page.waitForTimeout(50);
    const capBtn = page.locator('.oe-img-actionbar__btn[aria-label="Add / edit caption"]').first();
    await expect(capBtn).toBeVisible();
    await capBtn.click();
    await page.waitForTimeout(50);
    const focusedIsCaption = await page.evaluate(() => {
      const a = document.activeElement;
      return !!(a && a.tagName === 'FIGCAPTION' && a.hasAttribute('data-oe-caption'));
    });
    expect(focusedIsCaption).toBe(true);
    // And typing lands in the caption.
    await page.keyboard.type('My caption');
    await page.waitForTimeout(40);
    const capText = await page.evaluate(() =>
      document.querySelector('.oe-editor figure figcaption').textContent);
    expect(capText).toContain('My caption');
  });

  // ── IMG4: missing-alt author badge ─────────────────────────────────────────
  test('IMG4: an image with no alt shows the ALT? author badge; one with alt does not', async ({ page }) => {
    // No alt → badge present.
    await insertImage(page);
    const badgeNoAlt = await page.evaluate(() => {
      const f = document.querySelector('.oe-editor figure[data-oe-island]');
      return getComputedStyle(f, '::after').content;
    });
    expect(badgeNoAlt).toContain('ALT?');

    // Fresh image WITH alt → no badge.
    await page.evaluate(() => { document.querySelector('.oe-editor').innerHTML = '<p><br></p>'; });
    await page.locator('.oe-editor').click();
    await insertImage(page, { alt: 'described' });
    const badgeWithAlt = await page.evaluate(() => {
      const f = document.querySelector('.oe-editor figure[data-oe-island]');
      return getComputedStyle(f, '::after').content;
    });
    expect(badgeWithAlt).not.toContain('ALT?');
  });

  // ── IMG13: broken image surfaces a toast ───────────────────────────────────
  test('IMG13: inserting a broken image URL surfaces an error toast', async ({ page }) => {
    await openImageDialog(page);
    // A syntactically-valid http(s) URL that will 404 / fail to decode.
    await fillUrlAndInsert(page, 'https://localhost:5173/definitely-not-an-image-xyz.png');
    // The <img> error handler fires a toast (role="alert").
    const toast = page.locator('.oe-toast[role="alert"], [role="alert"]').filter({ hasText: /could not be loaded/i }).first();
    await expect(toast).toBeVisible({ timeout: 6000 });
  });
});
