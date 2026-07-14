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

// ─── 2.29 — Public keydown/keyup events ──────────────────────────────────────

describe('2.29 — editor.on("keydown") and editor.on("keyup") in public event system', () => {
  let target, editor;
  beforeEach(() => { target = makeTarget(); editor = new OpenEditor(target); });
  afterEach(() => cleanup(editor, target));

  it('external listener receives keydown event', () => {
    const fn = vi.fn();
    editor.on('keydown', fn);
    editor.getEditorElement().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'a', bubbles: true })
    );
    expect(fn).toHaveBeenCalledOnce();
  });

  it('external listener receives the original KeyboardEvent', () => {
    const fn = vi.fn();
    editor.on('keydown', fn);
    editor.getEditorElement().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
    );
    const event = fn.mock.calls[0][0];
    expect(event instanceof KeyboardEvent).toBe(true);
    expect(event.key).toBe('Enter');
  });

  it('external listener receives keyup event', () => {
    const fn = vi.fn();
    editor.on('keyup', fn);
    editor.getEditorElement().dispatchEvent(
      new KeyboardEvent('keyup', { key: 'a', bubbles: true })
    );
    expect(fn).toHaveBeenCalledOnce();
  });

  it('external listener receives KeyboardEvent on keyup', () => {
    const fn = vi.fn();
    editor.on('keyup', fn);
    editor.getEditorElement().dispatchEvent(
      new KeyboardEvent('keyup', { key: 'Escape', bubbles: true })
    );
    const event = fn.mock.calls[0][0];
    expect(event instanceof KeyboardEvent).toBe(true);
    expect(event.key).toBe('Escape');
  });

  it('multiple keydown listeners all receive the event', () => {
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    editor.on('keydown', fn1);
    editor.on('keydown', fn2);
    editor.getEditorElement().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'x', bubbles: true })
    );
    expect(fn1).toHaveBeenCalledOnce();
    expect(fn2).toHaveBeenCalledOnce();
  });

  it('keydown listener removed via off() stops receiving events', () => {
    const fn = vi.fn();
    editor.on('keydown', fn);
    editor.off('keydown', fn);
    editor.getEditorElement().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'a', bubbles: true })
    );
    expect(fn).not.toHaveBeenCalled();
  });

  it('keydown fires before IME composition events suppress shortcuts', () => {
    const keydownFn = vi.fn();
    editor.on('keydown', keydownFn);
    // Start composition
    editor.getEditorElement().dispatchEvent(new CompositionEvent('compositionstart'));
    // keydown still fires even during composition
    editor.getEditorElement().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'a', bubbles: true })
    );
    expect(keydownFn).toHaveBeenCalledOnce();
    editor.getEditorElement().dispatchEvent(new CompositionEvent('compositionend'));
  });

  it('_state.isFocused is true after focus event', () => {
    editor.getEditorElement().dispatchEvent(new Event('focus'));
    expect(editor._state.isFocused).toBe(true);
  });

  it('_state.isFocused is false after blur event', () => {
    editor.getEditorElement().dispatchEvent(new Event('focus'));
    editor.getEditorElement().dispatchEvent(new Event('blur'));
    expect(editor._state.isFocused).toBe(false);
  });
});
