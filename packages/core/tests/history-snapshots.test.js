/**
 * HistoryManager tests — Part A: initial state, takeSnapshot, undo/redo,
 * and redo-stack truncation after new edit.
 * Split from history-manager.test.js to stay within the 300-line limit.
 */
import { describe, it, expect, vi } from 'vitest';
import { HistoryManager } from '../src/history/history-manager.js';

function makeStubEditor(html = '<p>initial</p>') {
  const listeners = {};
  const el = document.createElement('div');
  el.innerHTML = html;
  document.body.appendChild(el);

  const editor = {
    _el: el,
    _destroyed: false,
    _timers: new Set(),
    commands: { _batching: false },
    selection: {
      save:    () => ({ startPath: [0], startOffset: 0, endPath: [0], endOffset: 0, collapsed: true }),
      restore: vi.fn(),
    },
    getEditorElement: () => el,
    isDestroyed:      () => editor._destroyed,
    _setRawHTML: (h) => { el.innerHTML = h; },
    emit: (event, ...args) => {
      (listeners[event] || []).forEach(fn => fn(...args));
    },
    on:  (event, fn) => { (listeners[event] = listeners[event] || []).push(fn); },
    off: (event, fn) => {
      if (listeners[event]) listeners[event] = listeners[event].filter(f => f !== fn);
    },
  };
  return { editor, el };
}

function cleanup(editor, el) {
  if (!editor._destroyed) {
    try { editor._destroyed = true; } catch { /* intentional */ }
  }
  if (el && el.parentNode) el.parentNode.removeChild(el);
}

describe('HistoryManager — initial state', () => {
  it('canUndo() returns false before any snapshot', () => {
    const { editor, el } = makeStubEditor();
    const hm = new HistoryManager(editor);
    expect(hm.canUndo()).toBe(false);
    hm.destroy(); cleanup(editor, el);
  });

  it('canRedo() returns false initially', () => {
    const { editor, el } = makeStubEditor();
    const hm = new HistoryManager(editor);
    expect(hm.canRedo()).toBe(false);
    hm.destroy(); cleanup(editor, el);
  });

  it('canUndo() stays false after one snapshot (initial snapshot = index 0)', () => {
    const { editor, el } = makeStubEditor();
    const hm = new HistoryManager(editor);
    hm.takeSnapshot();
    expect(hm.canUndo()).toBe(false);
    hm.destroy(); cleanup(editor, el);
  });
});

describe('takeSnapshot()', () => {
  it('increases stack length', () => {
    const { editor, el } = makeStubEditor('<p>a</p>');
    const hm = new HistoryManager(editor);
    hm.takeSnapshot();
    el.innerHTML = '<p>b</p>';
    hm.takeSnapshot();
    expect(hm._stack.length).toBe(2);
    hm.destroy(); cleanup(editor, el);
  });

  it('stores the current innerHTML', () => {
    const { editor, el } = makeStubEditor('<p>hello</p>');
    const hm = new HistoryManager(editor);
    hm.takeSnapshot();
    expect(hm._stack[0].html).toBe('<p>hello</p>');
    hm.destroy(); cleanup(editor, el);
  });

  it('is a no-op while _isApplying is true', () => {
    const { editor, el } = makeStubEditor();
    const hm = new HistoryManager(editor);
    hm._isApplying = true;
    hm.takeSnapshot();
    expect(hm._stack.length).toBe(0);
    hm._isApplying = false;
    hm.destroy(); cleanup(editor, el);
  });

  it('is a no-op after editor is destroyed', () => {
    const { editor, el } = makeStubEditor();
    const hm = new HistoryManager(editor);
    editor._destroyed = true;
    hm.takeSnapshot();
    expect(hm._stack.length).toBe(0);
    hm.destroy(); cleanup(editor, el);
  });
});

describe('undo()', () => {
  it('restores previous HTML content', () => {
    const { editor, el } = makeStubEditor('<p>first</p>');
    const hm = new HistoryManager(editor);
    hm.takeSnapshot();
    el.innerHTML = '<p>second</p>';
    hm.takeSnapshot();
    hm.undo();
    expect(el.innerHTML).toBe('<p>first</p>');
    hm.destroy(); cleanup(editor, el);
  });

  it('decrements _index', () => {
    const { editor, el } = makeStubEditor('<p>a</p>');
    const hm = new HistoryManager(editor);
    hm.takeSnapshot();
    el.innerHTML = '<p>b</p>';
    hm.takeSnapshot();
    const before = hm._index;
    hm.undo();
    expect(hm._index).toBe(before - 1);
    hm.destroy(); cleanup(editor, el);
  });

  it('is a no-op when canUndo() is false', () => {
    const { editor, el } = makeStubEditor('<p>only</p>');
    const hm = new HistoryManager(editor);
    hm.takeSnapshot();
    hm.undo();
    expect(el.innerHTML).toBe('<p>only</p>');
    hm.destroy(); cleanup(editor, el);
  });

  it('emits undo event on editor', () => {
    const { editor, el } = makeStubEditor('<p>a</p>');
    const hm = new HistoryManager(editor);
    hm.takeSnapshot();
    el.innerHTML = '<p>b</p>';
    hm.takeSnapshot();
    const fn = vi.fn();
    editor.on('undo', fn);
    hm.undo();
    expect(fn).toHaveBeenCalled();
    hm.destroy(); cleanup(editor, el);
  });

  it('cancels any pending idle snapshot timer', () => {
    const { editor, el } = makeStubEditor('<p>a</p>');
    const hm = new HistoryManager(editor);
    hm.takeSnapshot();
    el.innerHTML = '<p>b</p>';
    hm.takeSnapshot();
    hm._idleTimer = setTimeout(() => {}, 99999);
    hm.undo();
    expect(hm._idleTimer).toBeNull();
    hm.destroy(); cleanup(editor, el);
  });
});

describe('redo()', () => {
  it('re-applies the next snapshot', () => {
    const { editor, el } = makeStubEditor('<p>first</p>');
    const hm = new HistoryManager(editor);
    hm.takeSnapshot();
    el.innerHTML = '<p>second</p>';
    hm.takeSnapshot();
    hm.undo();
    hm.redo();
    expect(el.innerHTML).toBe('<p>second</p>');
    hm.destroy(); cleanup(editor, el);
  });

  it('is a no-op when canRedo() is false', () => {
    const { editor, el } = makeStubEditor('<p>only</p>');
    const hm = new HistoryManager(editor);
    hm.takeSnapshot();
    hm.redo();
    expect(el.innerHTML).toBe('<p>only</p>');
    hm.destroy(); cleanup(editor, el);
  });

  it('emits redo event on editor', () => {
    const { editor, el } = makeStubEditor('<p>a</p>');
    const hm = new HistoryManager(editor);
    hm.takeSnapshot();
    el.innerHTML = '<p>b</p>';
    hm.takeSnapshot();
    hm.undo();
    const fn = vi.fn();
    editor.on('redo', fn);
    hm.redo();
    expect(fn).toHaveBeenCalled();
    hm.destroy(); cleanup(editor, el);
  });
});

describe('redo stack truncated after new edit', () => {
  it('canRedo() returns false after a new snapshot following an undo', () => {
    const { editor, el } = makeStubEditor('<p>a</p>');
    const hm = new HistoryManager(editor);
    hm.takeSnapshot();
    el.innerHTML = '<p>b</p>';
    hm.takeSnapshot();
    hm.undo();
    el.innerHTML = '<p>c</p>';
    hm.takeSnapshot();
    expect(hm.canRedo()).toBe(false);
    hm.destroy(); cleanup(editor, el);
  });

  it('stack length is correct after truncation', () => {
    const { editor, el } = makeStubEditor('<p>a</p>');
    const hm = new HistoryManager(editor);
    hm.takeSnapshot();
    el.innerHTML = '<p>b</p>';
    hm.takeSnapshot();
    el.innerHTML = '<p>c</p>';
    hm.takeSnapshot();
    hm.undo();
    hm.undo();
    el.innerHTML = '<p>d</p>';
    hm.takeSnapshot();
    expect(hm._stack.length).toBe(2);
    expect(hm._index).toBe(1);
    hm.destroy(); cleanup(editor, el);
  });
});
