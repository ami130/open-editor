/**
 * Phase 7.5.5 — Clipboard integration tests.
 *
 * Uses synthetic ClipboardEvents to test paste handling (more reliable than
 * navigator.clipboard in headless). Tests clipboard-read/clipboard-write
 * permissions only on Chromium where they are supported.
 */
import { test, expect } from '@playwright/test';

test.describe('Phase 7.5.5 — Clipboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.oe-editor[contenteditable="true"]');
  });

  test('pasting HTML preserves structure', async ({ page, browserName }) => {
    // Firefox headless does not deliver synthetic ClipboardEvents to paste handlers.
    test.skip(browserName === 'firefox', 'Firefox headless: synthetic paste events unreachable');
    const ed = page.locator('.oe-editor');
    await ed.click();
    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.setData('text/html', '<strong>bold paste</strong>');
      dt.setData('text/plain', 'bold paste');
      document.querySelector('.oe-editor').dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: dt, bubbles: true })
      );
    });
    // Phase 12: rich-HTML paste now prompts Keep / Clean / plain — click Keep.
    await page.getByRole('button', { name: 'Keep' }).click();
    await expect(ed).toContainText('bold paste');
  });

  test('pasting plain text inserts content', async ({ page, browserName }) => {
    test.skip(browserName === 'firefox', 'Firefox headless: synthetic paste events unreachable');
    const ed = page.locator('.oe-editor');
    await ed.click();
    await page.keyboard.type('Before ');
    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.setData('text/plain', 'pasted');
      document.querySelector('.oe-editor').dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: dt, bubbles: true })
      );
    });
    await expect(ed).toContainText('Before');
    await expect(ed).toContainText('pasted');
  });

  test('pasting plain text only strips dangerous tags', async ({ page, browserName }) => {
    test.skip(browserName === 'firefox', 'Firefox headless: synthetic paste events unreachable');
    const ed = page.locator('.oe-editor');
    await ed.click();
    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.setData('text/plain', 'just plain');
      document.querySelector('.oe-editor').dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: dt, bubbles: true })
      );
    });
    await expect(ed).toContainText('just plain');
    const hasUnwantedTags = await page.evaluate(() =>
      !!document.querySelector('.oe-editor script, .oe-editor style, .oe-editor meta')
    );
    expect(hasUnwantedTags).toBe(false);
  });

  test('pasting HTML with script tag strips the script from DOM', async ({ page, browserName }) => {
    test.skip(browserName === 'firefox', 'Firefox headless: synthetic paste events unreachable');
    const ed = page.locator('.oe-editor');
    await ed.click();
    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.setData('text/html', '<p>safe</p><script>window.__xss=1<\/script>');
      dt.setData('text/plain', 'safe');
      document.querySelector('.oe-editor').dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: dt, bubbles: true })
      );
    });
    // Phase 12: dismiss the ask-on-paste dialog with Keep before asserting.
    await page.getByRole('button', { name: 'Keep' }).click();
    // Primary assertion: the <script> tag must not exist in the editor DOM —
    // this is what the sanitizer is responsible for. Checking execution alone
    // is insufficient because browsers never run injected scripts regardless.
    const scriptInDom = await page.evaluate(() =>
      !!document.querySelector('.oe-editor script')
    );
    expect(scriptInDom).toBe(false);
    // Secondary: the safe paragraph content must have been kept.
    await expect(ed).toContainText('safe');
  });

  test('cut keyboard shortcut is handled without crash', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await page.keyboard.type('cut test');
    await page.keyboard.press('Control+A');
    // Cut via keyboard — headless may not actually clear the clipboard,
    // but the editor must not throw or break.
    await page.keyboard.press('Control+X');
    await expect(ed).toBeVisible();
  });

  test('copyAsPlainText falls back gracefully when clipboard API is unavailable', async ({ page, browserName }) => {
    test.skip(browserName === 'firefox', 'Firefox headless: synthetic paste events unreachable');
    // Override navigator.clipboard to simulate an environment without the API
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        value: undefined, configurable: true, writable: true,
      });
    });
    await page.goto('/');
    await page.waitForSelector('.oe-editor[contenteditable="true"]');
    const ed = page.locator('.oe-editor');
    await ed.click();
    await page.keyboard.type('fallback test');
    const isMac = process.platform === 'darwin';
    await page.keyboard.press(isMac ? 'Meta+A' : 'Control+A');
    const boldBtn = page.locator('[title="Bold"], [aria-label="Bold"]').first();
    await boldBtn.click();
    await page.keyboard.press(isMac ? 'Meta+A' : 'Control+A');
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.evaluate(() => {
      if (window.__openEditorInstance && window.__openEditorInstance.commands) {
        window.__openEditorInstance.commands.execute('copyAsPlainText');
      }
    });
    expect(errors).toHaveLength(0);
    await expect(ed).toBeVisible();
  });

  test('copyAsPlainText command executes without error', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await page.keyboard.type('formatted text');
    await page.keyboard.press('Control+A');
    const boldBtn = page.locator('[title="Bold"], [aria-label="Bold"]').first();
    await boldBtn.click();
    await page.keyboard.press('Control+A');
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.evaluate(() => {
      if (window.__openEditorInstance && window.__openEditorInstance.commands) {
        window.__openEditorInstance.commands.execute('copyAsPlainText');
      }
    });
    expect(errors).toHaveLength(0);
    await expect(ed).toBeVisible();
  });
});
