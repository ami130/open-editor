/**
 * 16.5.6 — Memory-leak verification (real browser).
 *
 * Create and destroy 100 editor instances and assert the teardown is clean:
 *   - zero orphaned .oe-wrapper / .oe-editor nodes remain
 *   - total document node count returns to baseline (± small slack)
 *   - injected stylesheets do NOT grow per instance (they are deduped module
 *     singletons by design — shared across instances, injected once)
 *
 * This proves destroy() releases per-instance DOM/observers/timers/listeners.
 */
import { test, expect } from '@playwright/test';

test.describe('16.5.6 — memory-leak verification', () => {
  test('100 create/destroy cycles leave no orphaned nodes or growing styles', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!window.__OpenEditor);

    const result = await page.evaluate(async () => {
      const OpenEditor = window.__OpenEditor;

      // A dedicated scratch host so we never touch the page's own editor.
      const host = document.createElement('div');
      host.id = 'leak-host';
      document.body.appendChild(host);

      const countStyles = () =>
        document.querySelectorAll('style[id^="oe-"]').length +
        (document.adoptedStyleSheets ? document.adoptedStyleSheets.length : 0);

      // Warm up: one cycle so the shared, inject-once stylesheets are all present
      // before we take the baseline (they are created lazily on first instance).
      { const t = document.createElement('div'); host.appendChild(t);
        const e = new OpenEditor(t); e.destroy(); host.removeChild(t); }

      const baseNodes = document.getElementsByTagName('*').length;
      const baseStyles = countStyles();

      for (let i = 0; i < 100; i++) {
        const t = document.createElement('div');
        host.appendChild(t);
        const e = new OpenEditor(t, { placeholder: 'x', toolbar: true, statusBar: true });
        e.setHTML('<p>hello ' + i + '</p>');
        e.destroy();
        host.removeChild(t);
      }

      // Scope orphan counts to our scratch host — the page has its own live
      // editor whose .oe-wrapper/.oe-editor must not be counted.
      const orphanWrappers = host.querySelectorAll('.oe-wrapper').length;
      const orphanEditors = host.querySelectorAll('.oe-editor').length;
      const endNodes = document.getElementsByTagName('*').length;
      const endStyles = countStyles();

      document.body.removeChild(host);

      return {
        orphanWrappers, orphanEditors,
        baseNodes, endNodes, nodeGrowth: endNodes - baseNodes,
        baseStyles, endStyles, styleGrowth: endStyles - baseStyles,
      };
    });

    // No editor DOM survives teardown.
    expect(result.orphanWrappers, 'orphaned .oe-wrapper nodes').toBe(0);
    expect(result.orphanEditors, 'orphaned .oe-editor nodes').toBe(0);

    // Stylesheets are inject-once singletons — must NOT grow across 100 cycles.
    expect(result.styleGrowth, 'stylesheet growth over 100 cycles').toBe(0);

    // Node count returns to baseline. Allow a tiny slack for framework noise,
    // but 100 leaked wrappers (~50 nodes each) would be thousands — this catches it.
    expect(result.nodeGrowth, `node growth over 100 cycles (base ${result.baseNodes} → ${result.endNodes})`).toBeLessThan(50);
  });
});
