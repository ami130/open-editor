import { describe, it, expect, vi } from 'vitest';
import { CommandManager } from '../src/commands/command-manager.js';

// Minimal editor stub
function makeEditor(overrides = {}) {
  return {
    isDestroyed: () => false,
    selection: {
      save: () => ({ startPath: [], startOffset: 0, endPath: [], endOffset: 0, collapsed: true }),
      restore: () => {},
      get: () => null,
    },
    logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
    emit: vi.fn(),
    ...overrides,
  };
}

// ─── register / getAll / unregister ──────────────────────────────────────────

describe('CommandManager register / getAll / unregister', () => {
  it('registers a command and returns it via getAll()', () => {
    const cm = new CommandManager(makeEditor());
    cm.register('test', { execute: () => {} });
    expect(cm.getAll().has('test')).toBe(true);
    cm.destroy();
  });

  it('getAll() returns a copy — mutations do not affect internal map', () => {
    const cm = new CommandManager(makeEditor());
    cm.register('a', { execute: () => {} });
    const all = cm.getAll();
    all.delete('a');
    expect(cm.getAll().has('a')).toBe(true);
    cm.destroy();
  });

  it('unregister removes the command', () => {
    const cm = new CommandManager(makeEditor());
    cm.register('foo', { execute: () => {} });
    cm.unregister('foo');
    expect(cm.getAll().has('foo')).toBe(false);
    cm.destroy();
  });

  it('warns on duplicate registration', () => {
    const editor = makeEditor();
    const cm = new CommandManager(editor);
    cm.register('dup', { execute: () => {} });
    cm.register('dup', { execute: () => {} });
    expect(editor.logger.warn).toHaveBeenCalled();
    cm.destroy();
  });

  it('ignores registration with no execute function', () => {
    const cm = new CommandManager(makeEditor());
    cm.register('bad', {});
    expect(cm.getAll().has('bad')).toBe(false);
    cm.destroy();
  });
});

// ─── execute ─────────────────────────────────────────────────────────────────

describe('CommandManager execute()', () => {
  it('calls the command execute function', () => {
    const execute = vi.fn();
    const editor = makeEditor();
    const cm = new CommandManager(editor);
    cm.register('cmd', { execute });
    cm.execute('cmd');
    expect(execute).toHaveBeenCalledOnce();
    cm.destroy();
  });

  it('returns false and warns for unknown command', () => {
    const editor = makeEditor();
    const cm = new CommandManager(editor);
    const result = cm.execute('unknown');
    expect(result).toBe(false);
    expect(editor.logger.warn).toHaveBeenCalled();
    cm.destroy();
  });

  it('emits beforeCommand before executing', () => {
    const editor = makeEditor();
    const cm = new CommandManager(editor);
    cm.register('cmd', { execute: () => {} });
    cm.execute('cmd');
    expect(editor.emit).toHaveBeenCalledWith('beforeCommand', expect.objectContaining({ command: 'cmd' }));
    cm.destroy();
  });

  it('emits afterCommand after executing', () => {
    const editor = makeEditor();
    const cm = new CommandManager(editor);
    cm.register('cmd', { execute: () => {} });
    cm.execute('cmd');
    expect(editor.emit).toHaveBeenCalledWith('afterCommand', expect.objectContaining({ command: 'cmd' }));
    cm.destroy();
  });

  it('does not execute when beforeCommand calls preventDefault()', () => {
    const execute = vi.fn();
    const editor = makeEditor();
    editor.emit = vi.fn((event, payload) => {
      if (event === 'beforeCommand') payload.preventDefault();
    });
    const cm = new CommandManager(editor);
    cm.register('cmd', { execute });
    cm.execute('cmd');
    expect(execute).not.toHaveBeenCalled();
    cm.destroy();
  });

  it('does not execute when isEnabled returns false', () => {
    const execute = vi.fn();
    const editor = makeEditor();
    const cm = new CommandManager(editor);
    cm.register('cmd', { execute, isEnabled: () => false });
    cm.execute('cmd');
    expect(execute).not.toHaveBeenCalled();
    cm.destroy();
  });

  it('saves and restores selection around execute', () => {
    const save = vi.fn(() => ({ startPath: [], startOffset: 0, endPath: [], endOffset: 0, collapsed: true }));
    const restore = vi.fn();
    const editor = makeEditor({ selection: { save, restore, get: () => null } });
    const cm = new CommandManager(editor);
    cm.register('cmd', { execute: () => {} });
    cm.execute('cmd');
    expect(save).toHaveBeenCalled();
    expect(restore).toHaveBeenCalled();
    cm.destroy();
  });

  it('returns false when editor is destroyed', () => {
    const editor = makeEditor({ isDestroyed: () => true });
    const cm = new CommandManager(editor);
    cm.register('cmd', { execute: () => {} });
    expect(cm.execute('cmd')).toBe(false);
    cm.destroy();
  });

  it('emits error event and returns false when execute throws', () => {
    const editor = makeEditor();
    const cm = new CommandManager(editor);
    cm.register('bad', { execute: () => { throw new Error('oops'); } });
    const result = cm.execute('bad');
    expect(result).toBe(false);
    expect(editor.emit).toHaveBeenCalledWith('error', expect.objectContaining({ context: 'command:bad' }));
    cm.destroy();
  });
});

// ─── isActive / isEnabled ─────────────────────────────────────────────────────

describe('CommandManager isActive() / isEnabled()', () => {
  it('isActive returns false for unknown command', () => {
    const cm = new CommandManager(makeEditor());
    expect(cm.isActive('nope')).toBe(false);
    cm.destroy();
  });

  it('isActive delegates to command descriptor', () => {
    const editor = makeEditor();
    const cm = new CommandManager(editor);
    cm.register('cmd', { execute: () => {}, isActive: () => true });
    expect(cm.isActive('cmd')).toBe(true);
    cm.destroy();
  });

  it('isActive returns false when no isActive defined', () => {
    const editor = makeEditor();
    const cm = new CommandManager(editor);
    cm.register('cmd', { execute: () => {} });
    expect(cm.isActive('cmd')).toBe(false);
    cm.destroy();
  });

  it('isEnabled returns true when no isEnabled defined', () => {
    const editor = makeEditor();
    const cm = new CommandManager(editor);
    cm.register('cmd', { execute: () => {} });
    expect(cm.isEnabled('cmd')).toBe(true);
    cm.destroy();
  });

  it('isEnabled delegates to command descriptor', () => {
    const editor = makeEditor();
    const cm = new CommandManager(editor);
    cm.register('cmd', { execute: () => {}, isEnabled: () => false });
    expect(cm.isEnabled('cmd')).toBe(false);
    cm.destroy();
  });
});

// ─── batch ───────────────────────────────────────────────────────────────────

describe('CommandManager batch()', () => {
  it('sets _batching to true during fn execution', () => {
    const editor = makeEditor();
    const cm = new CommandManager(editor);
    let sawBatching = false;
    cm.batch(() => { sawBatching = cm._batching; });
    expect(sawBatching).toBe(true);
    cm.destroy();
  });

  it('resets _batching to false after fn completes', () => {
    const editor = makeEditor();
    const cm = new CommandManager(editor);
    cm.batch(() => {});
    expect(cm._batching).toBe(false);
    cm.destroy();
  });

  it('resets _batching even if fn throws', () => {
    const editor = makeEditor();
    const cm = new CommandManager(editor);
    try { cm.batch(() => { throw new Error('fail'); }); } catch { /* intentional */ }
    expect(cm._batching).toBe(false);
    cm.destroy();
  });

  it('supports nested batch — _batching stays true until outermost exits', () => {
    const editor = makeEditor();
    const cm = new CommandManager(editor);
    let innerBatching = false;
    cm.batch(() => {
      cm.batch(() => { innerBatching = cm._batching; });
      // still inside outer batch
      expect(cm._batching).toBe(true);
    });
    expect(cm._batching).toBe(false);
    expect(innerBatching).toBe(true);
    cm.destroy();
  });

  it('is a no-op for non-function argument', () => {
    const editor = makeEditor();
    const cm = new CommandManager(editor);
    expect(() => cm.batch(null)).not.toThrow();
    cm.destroy();
  });
});

// ─── destroy ─────────────────────────────────────────────────────────────────

describe('CommandManager destroy()', () => {
  it('clears all registered commands', () => {
    const editor = makeEditor();
    const cm = new CommandManager(editor);
    cm.register('a', { execute: () => {} });
    cm.destroy();
    expect(cm.getAll().size).toBe(0);
  });

  it('execute returns false after destroy', () => {
    const editor = makeEditor();
    const cm = new CommandManager(editor);
    cm.register('cmd', { execute: () => {} });
    cm.destroy();
    expect(cm.execute('cmd')).toBe(false);
  });
});

// ─── readonly gating (BUG-6 fix) ─────────────────────────────────────────────
describe('CommandManager readonly gating', () => {
  function readonlyEditor() { return makeEditor({ isReadOnly: () => true }); }

  it('blocks a mutating command in readonly', () => {
    const cm = new CommandManager(readonlyEditor());
    const spy = vi.fn();
    cm.register('bold', { execute: spy });
    expect(cm.execute('bold')).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('allows undo/redo in readonly', () => {
    const cm = new CommandManager(readonlyEditor());
    const undo = vi.fn(() => true), redo = vi.fn(() => true);
    cm.register('undo', { execute: undo });
    cm.register('redo', { execute: redo });
    cm.execute('undo'); cm.execute('redo');
    expect(undo).toHaveBeenCalled();
    expect(redo).toHaveBeenCalled();
  });

  it('allows selectAll and copyAsPlainText in readonly (non-mutating)', () => {
    const cm = new CommandManager(readonlyEditor());
    const sel = vi.fn(() => true), copy = vi.fn(() => true);
    cm.register('selectAll', { execute: sel });
    cm.register('copyAsPlainText', { execute: copy });
    cm.execute('selectAll'); cm.execute('copyAsPlainText');
    expect(sel).toHaveBeenCalled();
    expect(copy).toHaveBeenCalled();
  });

  it('still blocks cut in readonly (cut mutates)', () => {
    const cm = new CommandManager(readonlyEditor());
    const cut = vi.fn();
    cm.register('cut', { execute: cut });
    expect(cm.execute('cut')).toBe(false);
    expect(cut).not.toHaveBeenCalled();
  });
});
