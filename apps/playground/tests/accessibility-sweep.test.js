/**
 * 17.10 — WCAG 2.1 A/AA axe-core sweep across EVERY shipped surface.
 *
 * The original accessibility.test.js covers load/content/toolbar; this file
 * opens each interactive surface (dropdowns, dialogs, pickers, panels,
 * palettes, view modes, themes) and asserts zero critical/serious violations
 * with the surface OPEN. Together they back the published conformance
 * self-assessment in docs/ACCESSIBILITY.md — if a surface regresses, this
 * fails CI and the statement goes stale loudly, not silently.
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function expectNoCriticalViolations(page, label) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  const critical = results.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious'
  );
  if (critical.length > 0) {
    console.error(`A11y violations [${label}]:`, critical.map((v) =>
      `[${v.impact}] ${v.id}: ${v.description} → ${v.nodes.slice(0, 3).map((n) => n.target).join(' | ')}`
    ).join('\n'));
  }
  expect(critical, label).toHaveLength(0);
}

test.describe('17.10 — axe sweep: every shipped surface', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.oe-editor[contenteditable="true"]');
  });

  // Dropdown-type controls render as .oe-tb__dd-trigger with a locale-driven
  // aria-label (no data-name) — target them the way a screen reader would.
  test('toolbar dropdowns open (format, font, size, line-height)', async ({ page }) => {
    for (const label of ['Format', 'Font', 'Size', 'Line height']) {
      await page.click(`.oe-tb__dd-trigger[aria-label="${label}"]`);
      await page.waitForTimeout(150);
      await expectNoCriticalViolations(page, `dropdown:${label}`);
      await page.keyboard.press('Escape');
    }
  });

  test('alignment split-button panel open', async ({ page }) => {
    await page.click('.oe-tb__alignsplit-arrow');
    await page.waitForTimeout(150);
    await expectNoCriticalViolations(page, 'alignment-panel');
    await page.keyboard.press('Escape');
  });

  test('color pickers open (text + background)', async ({ page }) => {
    for (const label of ['Text color', 'Background color']) {
      await page.click(`.oe-tb__btn[aria-label="${label}"]`);
      await page.waitForTimeout(150);
      await expectNoCriticalViolations(page, `picker:${label}`);
      await page.keyboard.press('Escape');
    }
  });

  test('table grid picker open', async ({ page }) => {
    await page.click('.oe-tb__btn[data-name="insertTable"]');
    await page.waitForTimeout(150);
    await expectNoCriticalViolations(page, 'table-grid-picker');
    await page.keyboard.press('Escape');
  });

  test('link dialog open', async ({ page }) => {
    await page.click('.oe-editor');
    await page.keyboard.type('link me');
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a');
    await page.click('.oe-tb__btn[data-name="insertLink"]');
    await page.waitForTimeout(200);
    await expectNoCriticalViolations(page, 'link-dialog');
    await page.keyboard.press('Escape');
  });

  test('image dialog open', async ({ page }) => {
    await page.click('.oe-tb__btn[data-name="insertImage"]');
    await page.waitForTimeout(200);
    await expectNoCriticalViolations(page, 'image-dialog');
    await page.keyboard.press('Escape');
  });

  test('media embed dialog open', async ({ page }) => {
    await page.click('.oe-tb__btn[data-name="media"]');
    await page.waitForTimeout(200);
    await expectNoCriticalViolations(page, 'media-dialog');
    await page.keyboard.press('Escape');
  });

  test('find & replace panel open', async ({ page }) => {
    await page.click('.oe-tb__btn[data-name="findReplace"]');
    await page.waitForTimeout(200);
    await expectNoCriticalViolations(page, 'find-replace');
    await page.keyboard.press('Escape');
  });

  test('special characters and emoji grids open', async ({ page }) => {
    for (const name of ['specialChars', 'emoji']) {
      await page.click(`.oe-tb__btn[data-name="${name}"]`);
      await page.waitForTimeout(200);
      await expectNoCriticalViolations(page, `grid:${name}`);
      await page.keyboard.press('Escape');
    }
  });

  test('slash palette and mentions popup open', async ({ page }) => {
    await page.click('.oe-editor');
    await page.keyboard.type('/');
    await page.waitForTimeout(250);
    await expectNoCriticalViolations(page, 'slash-palette');
    await page.keyboard.press('Escape');
    await page.keyboard.type('@al');
    await page.waitForTimeout(350);
    await expectNoCriticalViolations(page, 'mentions-popup');
    await page.keyboard.press('Escape');
  });

  test('source view active', async ({ page }) => {
    await page.evaluate(() => window.__openEditorInstance.setHTML('<p>hello <strong>world</strong></p>'));
    await page.click('.oe-tb__btn[data-name="source"]');
    await page.waitForTimeout(250);
    await expectNoCriticalViolations(page, 'source-view');
    await page.click('.oe-tb__btn[data-name="source"]');
  });

  test('rich content in the editor (table, todo list, image figure)', async ({ page }) => {
    await page.evaluate(() => window.__openEditorInstance.setHTML(
      '<h2>Doc</h2>'
      + '<table><tbody><tr><th scope="col">A</th><th scope="col">B</th></tr>'
      + '<tr><td>1</td><td>2</td></tr></tbody></table>'
      + '<ul data-todo-list><li data-todo data-checked="false" role="checkbox" aria-checked="false">task</li></ul>'
      + '<figure class="oe-figure" contenteditable="false" data-oe-island="image">'
      + '<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="described image">'
      + '<figcaption contenteditable="true" data-oe-caption="">caption</figcaption></figure>'
    ));
    await page.waitForTimeout(200);
    await expectNoCriticalViolations(page, 'rich-content');
  });

  test('table context menu open', async ({ page }) => {
    await page.evaluate(() => window.__openEditorInstance.setHTML(
      '<table><tbody><tr><td>x</td><td>y</td></tr></tbody></table>'
    ));
    await page.waitForTimeout(150);
    await page.click('.oe-editor td', { button: 'right' });
    await page.waitForTimeout(200);
    await expectNoCriticalViolations(page, 'table-context-menu');
    await page.keyboard.press('Escape');
  });

  test('dark theme, whole chrome', async ({ page }) => {
    await page.evaluate(() => window.__openEditorInstance.setTheme('dark'));
    await page.evaluate(() => window.__openEditorInstance.setHTML('<p>dark theme content</p>'));
    await page.waitForTimeout(200);
    await expectNoCriticalViolations(page, 'dark-theme');
    await page.evaluate(() => window.__openEditorInstance.setTheme('light'));
  });

  test('fullscreen mode active', async ({ page }) => {
    await page.evaluate(() => window.__openEditorInstance.toggleFullscreen());
    await page.waitForTimeout(200);
    await expectNoCriticalViolations(page, 'fullscreen');
    await page.evaluate(() => window.__openEditorInstance.toggleFullscreen());
  });

  test('status bar with selection count active', async ({ page }) => {
    await page.click('.oe-editor');
    await page.keyboard.type('alpha beta gamma');
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a');
    await page.waitForTimeout(200);
    await expectNoCriticalViolations(page, 'statusbar-selection');
  });
});
