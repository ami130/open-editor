/**
 * Phase 19.5 — Export to DOCX e2e. Real ES256 license → gate → the exportDocx
 * action produces a real .docx download in the browser. We capture the Blob
 * bytes (via a stubbed createObjectURL) and assert it's a valid ZIP/OOXML
 * package with the expected content — the real cross-engine byte path.
 */
import { test, expect } from '@playwright/test';

const NOTICE = '[data-oe-premium-notice]';

// Capture the exact bytes handed to the download by wrapping createObjectURL.
async function captureDownloadBytes(page) {
  await page.evaluate(() => {
    window.__docx = { bytes: null, download: null };
    const realCreate = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      blob.arrayBuffer().then((buf) => { window.__docx.bytes = Array.from(new Uint8Array(buf)); });
      return realCreate(blob);
    };
    const realClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.download) window.__docx.download = this.download;
      // do NOT invoke realClick — avoid a real navigation/download in headless
    };
    void realClick;
  });
}

test.describe('Phase 19.5 — Export to DOCX', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?nopremium');
    await page.waitForSelector('.oe-toolbar');
    await page.evaluate(() => window.__openEditorInstance.setHTML(
      '<h1>My Report</h1><p>Hello <strong>world</strong>.</p>'
      + '<ul><li>one</li><li>two</li></ul>'
      + '<table><tbody><tr><th>A</th></tr><tr><td>1</td></tr></tbody></table>'));
    await captureDownloadBytes(page);
  });

  test('license granting export.docx → button appears, export produces a valid ZIP/OOXML blob', async ({ page }) => {
    await page.evaluate(() => window.__premium.apply(['export.docx']));
    await expect(page.locator('.oe-toolbar [data-name="exportDocx"]')).toBeVisible();

    const ok = await page.evaluate(() => window.__openEditorInstance.exportDocx({ title: 'Report' }));
    expect(ok).toBe(true);

    // Wait for the async arrayBuffer() read to populate.
    await expect.poll(() => page.evaluate(() => window.__docx.bytes && window.__docx.bytes.length))
      .toBeGreaterThan(500);

    const info = await page.evaluate(() => {
      const b = window.__docx.bytes;
      const head = String.fromCharCode(b[0], b[1]); // 'PK' ZIP signature
      // Decode the whole blob as latin1 and check for a known part name.
      const text = b.map((n) => String.fromCharCode(n)).join('');
      return { head, download: window.__docx.download,
        hasDocumentXml: text.includes('word/document.xml'),
        hasContentTypes: text.includes('[Content_Types].xml') };
    });
    expect(info.head).toBe('PK');                 // valid ZIP
    expect(info.hasDocumentXml).toBe(true);       // OOXML main part present
    expect(info.hasContentTypes).toBe(true);
    expect(info.download).toBe('Report.docx');    // filename from title
  });

  test('toolbar button click triggers the export', async ({ page }) => {
    await page.evaluate(() => window.__premium.apply(['export.docx']));
    await page.locator('.oe-toolbar [data-name="exportDocx"]').click();
    await expect.poll(() => page.evaluate(() => !!(window.__docx.bytes))).toBe(true);
    expect(await page.evaluate(() => window.__docx.download.endsWith('.docx'))).toBe(true);
  });

  test('NO license → no button, no exportDocx handle, upgrade notice shown', async ({ page }) => {
    await page.evaluate(() => window.__premium.installFree());
    await expect(page.locator(NOTICE)).toBeVisible();
    expect(await page.locator('.oe-toolbar [data-name="exportDocx"]').count()).toBe(0);
    expect(await page.evaluate(() => typeof window.__openEditorInstance.exportDocx)).toBe('undefined');
  });

  test('valid license WITHOUT export.docx → degraded, no button', async ({ page }) => {
    await page.evaluate(() => window.__premium.apply(['seo']));
    await expect(page.locator(NOTICE)).toBeVisible();
    expect(await page.locator('.oe-toolbar [data-name="exportDocx"]').count()).toBe(0);
  });

  test('REAL BUG FIX: a remote image in the document is fetched and embedded as a real picture (not a text placeholder)', async ({ page }) => {
    // Reported bug: images inserted via the normal editor flow (remote/hosted
    // URLs) always degraded to "[Image: alt]" text — never a real picture.
    // Stub window.fetch in-page (real network deps would be flaky in CI) to
    // simulate a remote host serving a real PNG, and confirm the FULL browser
    // pipeline (click → exportDocx → resolveRemoteImages → bodyXml →
    // buildDocx → download) embeds real image bytes end to end.
    await page.evaluate(() => {
      const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const bin = atob(PNG_B64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const realFetch = window.fetch.bind(window);
      window.fetch = (url, opts) => {
        if (typeof url === 'string' && url.includes('cdn.example.com')) {
          return Promise.resolve({
            ok: true,
            headers: { get: (h) => (h.toLowerCase() === 'content-type' ? 'image/png' : null) },
            arrayBuffer: () => Promise.resolve(bytes.buffer),
          });
        }
        return realFetch(url, opts);
      };
    });
    await page.evaluate(() => window.__openEditorInstance.setHTML(
      '<h1>Report</h1><figure class="oe-figure"><img src="https://cdn.example.com/photo.png" alt="a photo" width="200" height="150"><figcaption>Cap</figcaption></figure>'));
    await page.evaluate(() => window.__premium.apply(['export.docx']));

    const ok = await page.evaluate(() => window.__openEditorInstance.exportDocx({ title: 'WithImage' }));
    expect(ok).toBe(true);
    await expect.poll(() => page.evaluate(() => window.__docx.bytes && window.__docx.bytes.length))
      .toBeGreaterThan(500);

    const info = await page.evaluate(() => {
      const b = window.__docx.bytes;
      const text = b.map((n) => String.fromCharCode(n)).join('');
      return {
        hasDrawing: text.includes('<w:drawing>'),
        hasMediaPart: text.includes('word/media/image1.png'),
        hasPlaceholder: text.includes('[Image: a photo]'),
      };
    });
    expect(info.hasDrawing).toBe(true);        // real embedded picture
    expect(info.hasMediaPart).toBe(true);      // media part in the ZIP
    expect(info.hasPlaceholder).toBe(false);   // NOT the old text placeholder
  });
});
