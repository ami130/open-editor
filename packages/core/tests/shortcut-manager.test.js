import { describe, it, expect, vi } from 'vitest';
import { ShortcutManager } from '../src/shortcuts/shortcut-manager.js';

function makeEvent(overrides = {}) {
  return {
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    key: '',
    ...overrides,
  };
}

describe('ShortcutManager', () => {
  it('register() and getAll() round-trip', () => {
    const sm = new ShortcutManager();
    sm.register('ctrl+b', 'bold', 'Bold');
    const all = sm.getAll();
    expect(all.size).toBe(1);
    expect(all.get('ctrl+b')).toEqual({ keys: 'ctrl+b', command: 'bold', label: 'Bold' });
  });

  it('normalizes key casing', () => {
    const sm = new ShortcutManager();
    sm.register('Ctrl+B', 'bold');
    expect(sm.getAll().has('ctrl+b')).toBe(true);
  });

  it('normalizes modifier order (shift before key, ctrl first)', () => {
    const sm = new ShortcutManager();
    sm.register('shift+ctrl+z', 'redo');
    expect(sm.getAll().has('ctrl+shift+z')).toBe(true);
  });

  it('unregister() removes a shortcut', () => {
    const sm = new ShortcutManager();
    sm.register('ctrl+b', 'bold');
    sm.unregister('ctrl+b');
    expect(sm.getAll().size).toBe(0);
  });

  it('unregister() on non-existent key does not throw', () => {
    const sm = new ShortcutManager();
    expect(() => sm.unregister('ctrl+z')).not.toThrow();
  });

  it('match() finds correct shortcut from KeyboardEvent', () => {
    const sm = new ShortcutManager();
    sm.register('ctrl+b', 'bold', 'Bold');
    const result = sm.match(makeEvent({ ctrlKey: true, key: 'b' }));
    expect(result).not.toBeNull();
    expect(result.command).toBe('bold');
  });

  it('match() returns null when no match', () => {
    const sm = new ShortcutManager();
    sm.register('ctrl+b', 'bold');
    expect(sm.match(makeEvent({ ctrlKey: true, key: 'i' }))).toBeNull();
  });

  it('match() handles meta key (Mac Cmd)', () => {
    const sm = new ShortcutManager();
    sm.register('meta+b', 'bold');
    expect(sm.match(makeEvent({ metaKey: true, key: 'b' }))).not.toBeNull();
  });

  it('match() handles shift modifier', () => {
    const sm = new ShortcutManager();
    sm.register('ctrl+shift+z', 'redo');
    const result = sm.match(makeEvent({ ctrlKey: true, shiftKey: true, key: 'z' }));
    expect(result?.command).toBe('redo');
  });

  it('conflict detection warns via logger', () => {
    const logger = { warn: vi.fn() };
    const sm = new ShortcutManager(logger);
    sm.register('ctrl+b', 'bold');
    sm.register('ctrl+b', 'something-else');
    expect(logger.warn).toHaveBeenCalledOnce();
    expect(logger.warn.mock.calls[0][0]).toMatch(/conflict/i);
  });

  it('conflict: last registration wins', () => {
    const sm = new ShortcutManager();
    sm.register('ctrl+b', 'first');
    sm.register('ctrl+b', 'second');
    expect(sm.getAll().get('ctrl+b').command).toBe('second');
  });

  it('getAll() returns a copy, not the internal map', () => {
    const sm = new ShortcutManager();
    sm.register('ctrl+b', 'bold');
    const copy = sm.getAll();
    copy.delete('ctrl+b');
    expect(sm.getAll().size).toBe(1);
  });

  it('register() returns this for chaining', () => {
    const sm = new ShortcutManager();
    expect(sm.register('ctrl+b', 'bold')).toBe(sm);
  });

  it('modifier-only events do not match shortcuts', () => {
    const sm = new ShortcutManager();
    sm.register('ctrl+b', 'bold');
    expect(sm.match(makeEvent({ ctrlKey: true, key: 'Control' }))).toBeNull();
  });
});
