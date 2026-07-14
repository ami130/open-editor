/**
 * readonly-ime.test.js — H1 fix: a readonly editor must not lose content when
 * an IME composition commits. Previously the composition-end handler restored
 * `_state.html` (the sanitized getHTML() output, '' for a readonly editor made
 * with defaultContent), which wiped the content. Now it restores the exact
 * pre-composition DOM captured at compositionstart.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { OpenEditor } from '../src/editor.js';

let editor, target;
beforeEach(() => {
  target = document.createElement('div');
  document.body.appendChild(target);
});
afterEach(() => {
  if (editor && !editor.isDestroyed()) editor.destroy();
  if (target && target.parentNode) target.remove();
  editor = null;
});

describe('readonly + IME composition', () => {
  it('does NOT wipe content on composition-end for a readonly editor with defaultContent', () => {
    editor = new OpenEditor(target, {
      readonly: true, defaultContent: '<p>keep me</p>',
      toolbar: false, statusBar: false, inlineToolbar: false, blockquoteToolbar: false,
    });
    const el = editor.getEditorElement();
    expect(el.textContent).toContain('keep me');

    // Simulate an IME composition: start, then the browser injects committed
    // text into the DOM, then compositionend.
    el.dispatchEvent(new CompositionEvent('compositionstart'));
    el.querySelector('p').textContent = 'keep meが';           // IME committed text
    el.dispatchEvent(new CompositionEvent('compositionend'));

    // The IME text must be reverted (readonly) but the ORIGINAL content kept.
    expect(el.textContent).toBe('keep me');
    expect(el.querySelector('p')).not.toBeNull();
  });

  it('reverts the IME text but preserves multi-block content', () => {
    editor = new OpenEditor(target, {
      readonly: true, defaultContent: '<p>one</p><p>two</p>',
      toolbar: false, statusBar: false, inlineToolbar: false, blockquoteToolbar: false,
    });
    const el = editor.getEditorElement();
    el.dispatchEvent(new CompositionEvent('compositionstart'));
    el.appendChild(document.createTextNode('junk'));
    el.dispatchEvent(new CompositionEvent('compositionend'));
    expect(el.querySelectorAll('p').length).toBe(2);
    expect(el.textContent).toBe('onetwo');
  });
});

// Audit HIGH#1 regression: readonly must block the PROGRAMMATIC keydown
// mutation paths (block-editing + plugin onKeyDown), while non-mutating keys
// and readonly-exempt shortcuts (undo/redo/selectAll) still route.
describe('readonly + keydown mutation guard', () => {
  function mk(html) {
    editor = new OpenEditor(target, {
      defaultContent: html,
      toolbar: false, statusBar: false, inlineToolbar: false, blockquoteToolbar: false,
    });
    return editor;
  }
  function caret(node, off) {
    const r = document.createRange(); r.setStart(node, off); r.collapse(true);
    const s = editor.selection.getWindow().getSelection(); s.removeAllRanges(); s.addRange(r);
  }
  const kd = (k, o = {}) => new window.KeyboardEvent('keydown', { key: k, ctrlKey: !!o.ctrl, shiftKey: !!o.shift, bubbles: true, cancelable: true });

  it('Enter does not split a paragraph in readonly', () => {
    mk('<p>hello</p>'); editor.disable();
    caret(editor.getEditorElement().querySelector('p').firstChild, 2);
    editor.getEditorElement().dispatchEvent(kd('Enter'));
    expect(editor.getEditorElement().querySelectorAll('p').length).toBe(1);
  });

  it('Backspace does not merge blocks in readonly', () => {
    mk('<p>a</p><p>b</p>'); editor.disable();
    caret(editor.getEditorElement().querySelectorAll('p')[1].firstChild, 0);
    editor.getEditorElement().dispatchEvent(kd('Backspace'));
    expect(editor.getEditorElement().querySelectorAll('p').length).toBe(2);
  });

  it('Enter STILL splits when NOT readonly (no regression)', () => {
    mk('<p>hello</p>');
    caret(editor.getEditorElement().querySelector('p').firstChild, 2);
    editor.getEditorElement().dispatchEvent(kd('Enter'));
    expect(editor.getEditorElement().querySelectorAll('p').length).toBe(2);
  });

  it('undo shortcut still reaches the command layer in readonly (readonly-exempt)', () => {
    mk('<p>x</p>');
    let sawUndo = false;
    const orig = editor.commands.execute.bind(editor.commands);
    editor.commands.execute = (name, ...a) => { if (name === 'undo') sawUndo = true; return orig(name, ...a); };
    editor.disable();
    editor.getEditorElement().dispatchEvent(kd('z', { ctrl: true }));
    expect(sawUndo).toBe(true);
  });
});
