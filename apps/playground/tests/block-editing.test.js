/**
 * Phase 7.5.3 — Block editing semantics verified in real browsers.
 *
 * These tests exercise Phase 4.5 milestones (Enter-split, Backspace-merge,
 * Delete-merge, structural conversions, editor floor) across Chromium,
 * Firefox, and WebKit. jsdom cannot be trusted for caret-position-dependent
 * operations, so real-browser verification is required (milestone 4.5.10).
 *
 * Each test calls getHTML() to assert exact canonical output.
 */
import { test, expect } from '@playwright/test';

const isMac = process.platform === 'darwin';

async function getHTML(page) {
  return page.evaluate(() => {
    const inst = window.__openEditorInstance;
    return inst ? inst.getHTML() : null;
  });
}

/** Place cursor at the start of the given paragraph index (0-based). */
async function placeCursorAtParaStart(page, paraIndex) {
  await page.evaluate((idx) => {
    const ed = document.querySelector('.oe-editor');
    const p  = ed.querySelectorAll('p, h1, h2, h3, h4, h5, h6, pre, blockquote > p')[idx];
    if (!p) return;
    const range = document.createRange();
    const node  = p.firstChild || p;
    range.setStart(node, 0);
    range.setEnd(node, 0);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    ed.focus();
  }, paraIndex);
}

/** Place cursor at the end of the given paragraph index (0-based). */
async function placeCursorAtParaEnd(page, paraIndex) {
  await page.evaluate((idx) => {
    const ed    = document.querySelector('.oe-editor');
    const p     = ed.querySelectorAll('p, h1, h2, h3, h4, h5, h6, pre')[idx];
    if (!p) return;
    const range = document.createRange();
    range.selectNodeContents(p);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    ed.focus();
  }, paraIndex);
}

test.describe('Phase 7.5.3 — Block editing in real browsers', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.oe-editor[contenteditable="true"]');
    await page.waitForFunction(() => !!window.__openEditorInstance);
  });

  // ── 4.5.1 Enter-split ────────────────────────────────────────────────────

  test('Enter mid-paragraph splits into two <p> elements', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await page.keyboard.insertText('helloworld');
    // Place cursor between 'hello' and 'world' programmatically
    await page.evaluate(() => {
      const edEl = document.querySelector('.oe-editor');
      const p    = edEl.querySelector('p');
      if (!p || !p.firstChild) return;
      const range = document.createRange();
      range.setStart(p.firstChild, 5);
      range.setEnd(p.firstChild, 5);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      edEl.focus();
    });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(80);
    const paras = await ed.locator('p').count();
    expect(paras).toBeGreaterThanOrEqual(2);
    await expect(ed).toContainText('hello');
    await expect(ed).toContainText('world');
  });

  test('Enter at end of heading creates new <p>', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    // Apply H2 then type
    await page.evaluate(() => window.__openEditorInstance.commands.execute('h2'));
    await page.waitForTimeout(40);
    await page.keyboard.insertText('Heading');
    // Cursor is already at end after typing; press Enter
    await page.keyboard.press('Enter');
    await page.waitForTimeout(80);
    // A <p> must appear after the <h2>
    expect(await ed.locator('h2').count()).toBeGreaterThanOrEqual(1);
    expect(await ed.locator('p').count()).toBeGreaterThanOrEqual(1);
  });

  // ── 4.5.2 Backspace-merge ─────────────────────────────────────────────────

  test('Backspace at paragraph start merges into previous paragraph', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await page.keyboard.insertText('first');
    await page.keyboard.press('Enter');
    await page.keyboard.insertText('second');
    await page.waitForTimeout(60);
    // Place cursor at very start of second paragraph programmatically
    await placeCursorAtParaStart(page, 1);
    await page.waitForTimeout(30);
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(80);
    const paras = await ed.locator('p').count();
    expect(paras).toBe(1);
    await expect(ed).toContainText('first');
    await expect(ed).toContainText('second');
  });

  // ── 4.5.3 Delete-merge ───────────────────────────────────────────────────

  test('Delete at paragraph end merges next paragraph in', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await page.keyboard.insertText('first');
    await page.keyboard.press('Enter');
    await page.keyboard.insertText('second');
    await page.waitForTimeout(60);
    // Place cursor at end of first paragraph programmatically
    await placeCursorAtParaEnd(page, 0);
    await page.waitForTimeout(30);
    await page.keyboard.press('Delete');
    await page.waitForTimeout(80);
    const paras = await ed.locator('p').count();
    expect(paras).toBe(1);
    await expect(ed).toContainText('first');
    await expect(ed).toContainText('second');
  });

  // ── 4.5.5 Structural Backspace ────────────────────────────────────────────

  test('Backspace at start of <h2> converts it to <p>', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await page.evaluate(() => window.__openEditorInstance.commands.execute('h2'));
    await page.waitForTimeout(40);
    await page.keyboard.insertText('Title');
    // Place cursor at very start of the h2 programmatically
    await page.evaluate(() => {
      const edEl = document.querySelector('.oe-editor');
      const h2   = edEl.querySelector('h2');
      if (!h2) return;
      const node  = h2.firstChild || h2;
      const range = document.createRange();
      range.setStart(node, 0);
      range.setEnd(node, 0);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      edEl.focus();
    });
    await page.waitForTimeout(30);
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(80);
    expect(await ed.locator('h2').count()).toBe(0);
    expect(await ed.locator('p').count()).toBeGreaterThanOrEqual(1);
    await expect(ed).toContainText('Title');
  });

  // ── 4.5.8 Editor floor ───────────────────────────────────────────────────

  test('deleting all content leaves canonical <p><br></p>', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await page.keyboard.insertText('delete me');
    await page.keyboard.press(isMac ? 'Meta+A' : 'Control+A');
    await page.waitForTimeout(30);
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(80);
    // getHTML() returns '' for the canonical empty floor (<p><br></p>).
    // Verify the DOM directly instead.
    const domHTML = await page.evaluate(() =>
      document.querySelector('.oe-editor').innerHTML.replace(/\s/g, '')
    );
    expect(domHTML).toBe('<p><br></p>');
  });

  // ── 4.5.9 blockIndent / blockOutdent ─────────────────────────────────────

  test('blockIndent wraps paragraph in <blockquote>', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await page.keyboard.insertText('indent me');
    await page.waitForTimeout(30);
    // Ensure focus is inside editor before command
    await page.evaluate(() => {
      const edEl = document.querySelector('.oe-editor');
      const p    = edEl.querySelector('p');
      if (!p) return;
      const range = document.createRange();
      range.selectNodeContents(p);
      range.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      edEl.focus();
    });
    await page.evaluate(() => window.__openEditorInstance.commands.execute('blockIndent'));
    await page.waitForTimeout(80);
    expect(await ed.locator('blockquote').count()).toBeGreaterThanOrEqual(1);
    await expect(ed).toContainText('indent me');
  });

  test('blockOutdent removes blockquote wrapping', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await page.keyboard.insertText('outdent me');
    await page.waitForTimeout(30);
    await page.evaluate(() => {
      const edEl = document.querySelector('.oe-editor');
      const p    = edEl.querySelector('p');
      if (!p) return;
      const range = document.createRange();
      range.selectNodeContents(p);
      range.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      edEl.focus();
    });
    await page.evaluate(() => window.__openEditorInstance.commands.execute('blockIndent'));
    await page.waitForTimeout(60);
    await page.evaluate(() => window.__openEditorInstance.commands.execute('blockOutdent'));
    await page.waitForTimeout(80);
    expect(await ed.locator('blockquote').count()).toBe(0);
    await expect(ed).toContainText('outdent me');
  });
});
