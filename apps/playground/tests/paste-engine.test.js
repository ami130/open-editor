/**
 * Phase 12 e2e — the paste engine: ask-on-paste dialog, Keep/Clean/plain
 * actions, Word cleanup + list reconstruction, and Ctrl+Shift+V.
 *
 * Synthetic ClipboardEvents (Firefox headless doesn't deliver them to paste
 * handlers, so those cases skip there — same convention as clipboard.test.js).
 */
import { test, expect } from '@playwright/test';

async function pasteHtml(page, html, plain) {
  await page.evaluate(({ html, plain }) => {
    const dt = new DataTransfer();
    if (html) dt.setData('text/html', html);
    if (plain != null) dt.setData('text/plain', plain);
    document.querySelector('.oe-editor').dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: dt, bubbles: true })
    );
  }, { html, plain });
}

test.describe('Phase 12 — Paste engine', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.oe-editor[contenteditable="true"]');
    await page.locator('.oe-editor').click();
  });

  test('rich HTML paste opens the ask-on-paste dialog', async ({ page, browserName }) => {
    test.skip(browserName === 'firefox', 'Firefox headless: synthetic paste events unreachable');
    await pasteHtml(page, '<strong>hi</strong>', 'hi');
    await expect(page.locator('.oe-modal')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Keep' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Insert only Text' })).toBeVisible();
  });

  test('Keep preserves formatting', async ({ page, browserName }) => {
    test.skip(browserName === 'firefox', 'Firefox headless: synthetic paste events unreachable');
    await pasteHtml(page, '<strong>keepme</strong>', 'keepme');
    await page.getByRole('button', { name: 'Keep' }).click();
    const hasStrong = await page.evaluate(() => !!document.querySelector('.oe-editor strong'));
    expect(hasStrong).toBe(true);
  });

  test('Insert only Text strips formatting', async ({ page, browserName }) => {
    test.skip(browserName === 'firefox', 'Firefox headless: synthetic paste events unreachable');
    await pasteHtml(page, '<strong>textonly</strong>', 'textonly');
    await page.getByRole('button', { name: 'Insert only Text' }).click();
    await expect(page.locator('.oe-editor')).toContainText('textonly');
    const hasStrong = await page.evaluate(() => !!document.querySelector('.oe-editor strong'));
    expect(hasStrong).toBe(false);
  });

  test('Word paste shows the Word dialog and reconstructs a real list on Keep', async ({ page, browserName }) => {
    test.skip(browserName === 'firefox', 'Firefox headless: synthetic paste events unreachable');
    const wordList = `<html xmlns:o="urn:schemas-microsoft-com:office:office"><body>
<p class=MsoListParagraph style='mso-list:l0 level1 lfo1'>
<!--[if !supportLists]--><span style='font-family:Symbol;mso-list:Ignore'>&middot;</span><!--[endif]-->First</p>
<p class=MsoListParagraph style='mso-list:l0 level1 lfo1'>
<!--[if !supportLists]--><span style='font-family:Symbol;mso-list:Ignore'>&middot;</span><!--[endif]-->Second</p>
</body></html>`;
    await pasteHtml(page, wordList, 'First\nSecond');
    // Word variant of the dialog.
    await expect(page.locator('.oe-modal')).toContainText('Word');
    await page.getByRole('button', { name: 'Keep' }).click();
    // A real <ul> with two <li> should now exist — Word emitted flat paragraphs.
    const listInfo = await page.evaluate(() => {
      const ul = document.querySelector('.oe-editor ul');
      return ul ? ul.querySelectorAll('li').length : 0;
    });
    expect(listInfo).toBeGreaterThanOrEqual(2);
    const noMso = await page.evaluate(() => !/mso-/.test(document.querySelector('.oe-editor').innerHTML));
    expect(noMso).toBe(true);
  });

  test('Ctrl+Shift+V pastes as plain text (no dialog, no formatting)', async ({ page, browserName }) => {
    test.skip(browserName === 'firefox', 'Firefox headless: synthetic paste events unreachable');
    // Arm the force-plain flag with the real shortcut, then paste rich HTML.
    await page.keyboard.press('Control+Shift+V');
    await pasteHtml(page, '<strong>plainme</strong>', 'plainme');
    // No dialog should appear for a forced-plain paste.
    await expect(page.locator('.oe-modal')).toHaveCount(0);
    await expect(page.locator('.oe-editor')).toContainText('plainme');
    const hasStrong = await page.evaluate(() => !!document.querySelector('.oe-editor strong'));
    expect(hasStrong).toBe(false);
  });
});
