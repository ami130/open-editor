/**
 * locale-rtl.test.js — 17.11: shipped locale packs + the Arabic RTL proof.
 * Constructs real editors with each pack and verifies the UI actually renders
 * translated (toolbar aria-labels, status bar) — and for Arabic, that the
 * whole editor works end-to-end in RTL: dir attributes, RTL typing, status
 * counts in Arabic.
 */
import { test, expect } from '@playwright/test';

async function makeEditor(page, config) {
  await page.evaluate((cfg) => {
    const host = document.createElement('div');
    host.id = 'i18n-host';
    document.body.appendChild(host);
    window.__i18nEd = new window.__OpenEditor(host, cfg);
  }, config);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.oe-editor[contenteditable="true"]');
});

test.afterEach(async ({ page }) => {
  await page.evaluate(() => {
    if (window.__i18nEd && !window.__i18nEd.isDestroyed()) window.__i18nEd.destroy();
    document.getElementById('i18n-host')?.remove();
  });
});

test('Spanish pack renders a translated toolbar + status bar', async ({ page }) => {
  await page.evaluate(() => {
    const host = document.createElement('div');
    host.id = 'i18n-host';
    document.body.appendChild(host);
    window.__i18nEd = new window.__OpenEditor(host, { locale: window.__OpenEditorLocales.es });
  });
  const host = page.locator('#i18n-host');
  await expect(host.locator('.oe-tb__btn[aria-label="Negrita"]')).toHaveCount(1);
  await expect(host.locator('.oe-tb__btn[aria-label="Deshacer"]')).toHaveCount(1);
  await expect(host.locator('.oe-statusbar')).toContainText('palabras');
});

test('German pack renders a translated toolbar', async ({ page }) => {
  await page.evaluate(() => {
    const host = document.createElement('div');
    host.id = 'i18n-host';
    document.body.appendChild(host);
    window.__i18nEd = new window.__OpenEditor(host, { locale: window.__OpenEditorLocales.de });
  });
  const host = page.locator('#i18n-host');
  await expect(host.locator('.oe-tb__btn[aria-label="Fett"]')).toHaveCount(1);
  await expect(host.locator('.oe-statusbar')).toContainText('Wörter');
});

test('French pack translates plugin buttons too (the 17.11 precedence fix)', async ({ page }) => {
  await page.evaluate(() => {
    const host = document.createElement('div');
    host.id = 'i18n-host';
    document.body.appendChild(host);
    const ed = new window.__OpenEditor(host, { locale: window.__OpenEditorLocales.fr });
    // Install a plugin whose button previously hardcoded an EN tooltip.
    ed.plugins.install(window.__playgroundFactories.todo());
    window.__i18nEd = ed;
  });
  const host = page.locator('#i18n-host');
  // Core button translated:
  await expect(host.locator('.oe-tb__btn[aria-label="Gras"]')).toHaveCount(1);
  // Plugin button translated — would have been "To-do list" before the fix:
  await expect(host.locator('.oe-tb__btn[aria-label="Liste de tâches"]')).toHaveCount(1);
});

test('Arabic pack + RTL: full end-to-end proof', async ({ page }) => {
  await page.evaluate(() => {
    const host = document.createElement('div');
    host.id = 'i18n-host';
    document.body.appendChild(host);
    window.__i18nEd = new window.__OpenEditor(host, {
      locale: window.__OpenEditorLocales.ar,
      direction: 'rtl',
    });
  });
  const host = page.locator('#i18n-host');

  // Toolbar in Arabic (screen-reader surface).
  await expect(host.locator('.oe-tb__btn[aria-label="غامق"]')).toHaveCount(1);   // bold
  await expect(host.locator('.oe-tb__btn[aria-label="تراجع"]')).toHaveCount(1);  // undo

  // Direction actually applied to the editing surface.
  const dir = await page.evaluate(() => window.__i18nEd.getDirection());
  expect(dir).toBe('rtl');
  await expect(host.locator('.oe-editor[dir="rtl"]')).toHaveCount(1);

  // Type real Arabic text; content round-trips intact.
  await host.locator('.oe-editor').click();
  await page.keyboard.type('مرحبا بالعالم');
  await page.waitForTimeout(300);
  const html = await page.evaluate(() => window.__i18nEd.getHTML());
  expect(html).toContain('مرحبا بالعالم');

  // Status bar counts in Arabic ("2 كلمات ...").
  await expect(host.locator('.oe-statusbar')).toContainText('كلمات');

  // Bold works in RTL (toolbar → command → markup).
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a');
  await host.locator('.oe-tb__btn[aria-label="غامق"]').click();
  await page.waitForTimeout(150);
  const bolded = await page.evaluate(() => window.__i18nEd.getHTML());
  expect(bolded).toContain('<strong>');
});
