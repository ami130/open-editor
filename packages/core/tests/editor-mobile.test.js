/**
 * Phase 14 mobile / touch behaviours (editor-mobile.js):
 *   14.8  long-press → context menu (cancelled by a drag past tolerance)
 *   14.17 drop fires onChange (browsers skip `input` on drop)
 *   14.14 touchend schedules a change read (iOS late-input)
 *   14.7  focus scrolls the editable into view (no throw in headless)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OpenEditor } from '../src/editor.js';

let editor, target;
beforeEach(() => {
  target = document.createElement('div');
  document.body.appendChild(target);
  editor = new OpenEditor(target);
});
afterEach(() => {
  if (editor && !editor.isDestroyed()) editor.destroy();
  if (target && target.parentNode) target.remove();
  vi.useRealTimers();
});

function touch(el, type, x, y) {
  const e = new window.Event(type, { bubbles: true, cancelable: true });
  e.touches = x != null ? [{ clientX: x, clientY: y }] : [];
  el.dispatchEvent(e);
  return e;
}

describe('long-press context menu (14.8)', () => {
  it('emits contextmenu at the touch point after 500ms', () => {
    vi.useFakeTimers();
    const el = editor.getEditorElement();
    let ctx = null;
    editor.on('contextmenu', (e) => { ctx = e; });
    touch(el, 'touchstart', 50, 60);
    vi.advanceTimersByTime(500);
    expect(ctx).not.toBeNull();
    expect(ctx.clientX).toBe(50);
    expect(ctx.clientY).toBe(60);
  });

  it('dispatches a REAL contextmenu on the target so DOM listeners fire too (F4)', () => {
    vi.useFakeTimers();
    const el = editor.getEditorElement();
    el.innerHTML = '<p>hi</p>';
    const p = el.querySelector('p');
    let domFired = false; // simulates the image plugin's direct DOM listener
    p.addEventListener('contextmenu', () => { domFired = true; });
    // touchstart's target must be the <p>
    const e = new window.Event('touchstart', { bubbles: true, cancelable: true });
    e.touches = [{ clientX: 30, clientY: 40 }];
    Object.defineProperty(e, 'target', { value: p, configurable: true });
    p.dispatchEvent(e);
    vi.advanceTimersByTime(500);
    expect(domFired).toBe(true);
  });

  it('does NOT fire if the finger moves past tolerance (it is a drag/scroll)', () => {
    vi.useFakeTimers();
    const el = editor.getEditorElement();
    let ctx = null;
    editor.on('contextmenu', (e) => { ctx = e; });
    touch(el, 'touchstart', 50, 60);
    touch(el, 'touchmove', 90, 60); // 40px > 10px tolerance
    vi.advanceTimersByTime(500);
    expect(ctx).toBeNull();
  });

  it('does NOT fire if the touch ends before 500ms', () => {
    vi.useFakeTimers();
    const el = editor.getEditorElement();
    let ctx = null;
    editor.on('contextmenu', (e) => { ctx = e; });
    touch(el, 'touchstart', 10, 10);
    vi.advanceTimersByTime(300);
    touch(el, 'touchend');
    vi.advanceTimersByTime(300);
    expect(ctx).toBeNull();
  });
});

describe('drop / touchend change notification (14.17 / 14.14)', () => {
  // Make the live HTML differ from the last committed _state.html so the F11
  // content-diff gate lets the change through.
  function dirtyContent() {
    editor.getEditorElement().innerHTML = '<p>changed</p>';
  }

  it('drop fires onChange on the next tick WHEN content changed', () => {
    vi.useFakeTimers();
    let changed = false;
    const fn = () => { changed = true; }; fn.cancel = () => {};
    editor._onChangeFn = fn;
    dirtyContent();
    editor.getEditorElement().dispatchEvent(new window.Event('drop', { bubbles: true }));
    vi.advanceTimersByTime(1);
    expect(changed).toBe(true);
  });

  it('touchend fires onChange when content changed (iOS late-input guard)', () => {
    let changed = false;
    const fn = () => { changed = true; }; fn.cancel = () => {};
    editor._onChangeFn = fn;
    dirtyContent();
    touch(editor.getEditorElement(), 'touchend');
    expect(changed).toBe(true);
  });

  it('touchend on a NO-OP tap does NOT fire onChange / mark dirty (F11)', () => {
    let changed = false;
    const fn = () => { changed = true; }; fn.cancel = () => {};
    editor._onChangeFn = fn;
    // No content change: getHTML() still equals the committed _state.html.
    editor._state.html = editor.getHTML();
    touch(editor.getEditorElement(), 'touchend');
    expect(changed).toBe(false);
  });

  it('touchend during IME composition does NOT fire onChange', () => {
    let changed = false;
    const fn = () => { changed = true; }; fn.cancel = () => {};
    editor._onChangeFn = fn;
    dirtyContent();
    editor._isComposing = true;
    touch(editor.getEditorElement(), 'touchend');
    expect(changed).toBe(false);
  });
});

describe('focus scroll-into-view (14.7)', () => {
  it('does not throw when the editable is focused', () => {
    expect(() => editor.getEditorElement().dispatchEvent(
      new window.Event('focus', { bubbles: true })
    )).not.toThrow();
  });
});

describe('mobile listeners are cleaned up on destroy', () => {
  it('long-press timer does not fire after destroy', () => {
    vi.useFakeTimers();
    const el = editor.getEditorElement();
    let ctx = null;
    editor.on('contextmenu', (e) => { ctx = e; });
    touch(el, 'touchstart', 5, 5);
    editor.destroy();
    vi.advanceTimersByTime(500);
    expect(ctx).toBeNull();
  });
});
