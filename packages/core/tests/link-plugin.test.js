/**
 * link-plugin.test.js — Phase 10 plugin integration.
 * Covers: install (unlink command + selectionChange popover), toolbar button
 * with isActive, onKeyDown consuming Ctrl/Cmd+K, and clean destroy/uninstall.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestEditor } from '../src/testing/test-harness.js';
import { linkPlugin } from '../src/plugins/link/link-plugin.js';

// Fresh spec clone per test (plugin stores state on the spec object itself).
function makePlugin() {
  return Object.assign(Object.create(null), linkPlugin, {
    _editor: null, _popover: null, _behaviorCleanups: null, _onSelChange: null,
  });
}

let editor;
beforeEach(() => { editor = createTestEditor(); });
afterEach(() => {
  if (!editor.isDestroyed()) editor.destroy();
  if (editor._target && editor._target.parentNode) editor._target.remove();
});

describe('link plugin — install', () => {
  it('installs without error', () => {
    const p = makePlugin();
    expect(() => editor.plugins.install(p)).not.toThrow();
    editor.plugins.uninstall('link');
  });

  it('registers the synchronous unlink command', () => {
    const p = makePlugin();
    editor.plugins.install(p);
    expect(editor.commands.get('unlink')).toBeTruthy();
    editor.plugins.uninstall('link');
  });

  it('does NOT register a "link" command (async flow)', () => {
    const p = makePlugin();
    editor.plugins.install(p);
    expect(editor.commands.get('link')).toBeFalsy();
    editor.plugins.uninstall('link');
  });

  it('creates a popover on the wrapper', () => {
    const p = makePlugin();
    editor.plugins.install(p);
    expect(editor._wrapper.querySelector('.oe-link-popover')).toBeTruthy();
    editor.plugins.uninstall('link');
  });
});

describe('link plugin — toolbar button', () => {
  it('returns one insertLink button with isActive', () => {
    const p = makePlugin();
    editor.plugins.install(p);
    const btns = p.getToolbarButtons();
    expect(btns).toHaveLength(1);
    expect(btns[0].name).toBe('insertLink');
    expect(typeof btns[0].isActive).toBe('function');
    expect(typeof btns[0].onClick).toBe('function');
    editor.plugins.uninstall('link');
  });

  it('isActive reflects caret inside an <a>', () => {
    const p = makePlugin();
    editor.plugins.install(p);
    const btn = p.getToolbarButtons()[0];
    editor.getEditorElement().innerHTML = '<p><a href="#x">x</a></p>';
    const a = editor.getEditorElement().querySelector('a');
    editor.selection.set(a.firstChild, 0);
    expect(btn.isActive(editor)).toBe(true);
    editor.plugins.uninstall('link');
  });
});

describe('link plugin — onKeyDown', () => {
  it('consumes Ctrl+K and calls _openDialog', () => {
    const p = makePlugin();
    editor.plugins.install(p);
    const spy = vi.spyOn(p, '_openDialog').mockImplementation(() => {});
    const consumed = p.onKeyDown({ ctrlKey: true, metaKey: false, shiftKey: false, key: 'k' });
    expect(consumed).toBe(true);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
    editor.plugins.uninstall('link');
  });

  it('consumes Cmd+K', () => {
    const p = makePlugin();
    editor.plugins.install(p);
    const spy = vi.spyOn(p, '_openDialog').mockImplementation(() => {});
    expect(p.onKeyDown({ ctrlKey: false, metaKey: true, shiftKey: false, key: 'k' })).toBe(true);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
    editor.plugins.uninstall('link');
  });

  it('ignores Ctrl+Shift+K and plain K', () => {
    const p = makePlugin();
    editor.plugins.install(p);
    const spy = vi.spyOn(p, '_openDialog').mockImplementation(() => {});
    expect(p.onKeyDown({ ctrlKey: true, shiftKey: true, key: 'k' })).toBe(false);
    expect(p.onKeyDown({ ctrlKey: false, metaKey: false, shiftKey: false, key: 'k' })).toBe(false);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
    editor.plugins.uninstall('link');
  });
});

describe('link plugin — destroy', () => {
  it('unregisters unlink and removes the popover', () => {
    const p = makePlugin();
    editor.plugins.install(p);
    expect(editor.commands.get('unlink')).toBeTruthy();
    editor.plugins.uninstall('link');
    expect(editor.commands.get('unlink')).toBeFalsy();
    expect(editor._wrapper.querySelector('.oe-link-popover')).toBeFalsy();
  });

  it('uninstalls cleanly', () => {
    const p = makePlugin();
    editor.plugins.install(p);
    expect(() => editor.plugins.uninstall('link')).not.toThrow();
  });
});
