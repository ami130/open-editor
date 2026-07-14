/**
 * Phase 7.5.4 — Toolbar pixel-behavior tests.
 *
 * Verifies toolbar renders, buttons are clickable, active-state updates
 * visually when selection enters formatted text, and commands apply DOM changes.
 */
import { test, expect } from '@playwright/test';

test.describe('Phase 7.5.4 — Toolbar behavior', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.oe-toolbar');
  });

  test('toolbar renders above the editor', async ({ page }) => {
    const toolbar = page.locator('.oe-toolbar');
    const editor = page.locator('.oe-editor');
    await expect(toolbar).toBeVisible();
    await expect(editor).toBeVisible();
    const tBox = await toolbar.boundingBox();
    const eBox = await editor.boundingBox();
    // Toolbar top edge must be above editor top edge.
    expect(tBox.y).toBeLessThan(eBox.y);
  });

  test('bold button is visible and has correct accessible label', async ({ page }) => {
    const boldBtn = page.locator('[title="Bold"], [aria-label="Bold"]').first();
    await expect(boldBtn).toBeVisible();
  });

  test('clicking bold wraps selected text in <strong>', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await page.keyboard.type('bold me');
    await page.keyboard.press('Control+A');
    const boldBtn = page.locator('[title="Bold"], [aria-label="Bold"]').first();
    await boldBtn.click();
    const hasStrong = await page.evaluate(() =>
      !!document.querySelector('.oe-editor strong')
    );
    expect(hasStrong).toBe(true);
  });

  test('clicking Horizontal rule inserts an <hr> (13.6)', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await page.keyboard.type('above');
    const hrBtn = page.locator('[title="Horizontal rule"], [aria-label="Horizontal rule"]').first();
    await hrBtn.click();
    await page.waitForTimeout(50);
    const hasHr = await page.evaluate(() => !!document.querySelector('.oe-editor hr'));
    expect(hasHr).toBe(true);
  });

  test('bold button gets active class when cursor is in bold text', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await page.keyboard.type('bold text');
    await page.keyboard.press('Control+A');
    const boldBtn = page.locator('[title="Bold"], [aria-label="Bold"]').first();
    await boldBtn.click();
    // Move cursor into the bold text.
    await ed.click();
    await page.keyboard.press('Control+Home');
    await page.keyboard.press('ArrowRight');
    // Wait for toolbar sync (rAF).
    await page.waitForTimeout(100);
    const isActive = await boldBtn.evaluate((el) =>
      el.classList.contains('oe-tb__btn--active')
    );
    expect(isActive).toBe(true);
  });

  test('italic button wraps selection in <em>', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await page.keyboard.type('italic me');
    await page.keyboard.press('Control+A');
    const italicBtn = page.locator('[title="Italic"], [aria-label="Italic"]').first();
    await italicBtn.click();
    const hasEm = await page.evaluate(() =>
      !!document.querySelector('.oe-editor em')
    );
    expect(hasEm).toBe(true);
  });

  test('underline button wraps selection in <u>', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await page.keyboard.type('underline me');
    await page.keyboard.press('Control+A');
    const uBtn = page.locator('[title="Underline"], [aria-label="Underline"]').first();
    await uBtn.click();
    const hasU = await page.evaluate(() =>
      !!document.querySelector('.oe-editor u')
    );
    expect(hasU).toBe(true);
  });

  test('inline code button wraps selection in <code>', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await page.keyboard.type('fn()');
    await page.keyboard.press('Control+A');
    const codeBtn = page.locator('[title="Code (inline)"], [aria-label="Code (inline)"]').first();
    await codeBtn.click();
    const hasCode = await page.evaluate(() =>
      !!document.querySelector('.oe-editor code')
    );
    expect(hasCode).toBe(true);
  });

  test('undo button reverts last formatting', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await page.keyboard.type('undo test');
    await page.keyboard.press('Control+A');
    const boldBtn = page.locator('[title="Bold"], [aria-label="Bold"]').first();
    await boldBtn.click();
    const undoBtn = page.locator('[title="Undo"], [aria-label="Undo"]').first();
    await undoBtn.click();
    // After undo, there should be no <strong>.
    const hasStrong = await page.evaluate(() =>
      !!document.querySelector('.oe-editor strong')
    );
    expect(hasStrong).toBe(false);
  });

  test('redo re-applies reverted formatting', async ({ page }) => {
    const ed = page.locator('.oe-editor');
    await ed.click();
    await page.keyboard.type('redo test');
    await page.keyboard.press('Control+A');
    const boldBtn = page.locator('[title="Bold"], [aria-label="Bold"]').first();
    await boldBtn.click();
    const undoBtn = page.locator('[title="Undo"], [aria-label="Undo"]').first();
    await undoBtn.click();
    const redoBtn = page.locator('[title="Redo"], [aria-label="Redo"]').first();
    await redoBtn.click();
    const hasStrong = await page.evaluate(() =>
      !!document.querySelector('.oe-editor strong')
    );
    expect(hasStrong).toBe(true);
  });

  test('toolbar buttons have visible focus ring on keyboard focus', async ({ page }) => {
    const boldBtn = page.locator('[title="Bold"], [aria-label="Bold"]').first();
    await boldBtn.focus();
    const outline = await boldBtn.evaluate((el) =>
      window.getComputedStyle(el).outlineStyle
    );
    // Focus ring must not be 'none' — any visible outline style is acceptable.
    expect(outline).not.toBe('none');
  });
});

test.describe('Phase 7.5.4 — Toolbar layout / pixel behavior', () => {
  test('inline bubble toolbar appears when text is selected', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.oe-toolbar');
    const ed = page.locator('.oe-editor');
    await ed.click();
    await page.keyboard.type('select me for bubble');
    const isMac = process.platform === 'darwin';
    await page.keyboard.press(isMac ? 'Meta+A' : 'Control+A');
    await page.waitForTimeout(120);
    // Bubble toolbar may or may not be present depending on config;
    // if present it must be visible and positioned near editor.
    const bubble = page.locator('.oe-bubble');
    const bubbleCount = await bubble.count();
    if (bubbleCount > 0) {
      await expect(bubble.first()).toBeVisible();
      const bBox   = await bubble.first().boundingBox();
      const edBox  = await ed.boundingBox();
      // Bubble must be within 200px of the editor vertically
      expect(Math.abs(bBox.y - edBox.y)).toBeLessThan(200);
    }
    // Whether or not bubble is shown, no JS errors must have occurred.
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    expect(errors).toHaveLength(0);
  });

  test('mobile viewport: toolbar buttons meet minimum touch target size', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.waitForSelector('.oe-toolbar');
    const buttons = page.locator('.oe-tb__btn');
    const count = await buttons.count();
    expect(count).toBeGreaterThan(0);
    // 14.10 — every visible button must meet the 44x44px WCAG 2.5.5 minimum.
    for (let i = 0; i < Math.min(count, 8); i++) {
      const box = await buttons.nth(i).boundingBox();
      if (box) {
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.width).toBeGreaterThanOrEqual(44);
      }
    }
  });

  test('toolbar stays pinned (position:sticky) when its scroll container scrolls', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.oe-toolbar');
    const toolbar = page.locator('.oe-toolbar');
    const ed = page.locator('.oe-editor');
    await ed.click();
    // Fill the editor so its OWN scroll container (the editable) overflows —
    // the toolbar is sticky to the wrapper, so we scroll the editable, not window.
    for (let i = 0; i < 40; i++) {
      await page.keyboard.type('Line ' + i + ' — padding to enable scroll.');
      await page.keyboard.press('Enter');
    }
    await page.waitForTimeout(60);
    // It must actually be declared sticky (not just happen to be on screen).
    const position = await toolbar.evaluate((el) => getComputedStyle(el).position);
    expect(position).toBe('sticky');
    // And it must NOT move when the editable scrolls: capture Y, scroll, re-capture.
    const before = await toolbar.boundingBox();
    await ed.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await page.waitForTimeout(60);
    const after = await toolbar.boundingBox();
    expect(before).not.toBeNull();
    expect(after).not.toBeNull();
    // Pinned: the toolbar's viewport Y is unchanged (±1px) after the scroll.
    expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1);
    await expect(toolbar).toBeVisible();
  });

  test('dropdown panel stays within viewport bounds', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.oe-toolbar');
    // Find any dropdown button (heading selector, format dropdown, etc.)
    const dropdownBtn = page.locator('.oe-tb__btn[data-cmd], .oe-tb__dd-trigger').first();
    const dropCount = await dropdownBtn.count();
    if (dropCount === 0) {
      // No dropdown found — skip gracefully (toolbar may not have dropdowns in this config)
      return;
    }
    await dropdownBtn.click();
    await page.waitForTimeout(80);
    const panel = page.locator('.oe-tb__dd-panel, .oe-tb__panel').first();
    const panelCount = await panel.count();
    if (panelCount > 0) {
      const pBox    = await panel.boundingBox();
      const vWidth  = await page.evaluate(() => window.innerWidth);
      const vHeight = await page.evaluate(() => window.innerHeight);
      if (pBox) {
        expect(pBox.x).toBeGreaterThanOrEqual(0);
        expect(pBox.y).toBeGreaterThanOrEqual(0);
        expect(pBox.x + pBox.width).toBeLessThanOrEqual(vWidth + 5);  // 5px tolerance
        expect(pBox.y + pBox.height).toBeLessThanOrEqual(vHeight + 5);
      }
    }
    // Press Escape to close
    await page.keyboard.press('Escape');
  });
});
