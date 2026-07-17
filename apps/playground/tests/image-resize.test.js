/**
 * Phase 9 — Image resize e2e tests.
 * Covers: overlay appears on select, corner-drag resizes the img, dimension
 * badge shows during drag, undo restores pre-resize size.
 *
 * The 1×1 data-URI image is given an explicit width/height so the figure has a
 * stable starting box to drag from.
 */
import { test, expect } from '@playwright/test';

const isMac = process.platform === 'darwin';
const MOD   = isMac ? 'Meta' : 'Control';
const DATA_IMG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==';

// Insert a figure with a known starting size directly via setHTML, then click
// it to spawn the resize overlay.
async function insertSizedFigureAndSelect(page) {
  await page.evaluate((src) => {
    const ed = window.__openEditorInstance;
    ed.setHTML(
      `<p>before</p>` +
      `<figure contenteditable="false" data-oe-island="image" class="oe-figure">` +
      `<img src="${src}" width="120" height="80" style="width:120px;height:80px">` +
      `<figcaption contenteditable="true" data-oe-caption=""></figcaption></figure>` +
      `<p>after</p>`
    );
  }, DATA_IMG);
  const fig = page.locator('.oe-editor figure[data-oe-island]').first();
  await fig.scrollIntoViewIfNeeded();
  await fig.click({ position: { x: 10, y: 10 } });
  await page.waitForTimeout(80);
  return fig;
}

test.describe('Phase 9 — Image Resize', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.oe-toolbar');
    await page.locator('.oe-editor').click();
  });

  test('selecting an image shows the resize overlay with 8 handles', async ({ page }) => {
    await insertSizedFigureAndSelect(page);
    const overlay = page.locator('.oe-resize-overlay').first();
    await expect(overlay).toBeVisible();
    const handleCount = await page.locator('.oe-resize-handle').count();
    expect(handleCount).toBe(8);
  });

  test('dragging the SE corner handle grows the image', async ({ page }) => {
    await insertSizedFigureAndSelect(page);

    const before = await page.evaluate(() => {
      const img = document.querySelector('.oe-editor figure img');
      return img.getBoundingClientRect().width;
    });

    const seHandle = page.locator('.oe-resize-handle--se').first();
    const box = await seHandle.boundingBox();
    expect(box).not.toBeNull();

    // Drag the SE handle 60px right and 40px down.
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 40, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(80);

    const after = await page.evaluate(() => {
      const img = document.querySelector('.oe-editor figure img');
      return img.getBoundingClientRect().width;
    });

    expect(after).toBeGreaterThan(before);
  });

  test('dimension badge appears during drag', async ({ page }) => {
    await insertSizedFigureAndSelect(page);
    const seHandle = page.locator('.oe-resize-handle--se').first();
    const box = await seHandle.boundingBox();

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 50, box.y + box.height / 2 + 30, { steps: 6 });

    const badgeText = await page.evaluate(() => {
      const b = document.querySelector('.oe-resize-badge');
      return b ? b.textContent : '';
    });
    await page.mouse.up();

    expect(badgeText).toMatch(/\d+\s*×\s*\d+/);
  });

  test('undo restores the pre-resize dimensions', async ({ page }) => {
    await insertSizedFigureAndSelect(page);

    const seHandle = page.locator('.oe-resize-handle--se').first();
    const box = await seHandle.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 70, box.y + box.height / 2 + 50, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(80);

    const resized = await page.evaluate(() =>
      document.querySelector('.oe-editor figure img').getBoundingClientRect().width
    );
    expect(resized).toBeGreaterThan(120);

    // Undo — should return to the 120px starting width.
    await page.locator('.oe-editor').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press(`${MOD}+z`);
    await page.waitForTimeout(120);

    const restored = await page.evaluate(() =>
      document.querySelector('.oe-editor figure img').getBoundingClientRect().width
    );
    // Allow a small tolerance for sub-pixel rounding.
    expect(Math.abs(restored - 120)).toBeLessThan(8);
  });

  // ── 2026-07-16: corner drag PRESERVES aspect ratio by default (no squish).
  //    The ratio it preserves is the image's INTRINSIC ratio (naturalWidth/
  //    naturalHeight), so a prior stretch can't poison later drags (#1). ──
  test('corner drag keeps the intrinsic aspect ratio by default', async ({ page }) => {
    await insertSizedFigureAndSelect(page);
    // Pin a KNOWN intrinsic ratio (2:1) on the img so the assertion is
    // deterministic across engines — the tiny placeholder's real naturalWidth
    // is unreliable in headless Firefox. The plugin reads naturalWidth/Height
    // at drag-start, so stubbing them exercises the exact #1 code path.
    await page.evaluate(() => {
      const img = document.querySelector('.oe-editor figure img');
      Object.defineProperty(img, 'naturalWidth',  { value: 200, configurable: true });
      Object.defineProperty(img, 'naturalHeight', { value: 100, configurable: true });
    });

    const seHandle = page.locator('.oe-resize-handle--se').first();
    const box = await seHandle.boundingBox();
    // drag mostly horizontally; the OTHER axis must follow to keep the 2:1 ratio
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 10, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(80);
    const { w, h } = await page.evaluate(() => {
      const r = document.querySelector('.oe-editor figure img').getBoundingClientRect();
      return { w: r.width, h: r.height };
    });
    // the resized box tracks the INTRINSIC 2:1 ratio (not stretched, not squished)
    expect(Math.abs(w / h - 2)).toBeLessThan(0.2);
  });

  // ── The reported bug: Center must ACTUALLY center a smaller image. ──
  test('centering shrink-wraps the figure and centers it in the editor', async ({ page }) => {
    await page.evaluate((src) => {
      window.__openEditorInstance.setHTML(
        `<p>before</p>` +
        `<figure contenteditable="false" data-oe-island="image" class="oe-figure">` +
        `<img src="${src}" width="120" height="80" style="width:120px;height:80px"></figure>` +
        `<p>after</p>`);
    }, DATA_IMG);
    // The plugin's applyAlignment adds exactly this class (verified in the unit
    // tests); apply it and measure the resulting real layout in the browser.
    const centered = await page.evaluate(() => {
      const ed = document.querySelector('.oe-editor');
      const fig = ed.querySelector('figure[data-oe-island]');
      fig.classList.add('oe-figure--center');
      const edRect = ed.getBoundingClientRect();
      const fRect = fig.getBoundingClientRect();
      // figure shrank to ~the image width (not full editor width)…
      const shrankToContent = fRect.width < edRect.width * 0.6;
      // …and is roughly centered: left gap ≈ right gap
      const leftGap = fRect.left - edRect.left;
      const rightGap = edRect.right - fRect.right;
      return { shrankToContent, balanced: Math.abs(leftGap - rightGap) < 12, leftGap, rightGap };
    });
    expect(centered.shrankToContent).toBe(true);
    expect(centered.balanced).toBe(true);
  });

  // #4: a caption wider than the image widens the figure (fit-content) — the
  // image must stay centered inside it, not stuck to the left.
  test('centered image stays centered even when the caption is wider', async ({ page }) => {
    await page.evaluate((src) => {
      window.__openEditorInstance.setHTML(
        `<p>x</p>` +
        `<figure contenteditable="false" data-oe-island="image" class="oe-figure oe-figure--center">` +
        `<img src="${src}" width="80" height="60" style="width:80px;height:60px">` +
        `<figcaption>A rather long descriptive caption that is wider than the image</figcaption>` +
        `</figure><p>y</p>`);
    }, DATA_IMG);
    const centeredInFig = await page.evaluate(() => {
      const fig = document.querySelector('.oe-editor figure[data-oe-island]');
      const img = fig.querySelector('img');
      const fRect = fig.getBoundingClientRect();
      const iRect = img.getBoundingClientRect();
      // the figure is wider than the image (caption widened it)…
      const figWider = fRect.width > iRect.width + 10;
      // …and the image is centered within the figure (left gap ≈ right gap)
      const leftGap = iRect.left - fRect.left;
      const rightGap = fRect.right - iRect.right;
      return { figWider, imgCentered: Math.abs(leftGap - rightGap) < 6 };
    });
    expect(centeredInFig.figWider).toBe(true);
    expect(centeredInFig.imgCentered).toBe(true);
  });
});
