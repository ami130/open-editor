/**
 * HistoryManager tests — Part B: MAX_STACK cap, clear(), _isApplying guard,
 * event wiring (afterCommand/afterBatch), destroy(), and H4 deduplication.
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

describe('MAX_STACK = 100 cap', () => {
  it('never exceeds 100 entries', () => {
    const { editor, el } = makeStubEditor();
    const hm = new HistoryManager(editor);
    for (let i = 0; i < 110; i++) {
      el.innerHTML = `<p>${i}</p>`;
      hm.takeSnapshot();
    }
    expect(hm._stack.length).toBeLessThanOrEqual(100);
    hm.destroy(); cleanup(editor, el);
  });

  it('_index stays consistent after oldest entries are dropped', () => {
    const { editor, el } = makeStubEditor();
    const hm = new HistoryManager(editor);
    for (let i = 0; i < 110; i++) {
      el.innerHTML = `<p>${i}</p>`;
      hm.takeSnapshot();
    }
    expect(hm._index).toBe(hm._stack.length - 1);
    hm.destroy(); cleanup(editor, el);
  });
});

describe('clear()', () => {
  it('empties the stack', () => {
    const { editor, el } = makeStubEditor();
    const hm = new HistoryManager(editor);
    hm.takeSnapshot();
    hm.takeSnapshot();
    hm.clear();
    expect(hm._stack.length).toBe(0);
    hm.destroy(); cleanup(editor, el);
  });

  it('resets _index to -1', () => {
    const { editor, el } = makeStubEditor();
    const hm = new HistoryManager(editor);
    hm.takeSnapshot();
    hm.clear();
    expect(hm._index).toBe(-1);
    hm.destroy(); cleanup(editor, el);
  });

  it('cancels pending idle timer', () => {
    const { editor, el } = makeStubEditor();
    const hm = new HistoryManager(editor);
    hm._idleTimer = setTimeout(() => {}, 99999);
    hm.clear();
    expect(hm._idleTimer).toBeNull();
    hm.destroy(); cleanup(editor, el);
  });
});

describe('flush pending idle snapshot before undo/redo (data-loss fix)', () => {
  it('undo before the idle timer fires reverts the typed edit, not past the baseline', () => {
    const { editor, el } = makeStubEditor('<p>base</p>');
    const hm = new HistoryManager(editor);
    hm.takeSnapshot();                          // [0] = '<p>base</p>', index 0
    // simulate typing: DOM changes + an idle snapshot is scheduled (pending)
    el.innerHTML = '<p>base typed</p>';
    hm._scheduleIdleSnapshot();
    expect(hm._idleTimer).not.toBeNull();       // snapshot pending, not yet taken
    expect(hm._stack.length).toBe(1);

    hm.undo();                                   // must flush first, then step back
    // The flush captured '<p>base typed</p>' as [1]; undo landed on [0]='<p>base</p>'.
    expect(el.innerHTML).toBe('<p>base</p>');    // typed text reverted (not lost)
    expect(hm._idleTimer).toBeNull();            // pending timer consumed

    hm.redo();                                   // redo restores the typed edit
    expect(el.innerHTML).toBe('<p>base typed</p>');
    hm.destroy(); cleanup(editor, el);
  });

  it('undo with no pending snapshot behaves normally (flush is a no-op)', () => {
    const { editor, el } = makeStubEditor('<p>one</p>');
    const hm = new HistoryManager(editor);
    hm.takeSnapshot();                 // [0] one
    el.innerHTML = '<p>two</p>';
    hm.takeSnapshot();                 // [1] two (committed, no pending timer)
    expect(hm._idleTimer).toBeNull();
    hm.undo();
    expect(el.innerHTML).toBe('<p>one</p>');
    hm.destroy(); cleanup(editor, el);
  });
});

describe('_isApplying guard prevents re-entrant snapshots', () => {
  it('takeSnapshot() is ignored while _isApplying is set', () => {
    const { editor, el } = makeStubEditor();
    const hm = new HistoryManager(editor);
    hm._isApplying = true;
    hm.takeSnapshot();
    hm.takeSnapshot();
    expect(hm._stack.length).toBe(0);
    hm._isApplying = false;
    hm.destroy(); cleanup(editor, el);
  });
});

describe('event wiring — afterCommand', () => {
  it('takes a snapshot when afterCommand fires and not batching', () => {
    const { editor, el } = makeStubEditor('<p>before</p>');
    const hm = new HistoryManager(editor);
    editor.commands._batching = false;
    editor.emit('afterCommand');
    expect(hm._stack.length).toBeGreaterThan(0);
    hm.destroy(); cleanup(editor, el);
  });

  it('skips snapshot when afterCommand fires inside a batch', () => {
    const { editor, el } = makeStubEditor('<p>before</p>');
    const hm = new HistoryManager(editor);
    editor.commands._batching = true;
    editor.emit('afterCommand');
    expect(hm._stack.length).toBe(0);
    hm.destroy(); cleanup(editor, el);
  });
});

describe('event wiring — afterBatch', () => {
  it('takes one snapshot when afterBatch fires', () => {
    const { editor, el } = makeStubEditor('<p>batched</p>');
    const hm = new HistoryManager(editor);
    editor.emit('afterBatch');
    expect(hm._stack.length).toBe(1);
    hm.destroy(); cleanup(editor, el);
  });
});

describe('destroy()', () => {
  it('nullifies internal references', () => {
    const { editor, el } = makeStubEditor();
    const hm = new HistoryManager(editor);
    hm.destroy();
    expect(hm._editor).toBeNull();
    expect(hm._stack.length).toBe(0);
    cleanup(editor, el);
  });

  it('does not throw on double destroy', () => {
    const { editor, el } = makeStubEditor();
    const hm = new HistoryManager(editor);
    hm.destroy();
    expect(() => hm.destroy()).not.toThrow();
    cleanup(editor, el);
  });

  it('cancels idle timer on destroy', () => {
    const { editor, el } = makeStubEditor();
    const hm = new HistoryManager(editor);
    hm._idleTimer = setTimeout(() => {}, 99999);
    hm.destroy();
    expect(hm._idleTimer).toBeNull();
    cleanup(editor, el);
  });
});

describe('_push() deduplication — H4', () => {
  it('does not create phantom entry when HTML is identical', () => {
    const { editor, el } = makeStubEditor('<p>same</p>');
    const hm = new HistoryManager(editor);
    hm.takeSnapshot();
    const before = hm._stack.length;
    hm.takeSnapshot();
    expect(hm._stack.length).toBe(before);
    hm.destroy(); cleanup(editor, el);
  });

  it('does push when HTML changes', () => {
    const { editor, el } = makeStubEditor('<p>a</p>');
    const hm = new HistoryManager(editor);
    hm.takeSnapshot();
    el.innerHTML = '<p>b</p>';
    hm.takeSnapshot();
    expect(hm._stack.length).toBe(2);
    hm.destroy(); cleanup(editor, el);
  });

  it('undo still works correctly after dedup skips', () => {
    const { editor, el } = makeStubEditor('<p>first</p>');
    const hm = new HistoryManager(editor);
    hm.takeSnapshot();
    hm.takeSnapshot();
    el.innerHTML = '<p>second</p>';
    hm.takeSnapshot();
    hm.undo();
    expect(el.innerHTML).toBe('<p>first</p>');
    hm.destroy(); cleanup(editor, el);
  });
});
