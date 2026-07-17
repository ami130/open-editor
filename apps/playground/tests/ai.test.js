/**
 * Phase 19.7 — AI Writing e2e. Real ES256 license → gate → Quick Actions +
 * Chat run through the FREE editor.aiComplete() hook against an IN-PAGE stubbed
 * streaming fetch (no live LLM). Verifies gating, selection-replace, and the
 * chat panel, all in a real browser.
 */
import { test, expect } from '@playwright/test';

const NOTICE = '[data-oe-premium-notice]';

// Stub window.fetch in-page to stream a canned SSE reply, and point the editor
// at a dummy aiEndpoint.
async function stubAi(page, replyText) {
  await page.evaluate((reply) => {
    window.__openEditorInstance._config.aiEndpoint = 'https://ai.test/complete';
    window.fetch = () => Promise.resolve({
      ok: true, status: 200,
      body: {
        getReader() {
          const enc = new TextEncoder();
          const lines = [`data: {"delta":${JSON.stringify(reply)}}\n`, 'data: [DONE]\n'];
          let i = 0;
          return { read: () => (i < lines.length
            ? Promise.resolve({ done: false, value: enc.encode(lines[i++]) })
            : Promise.resolve({ done: true })) };
        },
      },
      text: () => Promise.resolve(reply),
    });
  }, replyText);
}

test.describe('Phase 19.7 — AI Writing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?nopremium');
    await page.waitForSelector('.oe-toolbar');
    await page.evaluate(() => window.__openEditorInstance.setHTML('<p>original text</p>'));
  });

  test('license granting ai.quickActions → button appears; rewrite replaces the selection', async ({ page }) => {
    await page.evaluate(() => window.__premium.apply(['ai.quickActions']));
    await expect(page.locator('.oe-toolbar [data-name="aiQuickActions"]')).toBeVisible();
    await stubAi(page, 'improved text');
    // select all + run rewrite via the imperative API
    await page.evaluate(() => {
      const ed = window.__openEditorInstance;
      const el = ed.getEditorElement(); el.focus();
      const r = document.createRange(); r.selectNodeContents(el);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    });
    await page.evaluate(() => window.__openEditorInstance.aiQuickAction('rewrite'));
    await expect.poll(() => page.evaluate(() => window.__openEditorInstance.getHTML()))
      .toContain('improved text');
  });

  test('REAL FLOW: select text, click the AI button, pick a menu item → selection is replaced', async ({ page }) => {
    // This is the flow that was broken: clicking a context-menu item collapsed
    // the selection before the action ran, so nothing happened. The fix
    // snapshots the selection on menu-open and restores it before acting.
    await page.evaluate(() => window.__premium.apply(['ai.quickActions']));
    await stubAi(page, 'polished sentence');
    await page.evaluate(() => {
      const ed = window.__openEditorInstance;
      const el = ed.getEditorElement(); el.focus();
      const r = document.createRange(); r.selectNodeContents(el);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    });
    // Click the toolbar button → menu opens; then click the first menu item.
    await page.locator('.oe-toolbar [data-name="aiQuickActions"]').click();
    await page.locator('.oe-menu__item').first().click();
    await expect.poll(() => page.evaluate(() => window.__openEditorInstance.getHTML()))
      .toContain('polished sentence');
    await expect.poll(() => page.evaluate(() => window.__openEditorInstance.getHTML()))
      .not.toContain('original text');
  });

  test('license granting ai.panel → Chat button opens the panel', async ({ page }) => {
    await page.evaluate(() => window.__premium.apply(['ai.panel']));
    await expect(page.locator('.oe-toolbar [data-name="aiChat"]')).toBeVisible();
    await page.locator('.oe-toolbar [data-name="aiChat"]').click();
    await expect(page.locator('[data-oe-ai-chat]')).toBeVisible();
  });

  test('chat sends a prompt and streams a reply into the transcript', async ({ page }) => {
    await page.evaluate(() => window.__premium.apply(['ai.panel']));
    await stubAi(page, 'a generated paragraph');
    await page.locator('.oe-toolbar [data-name="aiChat"]').click();
    await page.locator('[data-oe-ai-chat] .oe-ai-chat__input').fill('write something');
    await page.locator('[data-oe-ai-chat] .oe-ai-chat__btn').click();
    await expect(page.locator('[data-oe-ai-chat] .oe-ai-chat__msg--ai')).toContainText('a generated paragraph');
  });

  test('NO license → no AI buttons, no handles, upgrade notice', async ({ page }) => {
    await page.evaluate(() => window.__premium.installFree());
    await expect(page.locator(NOTICE)).toBeVisible();
    expect(await page.locator('.oe-toolbar [data-name="aiQuickActions"]').count()).toBe(0);
    expect(await page.locator('.oe-toolbar [data-name="aiChat"]').count()).toBe(0);
    expect(await page.evaluate(() => typeof window.__openEditorInstance.aiQuickAction)).toBe('undefined');
  });

  test('ai.translate → button appears; translating replaces the selection', async ({ page }) => {
    await page.evaluate(() => window.__premium.apply(['ai.translate']));
    await expect(page.locator('.oe-toolbar [data-name="aiTranslate"]')).toBeVisible();
    await stubAi(page, 'hola mundo');
    await page.evaluate(() => {
      const ed = window.__openEditorInstance;
      ed.getEditorElement().focus();
      const r = document.createRange(); r.selectNodeContents(ed.getEditorElement());
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    });
    await page.evaluate(() => window.__openEditorInstance.aiTranslate('Spanish'));
    await expect.poll(() => page.evaluate(() => window.__openEditorInstance.getHTML()))
      .toContain('hola mundo');
  });

  test('ai.review → reviews selection, shows accept/reject suggestions, applies them', async ({ page }) => {
    await page.evaluate(() => window.__openEditorInstance.setHTML('<p>teh cat sat</p>'));
    await page.evaluate(() => window.__premium.apply(['ai.review']));
    await expect(page.locator('.oe-toolbar [data-name="aiReview"]')).toBeVisible();
    // Stub a structured (non-streaming JSON) review response.
    await page.evaluate(() => {
      window.__openEditorInstance._config.aiEndpoint = 'https://ai.test/review';
      window.fetch = () => Promise.resolve({
        ok: true, status: 200, body: null,
        text: () => Promise.resolve('[{"original":"teh","suggestion":"the","reason":"typo"}]'),
      });
      const ed = window.__openEditorInstance;
      ed.getEditorElement().focus();
      const r = document.createRange(); r.selectNodeContents(ed.getEditorElement());
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    });
    await page.evaluate(() => window.__openEditorInstance.aiReview());
    await expect(page.locator('[data-oe-ai-review]')).toBeVisible();
    // Accept the one suggestion, then apply.
    await page.locator('[data-oe-ai-review] .oe-ai-review__btn--accept').first().click();
    await page.locator('[data-oe-ai-review] .oe-ai-review__apply').click();
    await expect.poll(() => page.evaluate(() => window.__openEditorInstance.getHTML()))
      .toContain('the cat sat');
  });

  test('the FREE aiComplete hook works without any license (the funnel)', async ({ page }) => {
    // No premium at all — just the free core hook.
    await stubAi(page, 'free hook output');
    await page.evaluate(() => {
      const ed = window.__openEditorInstance;
      ed.getEditorElement().focus();
      const r = document.createRange(); r.selectNodeContents(ed.getEditorElement()); r.collapse(false);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    });
    const out = await page.evaluate(() => window.__openEditorInstance.aiComplete({ prompt: 'go' }));
    expect(out).toBe('free hook output');
  });
});
