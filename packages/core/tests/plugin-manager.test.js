/**
 * Phase 8 — PluginManager unit tests.
 * Uses createTestEditor (8.12) so every test gets a minimal, no-chrome editor.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestEditor } from '../src/testing/test-harness.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makePlugin(name, overrides = {}) {
  return {
    name,
    install: vi.fn(),
    destroy: vi.fn(),
    ...overrides,
  };
}

let editor;

beforeEach(() => { editor = createTestEditor(); });
afterEach(() => {
  if (!editor.isDestroyed()) editor.destroy();
  if (editor._target && editor._target.parentNode) editor._target.remove();
});

// ── 8.1 register / install / get / isInstalled / getAll ──────────────────────

describe('8.1 — PluginManager basics', () => {
  it('editor.plugins is a PluginManager instance', () => {
    expect(editor.plugins).toBeDefined();
    expect(typeof editor.plugins.install).toBe('function');
  });

  it('install(spec) registers and installs a plugin', () => {
    const p = makePlugin('alpha');
    editor.plugins.install(p);
    expect(editor.plugins.isInstalled('alpha')).toBe(true);
    expect(p.install).toHaveBeenCalledWith(editor);
  });

  it('get(name) returns the installed instance', () => {
    const p = makePlugin('beta');
    editor.plugins.install(p);
    expect(editor.plugins.get('beta')).toBe(p);
  });

  it('isInstalled returns false for unknown plugin', () => {
    expect(editor.plugins.isInstalled('nope')).toBe(false);
  });

  it('getAll() returns a Map of installed plugins', () => {
    const p = makePlugin('gamma');
    editor.plugins.install(p);
    const all = editor.plugins.getAll();
    expect(all).toBeInstanceOf(Map);
    expect(all.has('gamma')).toBe(true);
  });

  it('getAll() returns a copy — mutation does not affect registry', () => {
    const p = makePlugin('delta');
    editor.plugins.install(p);
    const all = editor.plugins.getAll();
    all.delete('delta');
    expect(editor.plugins.isInstalled('delta')).toBe(true);
  });
});

// ── 8.2 Plugin interface validation ──────────────────────────────────────────

describe('8.2 — Plugin interface validation', () => {
  it('register throws when name is missing', () => {
    expect(() => editor.plugins.register({ install: () => {}, destroy: () => {} }))
      .toThrow(/must have a string "name"/);
  });

  it('register throws when install is not a function', () => {
    expect(() => editor.plugins.register({ name: 'bad', destroy: () => {} }))
      .toThrow(/must implement install/);
  });

  it('register throws when destroy is not a function', () => {
    expect(() => editor.plugins.register({ name: 'bad', install: () => {} }))
      .toThrow(/must implement destroy/);
  });

  it('install(name) throws when name is not registered', () => {
    expect(() => editor.plugins.install('unregistered'))
      .toThrow(/is not registered/);
  });
});

// ── 8.3 onInit hook (ready event) ────────────────────────────────────────────

describe('8.3 — onInit hook via ready event', () => {
  it('plugin installed in ready handler receives editor instance', () => {
    const received = [];
    const p = makePlugin('hook-test', {
      install(ed) { received.push(ed); },
    });
    // Install directly — editor is already initialized, install fires immediately
    editor.plugins.install(p);
    expect(received[0]).toBe(editor);
  });

  it('onKeyDown hook is called on keydown (8.6)', () => {
    const calls = [];
    const p = makePlugin('kd-test', {
      install() {},
      onKeyDown: vi.fn((e) => { calls.push(e.key); return false; }),
    });
    editor.plugins.install(p);
    const edEl = editor.getEditorElement();
    edEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    expect(p.onKeyDown).toHaveBeenCalled();
  });
});

// ── 8.9 Error isolation ───────────────────────────────────────────────────────

describe('8.9 — Error isolation', () => {
  it('a crashing install() emits error event and does not propagate', () => {
    const errors = [];
    editor.on('error', (e) => errors.push(e));
    const bad = makePlugin('crash-install', {
      install() { throw new Error('install boom'); },
    });
    expect(() => editor.plugins.install(bad)).not.toThrow();
    expect(errors.length).toBe(1);
    expect(errors[0].context).toMatch(/plugin:install:crash-install/);
    expect(editor.plugins.isInstalled('crash-install')).toBe(false);
  });

  it('a crashing destroy() emits error event and does not propagate', () => {
    const errors = [];
    editor.on('error', (e) => errors.push(e));
    const bad = makePlugin('crash-destroy', {
      destroy() { throw new Error('destroy boom'); },
    });
    editor.plugins.install(bad);
    expect(() => editor.plugins.uninstall('crash-destroy')).not.toThrow();
    expect(errors.length).toBe(1);
    expect(errors[0].context).toMatch(/plugin:destroy:crash-destroy/);
  });

  it('one bad plugin does not prevent other plugins from working', () => {
    const errors = [];
    editor.on('error', (e) => errors.push(e));
    editor.plugins.install(makePlugin('bad', { install() { throw new Error('bad'); } }));
    const good = makePlugin('good');
    editor.plugins.install(good);
    expect(editor.plugins.isInstalled('good')).toBe(true);
    expect(good.install).toHaveBeenCalled();
  });

  // M9 fix — listeners a plugin registered before its install() threw must be
  // removed, not leaked. Otherwise the event fires into a dead plugin.
  it('a partial install (listener added, then throw) does not leak the listener', () => {
    const spy = vi.fn();
    const bad = makePlugin('partial', {
      install(ed) { ed.on('customEvt', spy); throw new Error('boom after listen'); },
    });
    editor.plugins.install(bad);
    expect(editor.plugins.isInstalled('partial')).toBe(false);
    // The listener must have been cleaned up — emitting should not call it.
    editor.emit('customEvt', {});
    expect(spy).not.toHaveBeenCalled();
  });

  // MEDIUM fix — PluginManager cannot track window/DOM listeners a plugin binds
  // directly (only editor.on). On a failed install it must call the plugin's own
  // destroy() so it can tear down those untracked resources.
  it('a failed install calls the plugin destroy() so it can clean up untracked resources', () => {
    const destroy = vi.fn();
    const bad = makePlugin('partial-dom', {
      install() {
        // Simulate a plugin binding a window listener before throwing.
        this._winHandler = () => {};
        if (typeof window !== 'undefined') window.addEventListener('resize', this._winHandler);
        throw new Error('boom mid-install');
      },
      destroy,
    });
    editor.plugins.install(bad);
    expect(editor.plugins.isInstalled('partial-dom')).toBe(false);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('a destroy() that throws after a failed install is swallowed (no propagation)', () => {
    const bad = makePlugin('partial-throwing-destroy', {
      install() { throw new Error('install boom'); },
      destroy() { throw new Error('destroy boom too'); },
    });
    expect(() => editor.plugins.install(bad)).not.toThrow();
    expect(editor.plugins.isInstalled('partial-throwing-destroy')).toBe(false);
  });
});

// ── Idempotency ───────────────────────────────────────────────────────────────

describe('Idempotency', () => {
  it('installing the same plugin twice warns and does not double-install', () => {
    const p = makePlugin('idem');
    editor.plugins.install(p);
    editor.plugins.install(p);
    expect(p.install).toHaveBeenCalledTimes(1);
  });

  it('uninstalling a non-installed plugin warns and does not throw', () => {
    expect(() => editor.plugins.uninstall('nobody')).not.toThrow();
  });
});

// ── 8.11 Dependency resolution ───────────────────────────────────────────────

describe('8.11 — Dependency resolution', () => {
  it('installs dependencies before the dependent plugin', () => {
    const order = [];
    const dep = makePlugin('dep', { install() { order.push('dep'); } });
    const main = makePlugin('main', {
      dependencies: ['dep'],
      install() { order.push('main'); },
    });
    editor.plugins.register(dep);
    editor.plugins.install(main);
    expect(order).toEqual(['dep', 'main']);
  });

  it('throws a descriptive error when a dependency is not registered', () => {
    const main = makePlugin('wants-missing', { dependencies: ['missing-dep'] });
    expect(() => editor.plugins.install(main))
      .toThrow(/requires "missing-dep"/);
  });

  it('throws on circular dependency', () => {
    const a = makePlugin('circ-a', { dependencies: ['circ-b'] });
    const b = makePlugin('circ-b', { dependencies: ['circ-a'] });
    editor.plugins.register(a);
    editor.plugins.register(b);
    expect(() => editor.plugins.install(a)).toThrow(/circular dependency/i);
  });

  it('skips dependency install when already installed', () => {
    const dep = makePlugin('shared-dep');
    const main = makePlugin('needs-shared', { dependencies: ['shared-dep'] });
    editor.plugins.register(dep);
    editor.plugins.install(dep);
    editor.plugins.install(main);
    expect(dep.install).toHaveBeenCalledTimes(1);
  });
});

// ── 8.8 / Listener cleanup ────────────────────────────────────────────────────

describe('8.8 — Automatic listener cleanup on uninstall', () => {
  it('listeners registered during install are removed on uninstall', () => {
    const calls = [];
    const p = makePlugin('listener-test', {
      install(ed) { ed.on('input', () => calls.push(1)); },
    });
    editor.plugins.install(p);
    editor.plugins.uninstall('listener-test');
    editor.getEditorElement().dispatchEvent(new Event('input', { bubbles: true }));
    expect(calls.length).toBe(0);
  });
});

// ── pluginInstalled / pluginUninstalled events ────────────────────────────────

describe('Plugin events', () => {
  it('pluginInstalled fires with name and plugin', () => {
    const events = [];
    editor.on('pluginInstalled', (e) => events.push(e));
    const p = makePlugin('evt-test');
    editor.plugins.install(p);
    expect(events[0].name).toBe('evt-test');
    expect(events[0].plugin).toBe(p);
  });

  it('pluginUninstalled fires with name', () => {
    const events = [];
    editor.on('pluginUninstalled', (e) => events.push(e));
    const p = makePlugin('evt-uninstall');
    editor.plugins.install(p);
    editor.plugins.uninstall('evt-uninstall');
    expect(events[0].name).toBe('evt-uninstall');
  });
});

// ── 8.7 Plugin receives full editor API ──────────────────────────────────────

describe('8.7 — Plugin API access', () => {
  it('plugin install() receives editor with commands, selection, state, ui', () => {
    let receivedEditor;
    const p = makePlugin('api-check', { install(ed) { receivedEditor = ed; } });
    editor.plugins.install(p);
    expect(typeof receivedEditor.commands.execute).toBe('function');
    expect(typeof receivedEditor.selection.get).toBe('function');
    expect(receivedEditor.state).toBeDefined();
    expect(receivedEditor.ui).toBeDefined();
  });
});

// ── 8.10 getAll() ────────────────────────────────────────────────────────────

describe('8.10 — getAll()', () => {
  it('returns all installed plugins', () => {
    editor.plugins.install(makePlugin('one'));
    editor.plugins.install(makePlugin('two'));
    const all = editor.plugins.getAll();
    expect(all.size).toBe(2);
    expect(all.has('one')).toBe(true);
    expect(all.has('two')).toBe(true);
  });
});

// ── destroy() uninstalls all plugins ─────────────────────────────────────────

describe('PluginManager.destroy()', () => {
  it('editor.destroy() calls destroy() on all installed plugins', () => {
    const p1 = makePlugin('cleanup-one');
    const p2 = makePlugin('cleanup-two');
    editor.plugins.install(p1);
    editor.plugins.install(p2);
    editor.destroy();
    expect(p1.destroy).toHaveBeenCalled();
    expect(p2.destroy).toHaveBeenCalled();
    editor._target.remove();
    // Prevent afterEach double-destroy
    editor = { isDestroyed: () => true, _target: { parentNode: null } };
  });
});
