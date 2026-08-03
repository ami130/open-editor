/**
 * bugfix-regressions.test.js — real-browser-only bugs found via live Playwright
 * investigation (jsdom could not reproduce either): fullscreen's position:fixed
 * losing a same-specificity CSS cascade tie to a later-injected plugin
 * stylesheet, and the media-embed plugin breaking on an empty editor because
 * insertAtCursor() mishandled a caret positioned on the <br> placeholder.
 */
import { test, expect } from '@playwright/test';

test.describe('Fullscreen — CSS cascade regression', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.oe-editor[contenteditable="true"]');
  });

  test('toggling fullscreen actually covers the viewport (position:fixed wins the cascade)', async ({ page }) => {
    const vp = page.viewportSize();
    await page.locator('button[aria-label="Fullscreen" i]').click();
    await page.waitForTimeout(200);
    const info = await page.evaluate(() => {
      const w = document.querySelector('.oe-wrapper');
      const cs = getComputedStyle(w);
      return { position: cs.position, width: cs.width, height: cs.height };
    });
    expect(info.position).toBe('fixed');
    expect(info.width).toBe(`${vp.width}px`);
    expect(info.height).toBe(`${vp.height}px`);
  });
});

test.describe('Media embed — insertAtCursor regression', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.oe-editor[contenteditable="true"]');
  });

  async function embedViaDialog(page, url) {
    await page.locator('button[aria-label="Embed video" i]').click();
    await page.waitForTimeout(150);
    const modal = page.locator('.oe-modal, [role="dialog"]').last();
    await page.locator('.oe-embed-dialog__input').fill(url);
    await modal.locator('button:has-text("Embed")').click();
    await page.waitForTimeout(200);
  }

  test('embedding into a freshly-empty editor inserts cleanly, contained, and editable afterward', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await embedViaDialog(page, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');

    const fig = ed.locator('.oe-embed');
    await expect(fig).toHaveCount(1);
    const figBox = await fig.boundingBox();
    const edBox = await ed.boundingBox();
    // No overflow past the editor's right edge.
    expect(figBox.x + figBox.width).toBeLessThanOrEqual(edBox.x + edBox.width + 1);

    // Typing right after the embed must land in a new paragraph, not inside
    // the <figure> itself (contenteditable's boundary-typing quirk).
    await page.keyboard.type('after embed');
    await expect(ed).toContainText('after embed');
    const leaked = await page.evaluate(() =>
      document.querySelector('.oe-embed').textContent.includes('after embed'));
    expect(leaked).toBe(false);
  });

  test('embedding after existing text preserves the text and places the embed as a sibling', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await page.keyboard.type('hello world');
    await page.keyboard.press('End');
    await embedViaDialog(page, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    await expect(ed).toContainText('hello world');
    await expect(ed.locator('.oe-embed')).toHaveCount(1);
  });

  test('pasting a bare YouTube URL auto-embeds instead of linking', async ({ page, browserName }) => {
    test.skip(browserName === 'firefox', 'Firefox headless: synthetic paste events unreachable (see paste-engine.test.js)');
    const ed = page.locator('.oe-editor');
    await ed.click();
    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.setData('text/plain', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      document.querySelector('.oe-editor').dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    });
    await page.waitForTimeout(150);
    await expect(ed.locator('.oe-embed')).toHaveCount(1);
    await expect(ed.locator('a')).toHaveCount(0);
  });

  test('pasting a non-media URL still autolinks (auto-embed does not overreach)', async ({ page, browserName }) => {
    test.skip(browserName === 'firefox', 'Firefox headless: synthetic paste events unreachable (see paste-engine.test.js)');
    const ed = page.locator('.oe-editor');
    await ed.click();
    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.setData('text/plain', 'https://example.com/page');
      document.querySelector('.oe-editor').dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    });
    await page.waitForTimeout(150);
    await expect(ed.locator('a')).toHaveCount(1);
    await expect(ed.locator('.oe-embed')).toHaveCount(0);
  });

  test('pasting a URL mixed with other text does not auto-embed', async ({ page, browserName }) => {
    test.skip(browserName === 'firefox', 'Firefox headless: synthetic paste events unreachable (see paste-engine.test.js)');
    const ed = page.locator('.oe-editor');
    await ed.click();
    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.setData('text/plain', 'check this out: https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      document.querySelector('.oe-editor').dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    });
    await page.waitForTimeout(150);
    await expect(ed.locator('.oe-embed')).toHaveCount(0);
    await expect(ed).toContainText('check this out');
  });
});

test.describe('Enter after inline formatting — new line must advance', () => {
  // Reported bug: type bold/italic/underline text, press Enter → the caret
  // couldn't move to the next line, because the split produced an empty inline
  // wrapper (<p><strong></strong></p>) with no <br> — an invalid caret target.
  // jsdom couldn't judge the caret behavior; this is the real-browser guard.
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.oe-editor[contenteditable="true"]');
  });

  for (const fmt of ['bold', 'italic', 'underline']) {
    test(`${fmt}: type → Enter → type lands on a NEW line`, async ({ page }) => {
      const ed = page.locator('.oe-editor');
      await ed.click();
      await page.locator(`.oe-tb__btn[data-name="${fmt}"]`).click(); // toggle format ON
      await page.keyboard.type('first');
      await page.keyboard.press('Enter');
      await page.keyboard.type('second');
      await page.waitForTimeout(120);

      const blocks = await ed.evaluate((el) => el.children.length);
      const l1 = await ed.evaluate((el) => (el.children[0]?.textContent || '').trim());
      const l2 = await ed.evaluate((el) => (el.children[1]?.textContent || '').trim());
      expect(blocks).toBeGreaterThanOrEqual(2);      // a real second line exists
      expect(l1).toContain('first');
      expect(l2).toContain('second');                // "second" advanced, not stuck on line 1
    });
  }
});
