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
  const editor = {
    _wrapper: document.createElement('div'),
    _config: {}, _destroyed: false, _iframeDoc: null,
    getHTML: () => html,
    on(ev, fn) { (listeners.get(ev) || listeners.set(ev, []).get(ev)).push(fn); },
    off(ev, fn) { const a = listeners.get(ev) || []; const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); },
    emit(ev, p) { for (const fn of [...(listeners.get(ev) || [])]) fn(p); },
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

  it('buildDocxBytes returns a non-trivial ZIP (PK signature)', () => {
    const editor = makeEditor();
    createExportDocxPlugin(ALLOW).install(editor);
    const bytes = editor.buildDocxBytes();
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes[0]).toBe(0x50); // 'P'
    expect(bytes[1]).toBe(0x4b); // 'K'
    expect(bytes.length).toBeGreaterThan(500);
  });

  it('exportDocx triggers a download named from the title, then revokes the URL', () => {
    const editor = makeEditor();
    createExportDocxPlugin(ALLOW, { title: 'Quarterly Report' }).install(editor);
    let cmd = null; editor.on('afterCommand', (p) => { cmd = p.command; });
    expect(editor.exportDocx()).toBe(true);
    expect(created.clicks).toBe(1);
    expect(created.download).toBe('Quarterly-Report.docx');
    expect(cmd).toBe('exportDocx');
    vi.runAllTimers(); // fire the deferred revoke while the stub is still live
    expect(created.revoked).toContain('blob:fake');
  });

  it('per-call title overrides install config', () => {
    const editor = makeEditor();
    createExportDocxPlugin(ALLOW, { title: 'A' }).install(editor);
    editor.exportDocx({ title: 'B' });
    expect(created.download).toBe('B.docx');
  });

  it('destroy removes both handles', () => {
    const editor = makeEditor();
    const p = createExportDocxPlugin(ALLOW); p.install(editor);
    p.destroy();
    expect(editor.exportDocx).toBeUndefined();
    expect(editor.buildDocxBytes).toBeUndefined();
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
