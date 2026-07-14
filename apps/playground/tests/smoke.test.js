import { test, expect } from '@playwright/test';

test('playground loads and editor mount exists', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Open Editor/);
  await expect(page.locator('#editor')).toBeVisible();
});

test('editor mount has correct CSS class', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#editor')).toHaveClass(/pg-editor-mount/);
});

test('Phase 1 — OpenEditor mounts wrapper inside container', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#editor .oe-wrapper')).toBeVisible();
});

test('Phase 1 — contenteditable div is present and editable', async ({ page }) => {
  await page.goto('/');
  const el = page.locator('#editor .oe-editor');
  await expect(el).toBeVisible();
  await expect(el).toHaveAttribute('contenteditable', 'true');
});

test('Phase 1 — placeholder attribute is set', async ({ page }) => {
  await page.goto('/');
  const el = page.locator('#editor .oe-editor');
  await expect(el).toHaveAttribute('data-placeholder', 'Start typing…');
});

test('Phase 1 — ARIA role textbox is set', async ({ page }) => {
  await page.goto('/');
  const el = page.locator('#editor .oe-editor');
  await expect(el).toHaveAttribute('role', 'textbox');
  await expect(el).toHaveAttribute('aria-multiline', 'true');
});

test('Phase 1 — spellcheck is false by default', async ({ page }) => {
  await page.goto('/');
  const el = page.locator('#editor .oe-editor');
  await expect(el).toHaveAttribute('spellcheck', 'false');
});

test('Phase 1 — typing works inside the editor', async ({ page }) => {
  await page.goto('/');
  const el = page.locator('#editor .oe-editor');
  await el.click();
  await page.keyboard.type('Hello World');
  await expect(el).toContainText('Hello World');
});

test('Phase 1 — version shown in header', async ({ page }) => {
  await page.goto('/');
  // Assert the semver shape (incl. optional prerelease, e.g. v1.0.0-rc.1) rather
  // than a hardcoded literal, so a version bump never rots this test.
  await expect(page.locator('.pg-version')).toHaveText(/^v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/);
});
