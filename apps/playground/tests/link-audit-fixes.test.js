/**
 * link-audit-fixes.test.js — live proof (Chromium/Firefox/WebKit) for the link
 * deep-audit fixes that are behaviour-dependent:
 *   L1 pasted <a> with a dangerous scheme is stripped by the sanitizer
 *   L3 inserting a link over a selection inside an existing link does not nest <a>
 *   L4 typing a bare domain in the dialog auto-prepends https://
 *   L6 Ctrl/Cmd+K then Escape restores the caret to the editor
 *   L7 popover exposes Copy + role=toolbar; Alt+Enter moves focus into it
 */
import { test, expect } from '@playwright/test';

const isMac = process.platform === 'darwin';
const MOD = isMac ? 'Meta' : 'Control';

async function openLinkDialog(page) {
  await page.locator('[title="Insert Link"], [aria-label="Insert Link"]').first().click();
  await page.waitForSelector('.oe-modal', { state: 'visible' });
}

test.describe('Link deep-audit fixes (live)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.oe-toolbar');
    await page.locator('.oe-editor').click();
  });

  test('L1: setHTML with a dangerous-scheme link is stripped on serialize', async ({ page }) => {
    const out = await page.evaluate(() => {
      const ed = window.__openEditorInstance;
      ed.setHTML('<p><a href="ms-msdt:x">a</a> <a href="https://ok.com">b</a></p>');
      return ed.getHTML();
    });
    expect(out).not.toContain('ms-msdt:');
    expect(out).toContain('https://ok.com'); // the safe one survives
  });

  test('L3: linking a selection inside an existing link does not nest <a>', async ({ page }) => {
    await page.evaluate(() => window.__openEditorInstance.setHTML(
      '<p>x <a href="https://old.com">one two three</a> y</p>'));
    // Select "two" inside the existing link.
    await page.evaluate(() => {
      const t = document.querySelector('.oe-editor a').firstChild;
      const r = document.createRange(); r.setStart(t, 4); r.setEnd(t, 7);
      const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
      document.querySelector('.oe-editor').focus();
    });
    await openLinkDialog(page);
    await page.locator('#oe-link-url').first().fill('https://new.com');
    await page.locator('.oe-modal button').filter({ hasText: /Insert Link|Update/ }).first().click();
    await page.waitForTimeout(120);
    const nested = await page.evaluate(() => !!document.querySelector('.oe-editor a a'));
    expect(nested).toBe(false);
  });

  test('L4: a bare domain gets https:// prepended', async ({ page }) => {
    await page.evaluate(() => window.__openEditorInstance.setHTML('<p>anchor me</p>'));
    await page.evaluate(() => {
      const t = document.querySelector('.oe-editor p').firstChild;
      const r = document.createRange(); r.setStart(t, 0); r.setEnd(t, 6); // "anchor"
      const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
      document.querySelector('.oe-editor').focus();
    });
    await openLinkDialog(page);
    await page.locator('#oe-link-url').first().fill('example.com');
    await page.locator('.oe-modal button').filter({ hasText: /Insert Link|Update/ }).first().click();
    await page.waitForTimeout(120);
    const href = await page.evaluate(() =>
      document.querySelector('.oe-editor a').getAttribute('href'));
    expect(href).toBe('https://example.com');
  });

  test('L6: Ctrl/Cmd+K then Escape returns focus to the editor', async ({ page }) => {
    await page.evaluate(() => window.__openEditorInstance.setHTML('<p>hello world</p>'));
    await page.locator('.oe-editor').click();
    await page.keyboard.press(`${MOD}+KeyK`);
    await page.waitForSelector('.oe-modal', { state: 'visible' });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(120);
    const editorFocused = await page.evaluate(() => {
      const ed = document.querySelector('.oe-editor');
      return document.activeElement === ed || ed.contains(document.activeElement);
    });
    expect(editorFocused).toBe(true);
  });

  test('L7: popover has a Copy button + role=toolbar; Alt+Enter focuses it', async ({ page }) => {
    await page.evaluate(() => window.__openEditorInstance.setHTML(
      '<p><a href="https://x.com">link</a></p>'));
    // Put the caret inside the link to surface the popover.
    await page.evaluate(() => {
      const a = document.querySelector('.oe-editor a');
      const r = document.createRange(); r.setStart(a.firstChild, 1); r.collapse(true);
      const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
      document.querySelector('.oe-editor').focus();
      document.dispatchEvent(new Event('selectionchange'));
    });
    await page.waitForTimeout(120);
    const meta = await page.evaluate(() => {
      const pop = document.querySelector('.oe-link-popover');
      return {
        role: pop && pop.getAttribute('role'),
        hasCopy: !!(pop && pop.querySelector('[aria-label="Copy link"]')),
      };
    });
    expect(meta.role).toBe('toolbar');
    expect(meta.hasCopy).toBe(true);

    await page.keyboard.press('Alt+Enter');
    await page.waitForTimeout(80);
    const focusInPopover = await page.evaluate(() => {
      const pop = document.querySelector('.oe-link-popover');
      return !!(pop && pop.contains(document.activeElement));
    });
    expect(focusInPopover).toBe(true);
  });
});
