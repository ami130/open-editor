/**
 * 16.5.2 — Performance CI gates (real browser).
 *
 * Hard numeric budgets from the Testing Strategy. A regression past any budget
 * fails this test, and because CI runs `playwright test`, it fails the build.
 *
 * Budgets:
 *   - mount (construct + first paint of a fresh editor)   ≤ 100ms
 *   - getHTML() on a 10,000-word document                 ≤  50ms
 *   - a selectionchange-driven status update              ≤  16ms (one frame)
 *
 * Measured on the primary CI browser (chromium). Firefox/WebKit run the same
 * spec but timing gates are asserted only on chromium to avoid CI flakiness from
 * slower headless engines; the behavior is exercised on all three regardless.
 */
import { test, expect } from '@playwright/test';

const BIG_WORDS = 10000;

test.describe('16.5.2 — performance budgets', () => {
  test('mount ≤100ms, getHTML(10k words) ≤50ms, selection update ≤16ms', async ({ page }, testInfo) => {
    await page.goto('/');
    await page.waitForFunction(() => !!window.__OpenEditor);

    const m = await page.evaluate(async (bigWords) => {
      const OpenEditor = window.__OpenEditor;
      const host = document.createElement('div');
      document.body.appendChild(host);

      // ── mount ──
      const t0 = performance.now();
      const t = document.createElement('div');
      host.appendChild(t);
      const ed = new OpenEditor(t);
      // force a layout so "mount" includes first paint cost
      void ed.getEditorElement().offsetHeight;
      const mount = performance.now() - t0;

      // ── build a ~10k-word document ──
      const words = [];
      for (let i = 0; i < bigWords; i++) words.push('word' + (i % 100));
      // 100 paragraphs of 100 words each
      const paras = [];
      for (let p = 0; p < bigWords / 100; p++) {
        paras.push('<p>' + words.slice(p * 100, p * 100 + 100).join(' ') + '</p>');
      }
      ed.setHTML(paras.join(''));

      // ── getHTML() on the big doc ──
      const g0 = performance.now();
      const html = ed.getHTML();
      const getHtml = performance.now() - g0;

      // ── selectionchange-driven work (getWordCount, as StatusBar would) ──
      const s0 = performance.now();
      const wordCount = ed.getWordCount();
      const selUpdate = performance.now() - s0;

      const htmlLen = html.length;
      ed.destroy();
      host.removeChild(t);
      document.body.removeChild(host);

      return { mount, getHtml, selUpdate, htmlLen, wordCount };
    }, BIG_WORDS);

    // Sanity: the big doc really was built (~10k words ≈ 60–70KB of HTML).
    expect(m.htmlLen).toBeGreaterThan(50000);
    expect(m.wordCount).toBeGreaterThan(9000);

    // Log actuals so CI history shows headroom/trend.
    testInfo.annotations.push({ type: 'perf', description: `mount=${m.mount.toFixed(1)}ms getHTML=${m.getHtml.toFixed(1)}ms selUpdate=${m.selUpdate.toFixed(1)}ms` });

    // Hard gates — chromium only (avoid slower-engine CI flakiness).
    if (testInfo.project.name === 'chromium') {
      expect(m.mount, `mount ${m.mount.toFixed(1)}ms > 100ms`).toBeLessThan(100);
      expect(m.getHtml, `getHTML(10k) ${m.getHtml.toFixed(1)}ms > 50ms`).toBeLessThan(50);
      expect(m.selUpdate, `selection update ${m.selUpdate.toFixed(1)}ms > 16ms`).toBeLessThan(16);
    }
  });
});
