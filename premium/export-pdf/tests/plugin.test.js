/**
 * export-pdf plugin — gated activation + the exportPdf() action flow, driven
 * through the REAL core PluginManager and a stubbed window.open.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createExportPdfPlugin, FEATURE_ID } from '../src/index.js';
import { PluginManager } from '../../../packages/core/src/plugins/plugin-manager.js';

const ALLOW = { manager: { gate: () => ({ allowed: true, reason: 'granted' }) } };
const DENY  = { manager: { gate: () => ({ allowed: false, reason: 'no-license' }) } };

function makeEditor(html = '<h1>Doc</h1><p>Body</p>') {
  const listeners = new Map();
  const editor = {
    _wrapper: document.createElement('div'),
    _config: {},
    _destroyed: false,
    getHTML: () => html,
    on(ev, fn) { (listeners.get(ev) || listeners.set(ev, []).get(ev)).push(fn); },
    off(ev, fn) { const a = listeners.get(ev) || []; const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); },
    emit(ev, p) { for (const fn of [...(listeners.get(ev) || [])]) fn(p); },
    logger: null, toolbar: null,
  };
  document.body.appendChild(editor._wrapper);
  return editor;
}

/** A fake popup window capturing what the plugin writes + whether it printed. */
function stubWindowOpen(returnNull = false) {
  const writes = [];
  const state = { printed: 0, focused: 0, closed: false };
  const fakeWin = {
    document: { write: (s) => writes.push(s), close: () => { state.closed = true; } },
    focus: () => { state.focused++; },
    print: () => { state.printed++; },
    requestAnimationFrame: (cb) => cb(),
  };
  const spy = vi.spyOn(window, 'open').mockImplementation(() => (returnNull ? null : fakeWin));
  return { spy, writes, state };
}

let opened;
beforeEach(() => { opened = null; });
afterEach(() => { if (opened) opened.spy.mockRestore(); vi.restoreAllMocks(); });

describe('export-pdf — feature id', () => {
  it('requires export.pdf', () => expect(FEATURE_ID).toBe('export.pdf'));
});

describe('export-pdf — granted', () => {
  it('installs, contributes an exportPdf button, and exposes editor.exportPdf()', () => {
    const editor = makeEditor();
    const pm = new PluginManager(editor); editor.plugins = pm;
    pm.install(createExportPdfPlugin(ALLOW));
    expect(pm.isInstalled('export-pdf')).toBe(true);
    expect(typeof editor.exportPdf).toBe('function');
    const btns = pm.get('export-pdf').getToolbarButtons();
    expect(btns[0]).toMatchObject({ name: 'exportPdf', readOnlyExempt: true });
  });

  it('exportPdf() opens a popup, writes the styled doc with the content, prints', () => {
    const editor = makeEditor('<h1>Title</h1><p>Hi</p>');
    opened = stubWindowOpen();
    createExportPdfPlugin(ALLOW).install(editor);
    const ok = editor.exportPdf();
    expect(ok).toBe(true);
    expect(opened.writes.length).toBe(1);
    expect(opened.writes[0]).toContain('<h1>Title</h1>');
    expect(opened.writes[0]).toContain('@page');
    expect(opened.state.printed).toBe(1);
    expect(opened.state.closed).toBe(true);
  });

  it('per-call options override install config which overrides nothing missing', () => {
    const editor = makeEditor();
    opened = stubWindowOpen();
    createExportPdfPlugin(ALLOW, { pageSize: 'A4' }).install(editor);
    editor.exportPdf({ pageSize: 'Letter', orientation: 'landscape' });
    expect(opened.writes[0]).toMatch(/size:\s*Letter landscape/);
  });

  it('reads editor._config.exportPdf as a config source', () => {
    const editor = makeEditor();
    editor._config.exportPdf = { pageSize: 'Legal' };
    opened = stubWindowOpen();
    createExportPdfPlugin(ALLOW).install(editor);
    editor.exportPdf();
    expect(opened.writes[0]).toMatch(/size:\s*Legal/);
  });

  it('popup blocked → returns false, emits exportPdfBlocked, does not throw', () => {
    const editor = makeEditor();
    opened = stubWindowOpen(true); // window.open returns null
    let blocked = null;
    editor.on('exportPdfBlocked', (p) => { blocked = p; });
    createExportPdfPlugin(ALLOW).install(editor);
    expect(editor.exportPdf()).toBe(false);
    expect(blocked).toEqual({ reason: 'popup-blocked' });
  });

  it('destroy() removes the editor.exportPdf handle', () => {
    const editor = makeEditor();
    const plugin = createExportPdfPlugin(ALLOW);
    plugin.install(editor);
    expect(editor.exportPdf).toBeTypeOf('function');
    plugin.destroy();
    expect(editor.exportPdf).toBeUndefined();
  });
});

describe('export-pdf — denied (graceful degrade)', () => {
  it('installs as a no-op stub: no exportPdf handle, upgrade notice shown', () => {
    const editor = makeEditor();
    const pm = new PluginManager(editor); editor.plugins = pm;
    pm.install(createExportPdfPlugin(DENY));
    expect(pm.isInstalled('export-pdf')).toBe(true);
    expect(editor.exportPdf).toBeUndefined();
    expect(editor._wrapper.querySelector('[data-oe-premium-notice]')).not.toBeNull();
  });
});
