import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenEditor } from '../src/editor.js';

function makeTarget() {
  const el = document.createElement('div');
  el.id = 'editor-' + Math.random().toString(36).slice(2);
  document.body.appendChild(el);
  return el;
}

function cleanup(editor, target) {
  if (editor && !editor.isDestroyed()) editor.destroy();
  if (target && target.parentNode) target.parentNode.removeChild(target);
}

// ─── 2.14 — Autosave ─────────────────────────────────────────────────────────

describe('2.14 — autosave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it('saves HTML to localStorage at configured interval', () => {
    const target = makeTarget();
    const editor = new OpenEditor(target, {
      autosave: { storage: 'localStorage', interval: 5000, key: 'oe-test' },
    });
    editor.getEditorElement().innerHTML = '<p>draft content</p>';
    vi.advanceTimersByTime(5100);
    expect(localStorage.getItem('oe-test')).toBeTruthy();
    cleanup(editor, target);
  });

  it('emits autosaveSaved event after content changes', () => {
    const target = makeTarget();
    const editor = new OpenEditor(target, {
      autosave: { storage: 'localStorage', interval: 2000, key: 'oe-test2' },
    });
    const fn = vi.fn();
    editor.on('autosaveSaved', fn);
    editor.getEditorElement().innerHTML = '<p>changed</p>';
    vi.advanceTimersByTime(2100);
    expect(fn).toHaveBeenCalledOnce();
    const payload = fn.mock.calls[0][0];
    expect(payload.key).toBe('oe-test2');
    cleanup(editor, target);
  });

  it('does NOT emit autosaveSaved when content is unchanged (H-12)', () => {
    const target = makeTarget();
    const editor = new OpenEditor(target, {
      autosave: { storage: 'localStorage', interval: 2000, key: 'oe-idle' },
    });
    const fn = vi.fn();
    editor.on('autosaveSaved', fn);
    // No content change — two intervals should produce zero saves.
    vi.advanceTimersByTime(4100);
    expect(fn).not.toHaveBeenCalled();
    cleanup(editor, target);
  });

  it('saves again only after a further change (H-12)', () => {
    const target = makeTarget();
    const editor = new OpenEditor(target, {
      autosave: { storage: 'localStorage', interval: 1000, key: 'oe-change2' },
    });
    const fn = vi.fn();
    editor.on('autosaveSaved', fn);
    editor.getEditorElement().innerHTML = '<p>one</p>';
    vi.advanceTimersByTime(1100);
    expect(fn).toHaveBeenCalledTimes(1);
    // Idle tick — no new save.
    vi.advanceTimersByTime(1100);
    expect(fn).toHaveBeenCalledTimes(1);
    // Change again — one more save.
    editor.getEditorElement().innerHTML = '<p>two</p>';
    vi.advanceTimersByTime(1100);
    expect(fn).toHaveBeenCalledTimes(2);
    cleanup(editor, target);
  });

  it('emits autosaveDraftSkipped when a draft exists but defaultContent is set (H-13)', () => {
    localStorage.setItem('oe-skip', '<p>unsaved work</p>');
    const target = makeTarget();
    const emitSpy = vi.spyOn(OpenEditor.prototype, 'emit');
    const editor = new OpenEditor(target, {
      defaultContent: '<p>fresh</p>',
      autosave: { storage: 'localStorage', interval: 30000, key: 'oe-skip' },
    });
    const skipped = emitSpy.mock.calls.filter((c) => c[0] === 'autosaveDraftSkipped');
    expect(skipped.length).toBe(1);
    expect(skipped[0][1]).toMatchObject({ key: 'oe-skip', html: '<p>unsaved work</p>' });
    emitSpy.mockRestore();
    cleanup(editor, target);
  });

  it('restores draft from localStorage on init when no defaultContent', () => {
    localStorage.setItem('oe-restore-test', '<p>restored draft</p>');
    const target = makeTarget();
    const editor = new OpenEditor(target, {
      autosave: { storage: 'localStorage', interval: 30000, key: 'oe-restore-test' },
    });
    expect(editor.getEditorElement().innerHTML).toContain('restored draft');
    cleanup(editor, target);
  });

  it('emits autosaveRestored event when restoring draft', () => {
    localStorage.setItem('oe-restore-event', '<p>draft</p>');
    const target = makeTarget();

    // The event fires during construction before any external on() call can register.
    // Spy on EventEmitter.prototype.emit BEFORE constructing so we catch it.
    const emitSpy = vi.spyOn(OpenEditor.prototype, 'emit');

    const editor = new OpenEditor(target, {
      autosave: { storage: 'localStorage', interval: 30000, key: 'oe-restore-event' },
    });

    const restoredCalls = emitSpy.mock.calls.filter((c) => c[0] === 'autosaveRestored');
    expect(restoredCalls.length).toBe(1);
    expect(restoredCalls[0][1]).toMatchObject({ key: 'oe-restore-event' });

    emitSpy.mockRestore();
    cleanup(editor, target);
  });

  it('does NOT restore draft when defaultContent is set', () => {
    localStorage.setItem('oe-no-restore', '<p>old draft</p>');
    const target = makeTarget();
    const editor = new OpenEditor(target, {
      defaultContent: '<p>fresh content</p>',
      autosave: { storage: 'localStorage', interval: 30000, key: 'oe-no-restore' },
    });
    expect(editor.getEditorElement().innerHTML).toContain('fresh content');
    expect(editor.getEditorElement().innerHTML).not.toContain('old draft');
    cleanup(editor, target);
  });

  it('cancels autosave interval on destroy', () => {
    const target = makeTarget();
    const editor = new OpenEditor(target, {
      autosave: { storage: 'localStorage', interval: 1000, key: 'oe-cancel' },
    });
    editor.destroy();
    expect(editor._autosaveIntervalId).toBeNull();
    vi.advanceTimersByTime(5000); // should not throw
    target.parentNode && target.parentNode.removeChild(target);
  });

  it('does not autosave after destroy', () => {
    const target = makeTarget();
    const editor = new OpenEditor(target, {
      autosave: { storage: 'localStorage', interval: 1000, key: 'oe-after-destroy' },
    });
    editor.destroy();
    localStorage.removeItem('oe-after-destroy');
    vi.advanceTimersByTime(5000);
    // Interval was cleared — localStorage should NOT have been written
    expect(localStorage.getItem('oe-after-destroy')).toBeNull();
    target.parentNode && target.parentNode.removeChild(target);
  });

  it('clears draft from localStorage on setHTML()', () => {
    localStorage.setItem('oe-clear-test', '<p>old draft</p>');
    const target = makeTarget();
    const editor = new OpenEditor(target, {
      autosave: { storage: 'localStorage', interval: 30000, key: 'oe-clear-test' },
    });
    editor.setHTML('<p>new content</p>');
    expect(localStorage.getItem('oe-clear-test')).toBeNull();
    cleanup(editor, target);
  });
});

// ─── 16.5.4 — crash recovery: timestamped draft + reset() ─────────────────────

describe('16.5.4 — autosave timestamp', () => {
  beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); });
  afterEach(() => { vi.useRealTimers(); localStorage.clear(); });

  it('writes a companion <key>:ts and includes savedAt in autosaveSaved', () => {
    const target = makeTarget();
    const editor = new OpenEditor(target, {
      autosave: { storage: 'localStorage', interval: 5000, key: 'oe-ts' },
    });
    const fn = vi.fn();
    editor.on('autosaveSaved', fn);
    editor.getEditorElement().innerHTML = '<p>draft body</p>';
    vi.advanceTimersByTime(5000);
    expect(fn).toHaveBeenCalled();
    expect(typeof fn.mock.calls[0][0].savedAt).toBe('number');
    expect(localStorage.getItem('oe-ts:ts')).not.toBeNull();
    cleanup(editor, target);
  });

  it('_readAutosaveTimestamp reads the companion timestamp (newer-than check enabled)', () => {
    localStorage.setItem('oe-r', '<p>saved draft</p>');
    localStorage.setItem('oe-r:ts', '1700000000000');
    const target = makeTarget();
    const editor = new OpenEditor(target, { autosave: { storage: 'localStorage', key: 'oe-r' } });
    expect(editor._readAutosaveTimestamp('oe-r')).toBe(1700000000000);
    cleanup(editor, target);
  });

  it('legacy draft with no timestamp → savedAt is null (backward compatible)', () => {
    localStorage.setItem('oe-legacy', '<p>old draft</p>'); // no :ts companion
    const target = makeTarget();
    const editor = new OpenEditor(target);
    expect(editor._readAutosaveTimestamp('oe-legacy')).toBeNull();
    cleanup(editor, target);
  });
});

describe('16.5.4 — reset() crash recovery', () => {
  it('restores the last clean snapshot and emits reset', () => {
    const target = makeTarget();
    const editor = new OpenEditor(target);
    editor.setHTML('<p>clean baseline</p>'); // sets _state.html
    editor.getEditorElement().innerHTML = '<p>garbled@@@</p>'; // corrupt live edit
    const fn = vi.fn();
    editor.on('reset', fn);
    const ok = editor.reset();
    expect(ok).toBe(true);
    expect(editor.getHTML()).toContain('clean baseline');
    expect(editor.getHTML()).not.toContain('garbled');
    expect(fn).toHaveBeenCalledOnce();
    cleanup(editor, target);
  });

  it('reset() on a fresh editor is safe (empty baseline)', () => {
    const target = makeTarget();
    const editor = new OpenEditor(target);
    expect(() => editor.reset()).not.toThrow();
    expect(editor.isEmpty()).toBe(true);
    cleanup(editor, target);
  });

  it('reset() after destroy returns false and does not throw', () => {
    const target = makeTarget();
    const editor = new OpenEditor(target);
    editor.destroy();
    expect(editor.reset()).toBe(false);
    target.parentNode && target.parentNode.removeChild(target);
  });
});
