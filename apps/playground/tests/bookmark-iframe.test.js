/**
 * bookmark-iframe.test.js — regression for the iframe-mode bookmark bug
 * (fixed 2026-07-16). In iframe mode the editable lives in the iframe's
 * document, so the plugin MUST inject its marker stylesheet there — not into
 * the host page. jsdom cannot build a real iframe editor, so this is the
 * authoritative check that the fix works in real browsers.
 */
import { test, expect } from '@playwright/test';

test('iframe mode: inserting a bookmark renders the flag marker inside the frame', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.oe-editor[contenteditable="true"]');

  // Build a fresh iframe-mode editor in a scratch container, with the bookmark
  // plugin installed, using the globals the playground exposes.
  await page.evaluate(() => {
    const host = document.createElement('div');
    host.id = 'iframe-editor-host';
    document.body.appendChild(host);
    const ed = new window.__OpenEditor(host, { iframe: true });
    ed.plugins.install(window.__playgroundFactories.bookmark());
    ed.setHTML('<p>hello world</p>');
    window.__iframeEditor = ed;
  });

  // The editable is inside the iframe — target that frame.
  const frame = page.frameLocator('#iframe-editor-host iframe');
  await expect(frame.locator('.oe-editor[contenteditable="true"]')).toBeVisible();

  // Insert a bookmark programmatically (the dialog is host-document UI; the
  // bug under test is the MARKER RENDER inside the frame, which needs the
  // stylesheet to be present in the iframe document).
  await page.evaluate(() => {
    const ed = window.__iframeEditor;
    const root = ed.getEditorElement();
    const p = root.querySelector('p');
    ed.selection.collapse(p, p.childNodes.length);
    const doc = ed._iframeDoc;
    const a = doc.createElement('a');
    a.id = 'iframe-mark';
    a.className = 'oe-bookmark';
    a.setAttribute('contenteditable', 'false');
    ed.selection.insertAtCursor(a);
  });

  // The authoritative check: the flag marker actually RENDERS inside the frame.
  // (Don't assert on getElementById — injectStyleOnce uses constructable
  // stylesheets via adoptedStyleSheets in modern engines, which are not <style>
  // elements and won't appear via getElementById. Computed ::before content is
  // the real, delivery-mechanism-agnostic proof the CSS reached the frame.)
  const flag = await page.evaluate(() => {
    const doc = window.__iframeEditor._iframeDoc;
    const mark = doc.querySelector('a.oe-bookmark');
    return mark ? getComputedStyle(mark, '::before').content : null;
  });
  expect(flag).toContain('⚑');

  // cleanup
  await page.evaluate(() => { window.__iframeEditor.destroy(); });
});
