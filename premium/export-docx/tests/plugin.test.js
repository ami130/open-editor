/**
 * export-docx plugin — gated activation + the exportDocx()/buildDocxBytes()
 * flow through the REAL core PluginManager. The download is driven with a
 * stubbed URL.createObjectURL + anchor click (jsdom has no real download).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createExportDocxPlugin, FEATURE_ID } from '../src/index.js';
import { fileBase } from '../src/export-docx-plugin.js';
import { PluginManager } from '../../../packages/core/src/plugins/plugin-manager.js';

const ALLOW = { manager: { gate: () => ({ allowed: true, reason: 'granted' }) } };
const DENY  = { manager: { gate: () => ({ allowed: false, reason: 'no-license' }) } };

function makeEditor(html = '<h1>Doc</h1><p>Body</p>') {
  const listeners = new Map();
  // Capture progress-toast lifecycle so tests can assert user feedback.
  const toastLog = { progress: [], success: [], error: [] };
  const editor = {
    _wrapper: document.createElement('div'),
    _config: {}, _destroyed: false, _iframeDoc: null,
    getHTML: () => html,
    on(ev, fn) { (listeners.get(ev) || listeners.set(ev, []).get(ev)).push(fn); },
    off(ev, fn) { const a = listeners.get(ev) || []; const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); },
    emit(ev, p) { for (const fn of [...(listeners.get(ev) || [])]) fn(p); },
    ui: { toast: {
      progress: (m) => {
        toastLog.progress.push(m);
        return {
          success: (msg) => toastLog.success.push(msg),
          error: (msg) => toastLog.error.push(msg),
          update: () => {}, close: () => {},
        };
      },
    } },
    _toasts: toastLog,
    logger: null, toolbar: null,
  };
  document.body.appendChild(editor._wrapper);
  return editor;
}

let created;
beforeEach(() => {
  // Fake timers throughout: exportDocx defers URL.revokeObjectURL with
  // setTimeout(0); without control it fires after teardown and throws on the
  // removed stub. Tests that care about the revoke call vi.runAllTimers().
  vi.useFakeTimers();
  created = { url: 'blob:fake', revoked: [], clicks: 0, download: null };
  vi.stubGlobal('URL', {
    createObjectURL: () => created.url,
    revokeObjectURL: (u) => created.revoked.push(u),
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
    created.clicks++; created.download = this.download;
  });
});
afterEach(() => {
  vi.runAllTimers();      // flush any pending revoke while the stub is live
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('export-docx — feature id + filename', () => {
  it('requires export.docx', () => expect(FEATURE_ID).toBe('export.docx'));
  it('fileBase sanitizes unsafe filename chars', () => {
    expect(fileBase('My/Report: v2?')).toBe('My_Report_-v2_');
    expect(fileBase('')).toBe('document');
    expect(fileBase('  ')).toBe('document');
  });
});

describe('export-docx — granted', () => {
  it('installs, contributes the button, exposes exportDocx + buildDocxBytes', () => {
    const editor = makeEditor();
    const pm = new PluginManager(editor); editor.plugins = pm;
    pm.install(createExportDocxPlugin(ALLOW));
    expect(pm.isInstalled('export-docx')).toBe(true);
    expect(typeof editor.exportDocx).toBe('function');
    expect(typeof editor.buildDocxBytes).toBe('function');
    expect(pm.get('export-docx').getToolbarButtons()[0])
      .toMatchObject({ name: 'exportDocx', readOnlyExempt: true });
  });

  it('buildDocxBytes returns a non-trivial ZIP (PK signature) — ASYNC (remote-image fetch pre-pass)', async () => {
    const editor = makeEditor();
    createExportDocxPlugin(ALLOW).install(editor);
    const bytes = await editor.buildDocxBytes();
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes[0]).toBe(0x50); // 'P'
    expect(bytes[1]).toBe(0x4b); // 'K'
    expect(bytes.length).toBeGreaterThan(500);
  });

  it('exportDocx triggers a download named from the title, then revokes the URL — ASYNC', async () => {
    const editor = makeEditor();
    createExportDocxPlugin(ALLOW, { title: 'Quarterly Report' }).install(editor);
    let cmd = null; editor.on('afterCommand', (p) => { cmd = p.command; });
    expect(await editor.exportDocx()).toBe(true);
    expect(created.clicks).toBe(1);
    expect(created.download).toBe('Quarterly-Report.docx');
    expect(cmd).toBe('exportDocx');
    vi.runAllTimers(); // fire the deferred revoke while the stub is still live
    expect(created.revoked).toContain('blob:fake');
  });

  it('per-call title overrides install config — ASYNC', async () => {
    const editor = makeEditor();
    createExportDocxPlugin(ALLOW, { title: 'A' }).install(editor);
    await editor.exportDocx({ title: 'B' });
    expect(created.download).toBe('B.docx');
  });

  it('destroy removes both handles', () => {
    const editor = makeEditor();
    const p = createExportDocxPlugin(ALLOW); p.install(editor);
    p.destroy();
    expect(editor.exportDocx).toBeUndefined();
    expect(editor.buildDocxBytes).toBeUndefined();
  });

  it('REAL BUG FIX: a REMOTE (http) image is fetched and embedded as a real picture, not a text placeholder', async () => {
    // This is the reported bug: images inserted via the normal editor image
    // flow are hosted/remote URLs (not data: URIs), and previously always
    // degraded to "[Image: alt]" text. Stubbing global fetch proves the full
    // plugin pipeline (buildBytes → resolveRemoteImages → bodyXml → buildDocx)
    // now embeds the real bytes end to end.
    const html = '<h1>Report</h1><figure class="oe-figure"><img src="https://cdn.example.com/photo.png" alt="a photo" width="300" height="200"><figcaption>Caption</figcaption></figure>';
    const editor = makeEditor(html);
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
    globalThis.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      headers: { get: (h) => (h.toLowerCase() === 'content-type' ? 'image/png' : null) },
      arrayBuffer: () => Promise.resolve(pngBytes.buffer),
    }));
    createExportDocxPlugin(ALLOW).install(editor);
    const bytes = await editor.buildDocxBytes();
    // Decode the ZIP (STORE method) well enough to read document.xml + media.
    const text = Array.from(bytes).map((n) => String.fromCharCode(n)).join('');
    expect(text).toContain('<w:drawing>');           // real embedded picture
    expect(text).not.toContain('[Image: a photo]');   // NOT the old placeholder
    expect(text).toContain('word/media/image1.png');  // the media part exists
    expect(globalThis.fetch).toHaveBeenCalledWith('https://cdn.example.com/photo.png', expect.anything());
  });

  it('a remote image that FAILS to fetch (404/CORS) falls back to the placeholder, export still succeeds', async () => {
    const html = '<p><img src="https://cdn.example.com/broken.png" alt="broken"></p>';
    const editor = makeEditor(html);
    globalThis.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 404 }));
    createExportDocxPlugin(ALLOW).install(editor);
    const bytes = await editor.buildDocxBytes();
    expect(bytes).toBeInstanceOf(Uint8Array);
    const text = Array.from(bytes).map((n) => String.fromCharCode(n)).join('');
    expect(text).toContain('[Image: broken]');
    expect(text).not.toContain('<w:drawing>');
  });

  it('shows a progress toast → SUCCESS on a clean export (no more "nothing happened")', async () => {
    const editor = makeEditor();
    createExportDocxPlugin(ALLOW).install(editor);
    await editor.exportDocx();
    expect(editor._toasts.progress.length).toBe(1);     // spinner shown immediately
    expect(editor._toasts.success.length).toBe(1);      // resolved to success
    expect(editor._toasts.success[0]).toMatch(/download/i);
    expect(editor._toasts.error.length).toBe(0);
  });

  it('WARNS the user when a remote image is dropped (CORS/404) instead of vanishing silently', async () => {
    const html = '<p><img src="https://cdn.example.com/broken.png" alt="x"></p>';
    const editor = makeEditor(html);
    globalThis.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 404 }));
    createExportDocxPlugin(ALLOW).install(editor);
    const ok = await editor.exportDocx();
    expect(ok).toBe(true);                               // export still succeeds
    // The dropped image is surfaced via the toast, not silently omitted.
    expect(editor._toasts.error.length).toBe(1);
    expect(editor._toasts.error[0]).toMatch(/image/i);
    expect(editor._toasts.error[0]).toMatch(/1 image/i);
  });

  it('surfaces an ERROR toast (and emits exportDocxFailed) when the build throws', async () => {
    const editor = makeEditor();
    createExportDocxPlugin(ALLOW).install(editor);
    // Force the download step to throw AFTER buildBytes resolves.
    HTMLAnchorElement.prototype.click.mockImplementationOnce(() => { throw new Error('boom'); });
    let failed = null;
    editor.on('exportDocxFailed', (p) => { failed = p; });
    const ok = await editor.exportDocx();
    expect(ok).toBe(false);
    expect(failed).toBeTruthy();
    expect(editor._toasts.error.length).toBe(1);
  });
});

describe('export-docx — denied (graceful degrade)', () => {
  it('no-op stub: no handles, upgrade notice shown, free editor untouched', () => {
    const editor = makeEditor();
    const pm = new PluginManager(editor); editor.plugins = pm;
    pm.install(createExportDocxPlugin(DENY));
    expect(pm.isInstalled('export-docx')).toBe(true);
    expect(editor.exportDocx).toBeUndefined();
    expect(editor._wrapper.querySelector('[data-oe-premium-notice]')).not.toBeNull();
  });
});
