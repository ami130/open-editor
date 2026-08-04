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

// ─── 2.6 — onChange debounced ────────────────────────────────────────────────

describe('2.6 — onChange debounced event', () => {
  let target, editor;
  beforeEach(() => {
    vi.useFakeTimers();
    target = makeTarget();
    editor = new OpenEditor(target);
  });
  afterEach(() => {
    vi.useRealTimers();
    cleanup(editor, target);
  });

  it('emits onChange after content changes (debounced)', () => {
    const fn = vi.fn();
    editor.on('onChange', fn);
    editor.getEditorElement().dispatchEvent(new Event('input'));
    expect(fn).not.toHaveBeenCalled(); // debounced — not yet
    vi.advanceTimersByTime(400);
    expect(fn).toHaveBeenCalledOnce();
  });

  it('onChange payload contains html and text', () => {
    const fn = vi.fn();
    editor.on('onChange', fn);
    editor.getEditorElement().innerHTML = '<p>Hello</p>';
    editor.getEditorElement().dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(400);
    expect(fn).toHaveBeenCalledOnce();
    const payload = fn.mock.calls[0][0];
    expect(payload).toHaveProperty('html');
    expect(payload).toHaveProperty('text');
  });

  it('multiple rapid inputs fire onChange only once', () => {
    const fn = vi.fn();
    editor.on('onChange', fn);
    editor.getEditorElement().dispatchEvent(new Event('input'));
    editor.getEditorElement().dispatchEvent(new Event('input'));
    editor.getEditorElement().dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(400);
    expect(fn).toHaveBeenCalledOnce();
  });

  it('does NOT fire onChange during setHTML()', () => {
    const fn = vi.fn();
    editor.on('onChange', fn);
    editor.setHTML('<p>content</p>');
    vi.advanceTimersByTime(400);
    expect(fn).not.toHaveBeenCalled();
  });

  it('does NOT fire onChange during IME composition', () => {
    const fn = vi.fn();
    editor.on('onChange', fn);
    editor.getEditorElement().dispatchEvent(new CompositionEvent('compositionstart'));
    editor.getEditorElement().dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(400);
    expect(fn).not.toHaveBeenCalled();
    editor.getEditorElement().dispatchEvent(new CompositionEvent('compositionend'));
  });

  it('fires onChange after IME compositionend', () => {
    const fn = vi.fn();
    editor.on('onChange', fn);
    editor.getEditorElement().dispatchEvent(new CompositionEvent('compositionstart'));
    editor.getEditorElement().dispatchEvent(new CompositionEvent('compositionend'));
    vi.advanceTimersByTime(400);
    expect(fn).toHaveBeenCalledOnce();
  });

  it('does NOT fire onChange after destroy', () => {
    const fn = vi.fn();
    editor.on('onChange', fn);
    editor.getEditorElement().dispatchEvent(new Event('input'));
    editor.destroy();
    vi.advanceTimersByTime(400);
    expect(fn).not.toHaveBeenCalled();
    target.parentNode && target.parentNode.removeChild(target);
  });

  // ─── I1: toolbar COMMANDS must fire onChange (they mutate the DOM directly,
  //         bypassing the browser `input` event) ────────────────────────────
  function selectAll(ed) {
    const p = ed.getEditorElement().querySelector('p');
    const r = document.createRange(); r.selectNodeContents(p);
    window.getSelection().removeAllRanges(); window.getSelection().addRange(r);
  }
  function caretStart(ed) {
    const p = ed.getEditorElement().querySelector('p');
    const r = document.createRange(); r.setStart(p.firstChild, 0); r.collapse(true);
    window.getSelection().removeAllRanges(); window.getSelection().addRange(r);
  }

  for (const [name, run] of [
    ['bold', (ed) => { selectAll(ed); ed.commands.execute('bold'); }],
    ['textColor', (ed) => { selectAll(ed); ed.commands.execute('textColor', 'rgb(255,0,0)'); }],
    ['fontSize', (ed) => { selectAll(ed); ed.commands.execute('fontSize', '24px'); }],
    ['alignCenter', (ed) => { caretStart(ed); ed.commands.execute('alignCenter'); }],
    ['ul', (ed) => { caretStart(ed); ed.commands.execute('ul'); }],
    ['blockquote', (ed) => { caretStart(ed); ed.commands.execute('blockquote'); }],
    ['insertPageBreak', (ed) => { caretStart(ed); ed.commands.execute('insertPageBreak'); }],
  ]) {
    it(`command "${name}" fires onChange (debounced)`, () => {
      editor.setHTML('<p>hello</p>');
      const fn = vi.fn();
      editor.on('onChange', fn);
      run(editor);
      expect(fn).not.toHaveBeenCalled();     // debounced, not yet
      vi.advanceTimersByTime(400);
      expect(fn).toHaveBeenCalled();          // I1: fires (was: never)
    });
  }

  it('command mutation marks the editor dirty', () => {
    editor.setHTML('<p>hello</p>');
    expect(editor._state.isDirty).toBe(false);
    selectAll(editor);
    editor.commands.execute('bold');
    vi.advanceTimersByTime(400);
    expect(editor._state.isDirty).toBe(true);
  });

  it('respects custom debounce interval from config', () => {
    cleanup(editor, target);
    const t2 = makeTarget();
    const e2 = new OpenEditor(t2, { onChange: { debounce: 1000 } });
    const fn = vi.fn();
    e2.on('onChange', fn);
    e2.getEditorElement().dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(500);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(600);
    expect(fn).toHaveBeenCalledOnce();
    cleanup(e2, t2);
  });

  it('onChange sets isDirty to true on _state', () => {
    editor.getEditorElement().innerHTML = '<p>text</p>';
    editor.getEditorElement().dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(400);
    expect(editor._state.isDirty).toBe(true);
  });
});

// ─── 16.A1 — config.onChange callback (name-collision fix) ────────────────────

describe('16.A1 — config.onChange accepts a callback', () => {
  let target, editor;
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); cleanup(editor, target); });

  it('calls a function passed as config.onChange with {html,text}', () => {
    const fn = vi.fn();
    target = makeTarget();
    editor = new OpenEditor(target, { onChange: fn });
    editor.getEditorElement().innerHTML = '<p>hi</p>';
    editor.getEditorElement().dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(400);
    expect(fn).toHaveBeenCalledOnce();
    const payload = fn.mock.calls[0][0];
    expect(payload).toHaveProperty('html');
    expect(payload).toHaveProperty('text');
  });

  it('calls the callback AND still emits the onChange event', () => {
    const cb = vi.fn(); const evt = vi.fn();
    target = makeTarget();
    editor = new OpenEditor(target, { onChange: cb });
    editor.on('onChange', evt);
    editor.getEditorElement().dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(400);
    expect(cb).toHaveBeenCalledOnce();
    expect(evt).toHaveBeenCalledOnce();
  });

  it('supports { handler, debounce } object form', () => {
    const cb = vi.fn();
    target = makeTarget();
    editor = new OpenEditor(target, { onChange: { handler: cb, debounce: 1000 } });
    editor.getEditorElement().dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(500);
    expect(cb).not.toHaveBeenCalled();   // custom debounce respected
    vi.advanceTimersByTime(600);
    expect(cb).toHaveBeenCalledOnce();
  });

  it('a throwing callback does not break the event or dirty state', () => {
    const evt = vi.fn();
    target = makeTarget();
    editor = new OpenEditor(target, { onChange: () => { throw new Error('boom'); } });
    editor.on('onChange', evt);
    // Make a REAL content change so isDirty is meaningfully expected to flip.
    editor.getEditorElement().innerHTML = '<p>edited</p>';
    editor.getEditorElement().dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(400);
    expect(evt).toHaveBeenCalledOnce();       // event still fired
    expect(editor._state.isDirty).toBe(true); // state still updated (content differs from baseline)
  });
});

// ─── 16.A4 — beforeChange cancelable hook (fired at beforeinput) ──────────────

describe('16.A4 — beforeChange is cancelable', () => {
  let target, editor;
  afterEach(() => cleanup(editor, target));

  function dispatchBeforeInput(el) {
    const e = new InputEvent('beforeinput', { inputType: 'insertText', data: 'x', bubbles: true, cancelable: true });
    el.dispatchEvent(e);
    return e;
  }

  it('fires beforeChange on beforeinput with inputType/data', () => {
    target = makeTarget();
    editor = new OpenEditor(target);
    const fn = vi.fn();
    editor.on('beforeChange', fn);
    dispatchBeforeInput(editor.getEditorElement());
    expect(fn).toHaveBeenCalledOnce();
    const payload = fn.mock.calls[0][0];
    expect(payload).toHaveProperty('inputType', 'insertText');
    expect(payload).toHaveProperty('data', 'x');
  });

  it('preventDefault() cancels the native input (e.defaultPrevented === true)', () => {
    target = makeTarget();
    editor = new OpenEditor(target);
    editor.on('beforeChange', (e) => e.preventDefault());
    const e = dispatchBeforeInput(editor.getEditorElement());
    expect(e.defaultPrevented).toBe(true);
  });

  it('not preventing leaves the native input untouched', () => {
    target = makeTarget();
    editor = new OpenEditor(target);
    editor.on('beforeChange', () => { /* observe only */ });
    const e = dispatchBeforeInput(editor.getEditorElement());
    expect(e.defaultPrevented).toBe(false);
  });
});

// ─── 2.13 — maxLength ────────────────────────────────────────────────────────

describe('2.13 — maxLength enforcement', () => {
  let target, editor;
  afterEach(() => cleanup(editor, target));

  it('blocks keydown input when maxLength reached', () => {
    target = makeTarget();
    editor = new OpenEditor(target, { maxLength: 5 });
    editor.getEditorElement().innerHTML = '<p>Hello</p>'; // 5 chars
    const event = new KeyboardEvent('keydown', { key: 'a', bubbles: true });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
    editor.getEditorElement().dispatchEvent(event);
    expect(preventDefaultSpy).toHaveBeenCalled();
  });

  it('emits maxLengthExceeded event with current and max', () => {
    target = makeTarget();
    editor = new OpenEditor(target, { maxLength: 3 });
    editor.getEditorElement().innerHTML = '<p>Hi!</p>'; // 3 chars
    const fn = vi.fn();
    editor.on('maxLengthExceeded', fn);
    editor.getEditorElement().dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }));
    expect(fn).toHaveBeenCalledOnce();
    const payload = fn.mock.calls[0][0];
    expect(payload.max).toBe(3);
    expect(typeof payload.current).toBe('number');
  });

  it('allows Backspace even when maxLength reached', () => {
    target = makeTarget();
    editor = new OpenEditor(target, { maxLength: 3 });
    editor.getEditorElement().innerHTML = '<p>Hi!</p>';
    const event = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
    editor.getEditorElement().dispatchEvent(event);
    expect(preventDefaultSpy).not.toHaveBeenCalled();
  });

  it('allows Delete even when maxLength reached', () => {
    target = makeTarget();
    editor = new OpenEditor(target, { maxLength: 3 });
    editor.getEditorElement().innerHTML = '<p>Hi!</p>';
    const event = new KeyboardEvent('keydown', { key: 'Delete', bubbles: true });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
    editor.getEditorElement().dispatchEvent(event);
    expect(preventDefaultSpy).not.toHaveBeenCalled();
  });

  it('allows keyboard shortcuts (ctrl+key) even when maxLength reached', () => {
    target = makeTarget();
    editor = new OpenEditor(target, { maxLength: 3 });
    editor.getEditorElement().innerHTML = '<p>Hi!</p>';
    const event = new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
    editor.getEditorElement().dispatchEvent(event);
    expect(preventDefaultSpy).not.toHaveBeenCalled();
  });

  it('does not block input below maxLength', () => {
    target = makeTarget();
    editor = new OpenEditor(target, { maxLength: 10 });
    editor.getEditorElement().innerHTML = '<p>Hi</p>'; // 2 chars
    const event = new KeyboardEvent('keydown', { key: 'a', bubbles: true });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
    editor.getEditorElement().dispatchEvent(event);
    expect(preventDefaultSpy).not.toHaveBeenCalled();
  });
});

// ─── Dirty tracking reflects a saved baseline (not "any change fired") ────────
describe('isDirty() / markClean() — baseline-based dirty tracking', () => {
  let target, editor;
  beforeEach(() => { vi.useFakeTimers(); target = makeTarget(); editor = new OpenEditor(target); editor.setHTML('<p>hello</p>'); });
  afterEach(() => { vi.useRealTimers(); cleanup(editor, target); });

  function selAll() {
    const p = editor.getEditorElement().querySelector('p');
    const r = document.createRange(); r.selectNodeContents(p);
    window.getSelection().removeAllRanges(); window.getSelection().addRange(r);
  }

  it('fresh editor is not dirty', () => {
    expect(editor.isDirty()).toBe(false);
  });

  it('a real edit becomes dirty; undo back to original becomes CLEAN again', () => {
    selAll(); editor.commands.execute('bold');
    vi.advanceTimersByTime(400);
    expect(editor.isDirty()).toBe(true);         // content diverged
    expect(editor._state.isDirty).toBe(true);
    editor.commands.execute('undo');
    vi.advanceTimersByTime(400);
    expect(editor.getHTML()).toBe('<p>hello</p>');
    expect(editor.isDirty()).toBe(false);        // back to baseline → clean (was: wrongly dirty)
    expect(editor._state.isDirty).toBe(false);
  });

  it('markClean() adopts current content as the new baseline', () => {
    selAll(); editor.commands.execute('bold');
    vi.advanceTimersByTime(400);
    expect(editor.isDirty()).toBe(true);
    editor.markClean();
    expect(editor.isDirty()).toBe(false);        // current content is now "saved"
    // undoing away from the new baseline is dirty again
    editor.commands.execute('undo');
    vi.advanceTimersByTime(400);
    expect(editor.isDirty()).toBe(true);
  });

  it('setHTML resets the baseline (loaded content is clean)', () => {
    selAll(); editor.commands.execute('bold');
    vi.advanceTimersByTime(400);
    expect(editor.isDirty()).toBe(true);
    editor.setHTML('<p>fresh doc</p>');
    expect(editor.isDirty()).toBe(false);
  });

  it('isDirty() is accurate immediately (before the debounce flushes)', () => {
    editor.getEditorElement().innerHTML = '<p>typed</p>';   // direct mutation, no debounce yet
    expect(editor.isDirty()).toBe(true);                    // computed from current DOM
  });
});
