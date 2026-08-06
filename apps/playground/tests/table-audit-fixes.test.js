/**
 * table-audit-fixes.test.js — live proof (Chromium/Firefox/WebKit) for the table
 * deep-audit fixes that are behaviour-dependent:
 *   T1  getHTML() has no oe-cell--selected after a cell selection
 *   T2  deleting the last-remaining table leaves an editable paragraph (caret ok)
 *   T8  Shift+Arrow builds a rectangular cell selection
 *   T10 ArrowDown at the bottom row escapes the table into a paragraph below
 *   T14 "Toggle header column" makes th scope="row"
 */
import { test, expect } from '@playwright/test';

async function seed(page, html) {
  await page.evaluate((h) => window.__openEditorInstance.setHTML(h), html);
  await page.locator('.oe-editor').click();
}
function caretIn(page, sel, offset = 0) {
  return page.evaluate(({ sel, offset }) => {
    const cell = document.querySelector(sel);
    const node = cell.firstChild || cell;
    const r = document.createRange(); r.setStart(node, offset); r.collapse(true);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    document.querySelector('.oe-editor').focus();
    document.dispatchEvent(new Event('selectionchange'));
  }, { sel, offset });
}

const T2 = '<table class="oe-table"><tbody><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></tbody></table>';

test.describe('Table deep-audit fixes (live)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.oe-toolbar');
  });

  test('T8: Shift+ArrowRight+Down selects a 2x2 cell range', async ({ page }) => {
    await seed(page, T2);
    await caretIn(page, '.oe-editor td'); // r0c0
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Shift+ArrowDown');
    await page.waitForTimeout(80);
    const count = await page.evaluate(() =>
      document.querySelectorAll('.oe-editor td.oe-cell--selected').length);
    expect(count).toBe(4);
  });

  test('T1: getHTML has no oe-cell--selected after a selection', async ({ page }) => {
    await seed(page, T2);
    await caretIn(page, '.oe-editor td');
    await page.keyboard.press('Shift+ArrowRight');
    await page.waitForTimeout(60);
    const html = await page.evaluate(() => window.__openEditorInstance.getHTML());
    expect(html).not.toContain('oe-cell--selected');
    expect(html).toContain('<table'); // the table itself survives
  });

  test('T10: ArrowDown at the bottom row escapes into a paragraph below', async ({ page }) => {
    await seed(page, T2);
    await caretIn(page, '.oe-editor tr:last-child td'); // bottom-left cell
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(80);
    const ok = await page.evaluate(() => {
      const t = document.querySelector('.oe-editor table');
      const after = t.nextElementSibling;
      return !!(after && after.tagName.toLowerCase() === 'p');
    });
    expect(ok).toBe(true);
  });

  test('T2: deleting the last-remaining table leaves an editable line', async ({ page }) => {
    await seed(page, '<table class="oe-table"><tbody><tr><td>only</td></tr></tbody></table>');
    await caretIn(page, '.oe-editor td');
    // Right-click → Delete table.
    await page.locator('.oe-editor td').first().click({ button: 'right' });
    await page.waitForTimeout(150);
    await page.getByText('Delete table', { exact: true }).click();
    await page.waitForTimeout(120);
    const state = await page.evaluate(() => {
      const ed = document.querySelector('.oe-editor');
      return { hasTable: !!ed.querySelector('table'), childCount: ed.children.length };
    });
    expect(state.hasTable).toBe(false);
    expect(state.childCount).toBeGreaterThanOrEqual(1); // an editable block remains
    // Typing after the delete must land somewhere (no throw).
    await page.locator('.oe-editor').click();
    await page.keyboard.type('X');
    await page.waitForTimeout(60);
    expect(await page.evaluate(() => document.querySelector('.oe-editor').textContent)).toContain('X');
  });

  test('T14: Toggle header column sets th scope="row"', async ({ page }) => {
    await seed(page, T2);
    await page.locator('.oe-editor td').first().click({ button: 'right' });
    await page.waitForTimeout(150);
    await page.getByText('Table format', { exact: true }).hover();
    await page.waitForTimeout(150);
    await page.getByText('Toggle header column', { exact: true }).click();
    await page.waitForTimeout(120);
    const scopes = await page.evaluate(() =>
      [...document.querySelectorAll('.oe-editor tr')].map((r) => {
        const c = r.cells[0];
        return { tag: c.tagName.toLowerCase(), scope: c.getAttribute('scope') };
      }));
    for (const s of scopes) { expect(s.tag).toBe('th'); expect(s.scope).toBe('row'); }
  });
});
