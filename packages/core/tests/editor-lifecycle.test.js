import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenEditor } from '../src/editor.js';

// jsdom provides document — set up a fresh mount target for every test
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

// ─── 1.2 Mount ───────────────────────────────────────────────────────────────

// ─── 1.20 ShortcutManager integration ────────────────────────────────────────

describe('1.20 — ShortcutManager on editor instance', () => {
  let target, editor;
  beforeEach(() => { target = makeTarget(); editor = new OpenEditor(target); });
  afterEach(() => cleanup(editor, target));

  it('editor.shortcuts is a ShortcutManager', () => {
    expect(typeof editor.shortcuts.register).toBe('function');
    expect(typeof editor.shortcuts.match).toBe('function');
  });

  it('registered shortcut fires shortcut event on keydown', () => {
    const fn = vi.fn();
    editor.shortcuts.register('ctrl+b', 'bold', 'Bold');
    editor.on('shortcut', fn);
    editor.getEditorElement().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true })
    );
    expect(fn).toHaveBeenCalledOnce();
    expect(fn.mock.calls[0][0].command).toBe('bold');
  });

  it('shortcut does not fire during IME composition', () => {
    const fn = vi.fn();
    editor.shortcuts.register('ctrl+b', 'bold');
    editor.on('shortcut', fn);
    editor.getEditorElement().dispatchEvent(new CompositionEvent('compositionstart'));
    editor.getEditorElement().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true })
    );
    expect(fn).not.toHaveBeenCalled();
    editor.getEditorElement().dispatchEvent(new CompositionEvent('compositionend'));
  });

  // 4.13 — strikethrough must work on Mac (meta) as well as Windows/Linux (ctrl).
  // Keys are normalized (modifier order ctrl,alt,shift,meta) so match by command
  // + the presence of both a ctrl-based and a meta-based binding.
  it('strikethrough is bound for BOTH ctrl and meta (Mac + Win/Linux)', () => {
    const all = editor.shortcuts.getAll();
    const strike = Array.from(all.values()).filter((s) => s.command === 'strikethrough');
    expect(strike.some((s) => s.keys.includes('ctrl') && s.keys.includes('shift'))).toBe(true);
    expect(strike.some((s) => s.keys.includes('meta') && s.keys.includes('shift'))).toBe(true);
  });

  it('meta+shift+x fires the strikethrough command (Mac)', () => {
    const fn = vi.fn();
    editor.on('shortcut', fn);
    editor.getEditorElement().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'x', metaKey: true, shiftKey: true, bubbles: true })
    );
    expect(fn).toHaveBeenCalled();
    expect(fn.mock.calls.some((c) => c[0].command === 'strikethrough')).toBe(true);
  });
});

// ─── 1.21 Logger integration ─────────────────────────────────────────────────

describe('1.21 — Logger on editor instance', () => {
  let target, editor;
  afterEach(() => cleanup(editor, target));

  it('editor.logger is a Logger instance', () => {
    target = makeTarget();
    editor = new OpenEditor(target);
    expect(typeof editor.logger.info).toBe('function');
    expect(typeof editor.logger.warn).toBe('function');
    expect(typeof editor.logger.error).toBe('function');
  });

  it('debug:true makes logger active', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    target = makeTarget();
    editor = new OpenEditor(target, { debug: true });
    expect(infoSpy).toHaveBeenCalled();
    infoSpy.mockRestore();
  });

  it('config.logger replaces internal console calls', () => {
    const custom = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    target = makeTarget();
    editor = new OpenEditor(target, { debug: true, logger: custom });
    expect(custom.info).toHaveBeenCalled();
  });

  // 1.10 — debug logs commands AND state changes, not just DOM events.
  it('debug logs command executions', () => {
    const custom = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    target = makeTarget();
    editor = new OpenEditor(target, { debug: true, logger: custom });
    custom.info.mockClear();
    editor.commands.execute('selectAll');
    expect(custom.info.mock.calls.some((c) => c[0] === 'command:' && c[1] === 'selectAll')).toBe(true);
    window.getSelection().removeAllRanges();
  });

  it('debug logs state (metadata) changes', () => {
    const custom = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    target = makeTarget();
    editor = new OpenEditor(target, { debug: true, logger: custom });
    custom.info.mockClear();
    editor.state.setMeta('author', 'Ada');
    expect(custom.info.mock.calls.some((c) => c[0] === 'stateChange:' && c[1] === 'author')).toBe(true);
  });
});

// ─── 1.23 beforeinput event ──────────────────────────────────────────────────

describe('1.23 — beforeinput event', () => {
  let target, editor;
  beforeEach(() => { target = makeTarget(); editor = new OpenEditor(target); });
  afterEach(() => cleanup(editor, target));

  it('emits beforeinput event', () => {
    const fn = vi.fn();
    editor.on('beforeinput', fn);
    editor.getEditorElement().dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText' }));
    expect(fn).toHaveBeenCalledOnce();
  });
});

// ─── 1.24 Destroy cleanup ────────────────────────────────────────────────────

describe('1.24 — destroy cleanup', () => {
  let target, editor;
  beforeEach(() => { target = makeTarget(); editor = new OpenEditor(target); });

  it('removes wrapper from DOM', () => {
    expect(target.querySelector('.oe-wrapper')).not.toBeNull();
    editor.destroy();
    expect(target.querySelector('.oe-wrapper')).toBeNull();
    target.parentNode && target.parentNode.removeChild(target);
  });

  it('nullifies _editorEl reference', () => {
    editor.destroy();
    expect(editor._editorEl).toBeNull();
    target.parentNode && target.parentNode.removeChild(target);
  });

  it('isDestroyed() returns true after destroy', () => {
    editor.destroy();
    expect(editor.isDestroyed()).toBe(true);
    target.parentNode && target.parentNode.removeChild(target);
  });

  it('event listeners are removed (no emit after destroy)', () => {
    const fn = vi.fn();
    editor.on('focus', fn);
    const el = editor.getEditorElement();
    editor.destroy();
    // After destroy, editorEl is gone but we still have a ref to it
    el.dispatchEvent(new Event('focus'));
    // Handler should NOT fire because listeners were removed
    expect(fn).not.toHaveBeenCalled();
    target.parentNode && target.parentNode.removeChild(target);
  });

  it('cancels pending timers on destroy — _timers is nullified', () => {
    const el = editor.getEditorElement();
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    editor.destroy();
    expect(editor._timers).toBeNull();
    target.parentNode && target.parentNode.removeChild(target);
  });

  it('shortcuts and logger are nullified on destroy', () => {
    editor.destroy();
    expect(editor.shortcuts).toBeNull();
    expect(editor.logger).toBeNull();
    target.parentNode && target.parentNode.removeChild(target);
  });

  it('_boundHandlers is nullified on destroy', () => {
    editor.destroy();
    expect(editor._boundHandlers).toBeNull();
    target.parentNode && target.parentNode.removeChild(target);
  });
});

// ─── 1.25 MutationObserver ───────────────────────────────────────────────────

describe('1.25 — MutationObserver', () => {
  let target, editor;
  beforeEach(() => { target = makeTarget(); editor = new OpenEditor(target); });
  afterEach(() => cleanup(editor, target));

  it('sets up a MutationObserver on init', () => {
    expect(editor._mutationObserver).not.toBeNull();
  });

  it('disconnects MutationObserver on destroy', () => {
    editor.destroy();
    expect(editor._mutationObserver).toBeNull();
    target.parentNode && target.parentNode.removeChild(target);
  });
});

// ─── getVersion ──────────────────────────────────────────────────────────────

describe('getVersion()', () => {
  let target, editor;
  beforeEach(() => { target = makeTarget(); editor = new OpenEditor(target); });
  afterEach(() => cleanup(editor, target));

  it('returns semver string', () => {
    // semver incl. optional prerelease/build (e.g. 1.0.0-rc.1)
    expect(editor.getVersion()).toMatch(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/);
  });
});
