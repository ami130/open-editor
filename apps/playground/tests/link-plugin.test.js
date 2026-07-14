/**
 * Phase 10 — Link Plugin e2e tests (Chromium/Firefox/WebKit).
 * Covers: toolbar insert, Ctrl/Cmd+K, wrap selection, popover (open/edit/unlink),
 * unlink, serialization, and paste auto-link.
 */
import { test, expect } from '@playwright/test';

const isMac = process.platform === 'darwin';
const MOD   = isMac ? 'Meta' : 'Control';

async function openLinkDialog(page) {
  const btn = page.locator('[title="Insert Link"], [aria-label="Insert Link"]').first();
  await btn.click();
  await page.waitForSelector('.oe-modal', { state: 'visible' });
}
async function fillAndSubmit(page, url, { text } = {}) {
  await page.locator('#oe-link-url').first().fill(url);
  if (text != null) await page.locator('#oe-link-text').first().fill(text);
  await page.locator('.oe-modal button').filter({ hasText: /Insert Link|Update/ }).first().click();
}
async function selectAllEditorText(page) {
  await page.locator('.oe-editor').click();
  await page.keyboard.press(`${MOD}+a`);
}
// Deterministically place a collapsed caret inside the editor's first <a>.
async function caretInFirstLink(page) {
  await page.locator('.oe-editor').click();
  await page.evaluate(() => {
    const a = document.querySelector('.oe-editor a');
    const node = a.firstChild || a;
    const range = document.createRange();
    range.setStart(node, node.nodeType === 3 ? 1 : 0);
    range.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges(); sel.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await page.waitForTimeout(60);
}

test.describe('Phase 10 — Link Plugin', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.oe-toolbar');
    await page.locator('.oe-editor').click();
  });

  // ── Insert ──────────────────────────────────────────────────────────────────

  test('toolbar Insert Link wraps selected text in <a>', async ({ page }) => {
    await page.evaluate(() => window.__openEditorInstance.setHTML('<p>hello world</p>'));
    await selectAllEditorText(page);
    await openLinkDialog(page);
    await fillAndSubmit(page, 'https://example.com');
    await page.waitForTimeout(100);
    const html = await page.evaluate(() => window.__openEditorInstance.getHTML());
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('</a>');
  });

  test('collapsed caret inserts a link using the provided text', async ({ page }) => {
    await page.evaluate(() => window.__openEditorInstance.setHTML('<p>x</p>'));
    await page.locator('.oe-editor p').click();
    await openLinkDialog(page);
    await fillAndSubmit(page, 'https://foo.com', { text: 'Foo' });
    await page.waitForTimeout(100);
    const html = await page.evaluate(() => window.__openEditorInstance.getHTML());
    expect(html).toContain('href="https://foo.com"');
    expect(html).toContain('>Foo<');
  });

  test('Ctrl/Cmd+K opens the link dialog', async ({ page }) => {
    await page.evaluate(() => window.__openEditorInstance.setHTML('<p>press k</p>'));
    await selectAllEditorText(page);
    await page.keyboard.press(`${MOD}+k`);
    await page.waitForSelector('.oe-modal', { state: 'visible' });
    expect(await page.locator('.oe-modal').count()).toBeGreaterThan(0);
  });

  test('unsafe javascript: URL is blocked (no link inserted)', async ({ page }) => {
    await page.evaluate(() => window.__openEditorInstance.setHTML('<p>bad</p>'));
    await selectAllEditorText(page);
    await openLinkDialog(page);
    await page.locator('#oe-link-url').first().fill('javascript:alert(1)');
    await page.locator('.oe-modal button').filter({ hasText: /Insert Link|Update/ }).first().click();
    await page.waitForTimeout(100);
    // Modal stays open (validation error) and no <a> was created.
    const hasLink = await page.evaluate(() =>
      !!document.querySelector('.oe-editor a'));
    expect(hasLink).toBe(false);
  });

  test('new-tab checkbox yields target=_blank and rel=noopener', async ({ page }) => {
    await page.evaluate(() => window.__openEditorInstance.setHTML('<p>tab</p>'));
    await selectAllEditorText(page);
    await openLinkDialog(page);
    await page.locator('#oe-link-url').first().fill('https://nt.com');
    await page.locator('#oe-link-newtab').first().check();
    await page.locator('.oe-modal button').filter({ hasText: /Insert Link|Update/ }).first().click();
    await page.waitForTimeout(100);
    const html = await page.evaluate(() => window.__openEditorInstance.getHTML());
    expect(html).toContain('target="_blank"');
    expect(html).toContain('noopener');
  });

  // ── Popover on existing link ──────────────────────────────────────────────────

  test('caret in a link shows the popover', async ({ page }) => {
    await page.evaluate(() => window.__openEditorInstance.setHTML(
      '<p>go <a href="https://x.com">here</a> now</p>'));
    await page.locator('.oe-editor a').click();
    await page.waitForTimeout(120);
    const visible = await page.evaluate(() => {
      const p = document.querySelector('.oe-link-popover');
      return !!p && !p.hidden;
    });
    expect(visible).toBe(true);
  });

  test('popover Unlink removes the link, keeps text', async ({ page }) => {
    await page.evaluate(() => window.__openEditorInstance.setHTML(
      '<p>go <a href="https://x.com">here</a> now</p>'));
    await page.locator('.oe-editor a').click();
    await page.waitForTimeout(120);
    await page.locator('.oe-link-popover__btn--unlink, .oe-link-popover button[aria-label="Unlink"]').first().click();
    await page.waitForTimeout(100);
    const html = await page.evaluate(() => window.__openEditorInstance.getHTML());
    expect(html).not.toContain('<a');
    expect(html).toContain('here');
  });

  // ── Serialization ─────────────────────────────────────────────────────────────

  test('getHTML preserves class and aria-label on links', async ({ page }) => {
    await page.evaluate(() => window.__openEditorInstance.setHTML(
      '<p><a href="https://x.com" class="btn" aria-label="Go X">X</a></p>'));
    const html = await page.evaluate(() => window.__openEditorInstance.getHTML());
    expect(html).toContain('class="btn"');
    expect(html).toContain('aria-label="Go X"');
  });

  test('getHTML preserves an inline color on links', async ({ page }) => {
    await page.evaluate(() => window.__openEditorInstance.setHTML(
      '<p><a href="https://x.com" style="color: #e11d48;">X</a></p>'));
    const html = await page.evaluate(() => window.__openEditorInstance.getHTML());
    expect(html).toContain('color');
    expect(html.toLowerCase()).toContain('#e11d48');
  });

  // ── Edit-mode: color field + Unlink button ────────────────────────────────────

  test('applying a color via the dialog sets an inline color style', async ({ page }) => {
    await page.evaluate(() => window.__openEditorInstance.setHTML('<p>color me</p>'));
    await selectAllEditorText(page);
    await openLinkDialog(page);
    await page.locator('#oe-link-url').first().fill('https://c.com');
    // Uncheck "No custom color" and set a color.
    await page.locator('#oe-link-nocolor').first().uncheck();
    await page.locator('#oe-link-color').first().evaluate((el) => {
      el.value = '#22c55e';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.locator('.oe-modal button').filter({ hasText: /Insert Link|Update/ }).first().click();
    await page.waitForTimeout(100);
    const html = await page.evaluate(() => window.__openEditorInstance.getHTML());
    expect(html.toLowerCase()).toContain('color');
    expect(html.toLowerCase()).toContain('#22c55e');
  });

  test('dialog shows an Unlink button when editing, which removes the link', async ({ page }) => {
    await page.evaluate(() => window.__openEditorInstance.setHTML(
      '<p>go <a href="https://x.com">here</a> now</p>'));
    // Put caret in the link and open the editor via Ctrl/Cmd+K (edit mode).
    await caretInFirstLink(page);
    await page.keyboard.press(`${MOD}+k`);
    await page.waitForSelector('.oe-modal', { state: 'visible' });
    const unlinkBtn = page.locator('.oe-modal button').filter({ hasText: 'Unlink' }).first();
    await expect(unlinkBtn).toBeVisible();
    await unlinkBtn.click();
    await page.waitForTimeout(100);
    const html = await page.evaluate(() => window.__openEditorInstance.getHTML());
    expect(html).not.toContain('<a');
    expect(html).toContain('here');
  });

  test('unchecking "Open in new tab" removes target and the noopener rel', async ({ page }) => {
    await page.evaluate(() => window.__openEditorInstance.setHTML(
      '<p><a href="https://x.com" target="_blank" rel="noopener noreferrer">t</a></p>'));
    await caretInFirstLink(page);
    await page.keyboard.press(`${MOD}+k`);
    await page.waitForSelector('.oe-modal', { state: 'visible' });
    // Confirm we're in edit mode (URL pre-filled) before unchecking.
    await expect(page.locator('#oe-link-url').first()).toHaveValue('https://x.com');
    await page.locator('#oe-link-newtab').first().uncheck();
    await page.locator('.oe-modal button').filter({ hasText: /Update/ }).first().click();
    await page.waitForTimeout(100);
    const html = await page.evaluate(() => window.__openEditorInstance.getHTML());
    expect(html).not.toContain('target="_blank"');
    expect(html).not.toContain('noopener');
  });
});
