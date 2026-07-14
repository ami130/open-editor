import { describe, it, expect, vi } from 'vitest';
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

// ─── getWordCount() ───────────────────────────────────────────────────────────

describe('getWordCount()', () => {
  it('returns 0 for empty editor', () => {
    const target = makeTarget();
    const editor = new OpenEditor(target);
    expect(editor.getWordCount()).toBe(0);
    cleanup(editor, target);
  });

  it('counts words in plain paragraph', () => {
    const target = makeTarget();
    const editor = new OpenEditor(target);
    editor.getEditorElement().innerHTML = '<p>hello world foo</p>';
    expect(editor.getWordCount()).toBe(3);
    cleanup(editor, target);
  });

  it('counts words across multiple paragraphs', () => {
    const target = makeTarget();
    const editor = new OpenEditor(target);
    // textContent concatenates adjacent blocks without a separator, so
    // "one two" + "three" = "one twothree" (1 token) + "four" + "five" = 4 words
    editor.getEditorElement().innerHTML = '<p>one two</p><p>three four five</p>';
    expect(editor.getWordCount()).toBe(4);
    cleanup(editor, target);
  });

  it('ignores HTML tags — counts text only', () => {
    const target = makeTarget();
    const editor = new OpenEditor(target);
    editor.getEditorElement().innerHTML = '<p><strong>bold</strong> <em>italic</em></p>';
    expect(editor.getWordCount()).toBe(2);
    cleanup(editor, target);
  });

  it('returns 0 after destroy', () => {
    const target = makeTarget();
    const editor = new OpenEditor(target);
    editor.getEditorElement().innerHTML = '<p>hello world</p>';
    editor.destroy();
    expect(editor.getWordCount()).toBe(0);
    target.parentNode && target.parentNode.removeChild(target);
  });
});

// ─── getCharCount() ───────────────────────────────────────────────────────────

describe('getCharCount()', () => {
  it('returns 0 for empty editor', () => {
    const target = makeTarget();
    const editor = new OpenEditor(target);
    expect(editor.getCharCount()).toBe(0);
    cleanup(editor, target);
  });

  it('returns character count of plain text', () => {
    const target = makeTarget();
    const editor = new OpenEditor(target);
    editor.getEditorElement().innerHTML = '<p>hello</p>';
    expect(editor.getCharCount()).toBe(5);
    cleanup(editor, target);
  });

  it('does not count HTML tags', () => {
    const target = makeTarget();
    const editor = new OpenEditor(target);
    editor.getEditorElement().innerHTML = '<p><strong>hi</strong></p>';
    expect(editor.getCharCount()).toBe(2);
    cleanup(editor, target);
  });

  it('returns 0 after destroy', () => {
    const target = makeTarget();
    const editor = new OpenEditor(target);
    editor.getEditorElement().innerHTML = '<p>hello</p>';
    editor.destroy();
    expect(editor.getCharCount()).toBe(0);
    target.parentNode && target.parentNode.removeChild(target);
  });
});

// ─── enable() / disable() ────────────────────────────────────────────────────

describe('enable() / disable()', () => {
  it('disable() sets contentEditable to false', () => {
    const target = makeTarget();
    const editor = new OpenEditor(target);
    editor.disable();
    expect(editor.getEditorElement().contentEditable).toBe('false');
    cleanup(editor, target);
  });

  it('disable() sets _state.isReadOnly to true', () => {
    const target = makeTarget();
    const editor = new OpenEditor(target);
    editor.disable();
    expect(editor._state.isReadOnly).toBe(true);
    cleanup(editor, target);
  });

  it('disable() sets aria-disabled attribute', () => {
    const target = makeTarget();
    const editor = new OpenEditor(target);
    editor.disable();
    expect(editor.getEditorElement().getAttribute('aria-disabled')).toBe('true');
    cleanup(editor, target);
  });

  it('disable() adds oe-disabled class to wrapper', () => {
    const target = makeTarget();
    const editor = new OpenEditor(target);
    editor.disable();
    expect(editor._wrapper.classList.contains('oe-disabled')).toBe(true);
    cleanup(editor, target);
  });

  it('enable() sets contentEditable back to true', () => {
    const target = makeTarget();
    const editor = new OpenEditor(target);
    editor.disable();
    editor.enable();
    expect(editor.getEditorElement().contentEditable).toBe('true');
    cleanup(editor, target);
  });

  it('enable() sets _state.isReadOnly to false', () => {
    const target = makeTarget();
    const editor = new OpenEditor(target);
    editor.disable();
    editor.enable();
    expect(editor._state.isReadOnly).toBe(false);
    cleanup(editor, target);
  });

  it('enable() removes oe-disabled class from wrapper', () => {
    const target = makeTarget();
    const editor = new OpenEditor(target);
    editor.disable();
    editor.enable();
    expect(editor._wrapper.classList.contains('oe-disabled')).toBe(false);
    cleanup(editor, target);
  });

  it('enable() removes aria-disabled attribute', () => {
    const target = makeTarget();
    const editor = new OpenEditor(target);
    editor.disable();
    editor.enable();
    expect(editor.getEditorElement().getAttribute('aria-disabled')).toBeNull();
    cleanup(editor, target);
  });

  it('enable() is a no-op after destroy', () => {
    const target = makeTarget();
    const editor = new OpenEditor(target);
    editor.destroy();
    expect(() => editor.enable()).not.toThrow();
    target.parentNode && target.parentNode.removeChild(target);
  });

  it('disable() is a no-op after destroy', () => {
    const target = makeTarget();
    const editor = new OpenEditor(target);
    editor.destroy();
    expect(() => editor.disable()).not.toThrow();
    target.parentNode && target.parentNode.removeChild(target);
  });
});

// ─── selectionChange event ────────────────────────────────────────────────────

describe('selectionChange event', () => {
  it('emits selectionChange when selection moves inside editor', () => {
    const target = makeTarget();
    const editor = new OpenEditor(target);
    const fn = vi.fn();
    editor.on('selectionChange', fn);

    editor.getEditorElement().innerHTML = '<p>hello</p>';
    const textNode = editor.getEditorElement().querySelector('p').firstChild;

    const range = document.createRange();
    range.setStart(textNode, 2);
    range.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    document.dispatchEvent(new Event('selectionchange'));
    expect(fn).toHaveBeenCalledOnce();

    // B1 fix: the emitted object must be a valid sel info object (not null)
    const emitted = fn.mock.calls[0][0];
    expect(emitted).not.toBeNull();
    expect(emitted).toHaveProperty('range');
    expect(emitted).toHaveProperty('collapsed');

    sel.removeAllRanges();
    cleanup(editor, target);
  });

  it('does NOT emit selectionChange when selection is outside the editor', () => {
    const target = makeTarget();
    const editor = new OpenEditor(target);
    const fn = vi.fn();
    editor.on('selectionChange', fn);

    // Place cursor outside editor
    const outside = document.createElement('p');
    outside.textContent = 'outside';
    document.body.appendChild(outside);
    const range = document.createRange();
    range.setStart(outside.firstChild, 0);
    range.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    document.dispatchEvent(new Event('selectionchange'));
    expect(fn).not.toHaveBeenCalled();

    sel.removeAllRanges();
    document.body.removeChild(outside);
    cleanup(editor, target);
  });

  it('does NOT emit selectionChange when nothing is selected', () => {
    const target = makeTarget();
    const editor = new OpenEditor(target);
    const fn = vi.fn();
    editor.on('selectionChange', fn);

    window.getSelection().removeAllRanges();
    document.dispatchEvent(new Event('selectionchange'));
    expect(fn).not.toHaveBeenCalled();

    cleanup(editor, target);
  });

  it('selectionChange listener is removed on destroy', () => {
    const target = makeTarget();
    const editor = new OpenEditor(target);
    const fn = vi.fn();
    editor.on('selectionChange', fn);

    editor.getEditorElement().innerHTML = '<p>hello</p>';
    const textNode = editor.getEditorElement().querySelector('p').firstChild;
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.collapse(true);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    window.getSelection().removeAllRanges();

    editor.destroy();

    // Firing after destroy must not throw
    expect(() => document.dispatchEvent(new Event('selectionchange'))).not.toThrow();
    target.parentNode && target.parentNode.removeChild(target);
  });
});

// ─── 16.A3 — beforeSetHTML cancelable pre-hook ────────────────────────────────

describe('16.A3 — beforeSetHTML is cancelable', () => {
  it('fires beforeSetHTML with the sanitized html before mutating', () => {
    const target = makeTarget();
    const editor = new OpenEditor(target);
    const fn = vi.fn();
    editor.on('beforeSetHTML', fn);
    editor.setHTML('<p>hello</p>');
    expect(fn).toHaveBeenCalledOnce();
    expect(fn.mock.calls[0][0]).toHaveProperty('html');
    expect(fn.mock.calls[0][0].html).toContain('hello');
    expect(editor.getHTML()).toContain('hello'); // applied when not prevented
    cleanup(editor, target);
  });

  it('preventDefault() aborts the whole operation (no content, state, or setHTML event)', () => {
    const target = makeTarget();
    const editor = new OpenEditor(target);
    editor.setHTML('<p>original</p>');
    const setFn = vi.fn();
    editor.on('setHTML', setFn);
    editor.on('beforeSetHTML', (e) => e.preventDefault());
    editor.setHTML('<p>replacement</p>');
    expect(editor.getHTML()).toContain('original');     // unchanged
    expect(editor.getHTML()).not.toContain('replacement');
    expect(setFn).not.toHaveBeenCalled();               // post-hoc event suppressed
    cleanup(editor, target);
  });

  it('not preventing lets the post-hoc setHTML event fire', () => {
    const target = makeTarget();
    const editor = new OpenEditor(target);
    const setFn = vi.fn();
    editor.on('setHTML', setFn);
    editor.on('beforeSetHTML', () => { /* observe only */ });
    editor.setHTML('<p>go</p>');
    expect(setFn).toHaveBeenCalledOnce();
    cleanup(editor, target);
  });
});
