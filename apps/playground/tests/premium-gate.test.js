/**
 * Phase 19 foundation — premium gate e2e. Real ES256 licenses are minted
 * in-browser (WebCrypto), verified offline, and drive the gated hello-premium
 * plugin: activate with the right grant, degrade gracefully without it.
 * allowDevHost is OFF throughout — localhost passes REAL license mechanics.
 */
import { test, expect } from '@playwright/test';

const ATTR = '[data-oe-premium-hello]';
const NOTICE = '[data-oe-premium-notice]';

test.describe('Phase 19 — premium gate', () => {
  test.beforeEach(async ({ page }) => {
    // ?nopremium: opt out of the playground's default full-grant auto-license
    // so these gate tests start clean (nothing installed) and assert explicitly.
    await page.goto('/?nopremium');
    await page.waitForSelector('.oe-toolbar');
  });

  test('no license → plugin degrades: notice shown, feature inactive, editor still fully editable', async ({ page }) => {
    await page.evaluate(() => window.__premium.installFree());
    await expect(page.locator(NOTICE)).toBeVisible();
    expect(await page.locator(ATTR).count()).toBe(0);

    // graceful degrade must leave the free editor untouched
    await page.locator('.oe-editor').click();
    await page.keyboard.type('still typing fine');
    await expect(page.locator('.oe-editor')).toContainText('still typing fine');
  });

  test('license granting the feature → plugin ACTIVATES, no notice', async ({ page }) => {
    // The panel installs ALL registered feature plugins on apply(); grant EVERY
    // flag (applyAll) so "no notice" holds regardless of how many plugins exist.
    await page.evaluate(() => window.__premium.applyAll());
    await expect(page.locator(ATTR)).toHaveCount(1);
    expect(await page.locator(NOTICE).count()).toBe(0);
  });

  test('valid license WITHOUT the feature → denied (not-in-license), notice shown', async ({ page }) => {
    const reason = await page.evaluate(async () => {
      const host = await window.__premium.apply(['seo']);
      return { valid: host.result.valid, gate: host.gate('dev.smoke') };
    });
    expect(reason.valid).toBe(true); // license itself is good…
    expect(reason.gate).toEqual({ allowed: false, reason: 'not-in-license' }); // …but not this feature
    await expect(page.locator(NOTICE)).toBeVisible();
    expect(await page.locator(ATTR).count()).toBe(0);
  });

  test('expired license → denied, notice shown', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const host = await window.__premium.apply(['dev.smoke'], { ttlSeconds: -100 });
      return host.result;
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('expired');
    await expect(page.locator(NOTICE)).toBeVisible();
    expect(await page.locator(ATTR).count()).toBe(0);
  });

  test('license bound to ANOTHER domain → denied (domain-mismatch)', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const host = await window.__premium.apply(['dev.smoke'], { domains: ['app.example.com'] });
      return host.result;
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('domain-mismatch');
    expect(await page.locator(ATTR).count()).toBe(0);
  });

  test('re-licensing at runtime flips degrade → active (SPA flow)', async ({ page }) => {
    await page.evaluate(() => window.__premium.installFree());
    await expect(page.locator(NOTICE)).toBeVisible();
    // Grant every installed plugin's flag so the "no notice" assertion holds.
    await page.evaluate(() => window.__premium.applyAll());
    await expect(page.locator(ATTR)).toHaveCount(1);
    expect(await page.locator(NOTICE).count()).toBe(0); // stale notice cleared
  });

  test('notice is dismissible and non-blocking', async ({ page }) => {
    await page.evaluate(() => window.__premium.installFree());
    await page.locator('.oe-premium-notice__dismiss').click();
    expect(await page.locator(NOTICE).count()).toBe(0);
    await page.locator('.oe-editor').click();
    await page.keyboard.type('after dismiss');
    await expect(page.locator('.oe-editor')).toContainText('after dismiss');
  });

  test('panel UI drives the same pipeline: check the flag, click Apply, feature activates', async ({ page }) => {
    await page.locator('.pg-premium-panel summary').click();
    await page.locator('.pg-premium-panel input[value="dev.smoke"]').check();
    await page.locator('[data-pg-premium="apply"]').click();
    await expect(page.locator(ATTR)).toHaveCount(1);
    await expect(page.locator('[data-pg-premium-status]')).toContainText('ACTIVE');
    // Clear returns to a clean free editor
    await page.locator('[data-pg-premium="clear"]').click();
    await expect(page.locator(ATTR)).toHaveCount(0);
  });
});
