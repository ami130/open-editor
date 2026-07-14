/**
 * Editor history integration tests — Part B: undo/redo events, afterCommand
 * auto-snapshot, batch → single snapshot, C1 fix (undo/redo via CommandManager
 * must not corrupt the stack), M1 fix (Tab produces snapshot), M2 fix
 * (undo/redo work in readonly mode).
 * Split from editor-history.test.js to stay within the 300-line limit.
 */
import { describe, it, expect, vi } from 'vitest';
import { OpenEditor } from '../src/editor.js';

function makeTarget() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}
function cleanup(editor, target) {
  if (editor && !editor.isDestroyed()) editor.destroy();
  if (target && target.parentNode) target.parentNode.removeChild(target);
}
function makeEditor(html = '') {
  const target = makeTarget();
  const editor = new OpenEditor(target);
  if (html) editor.getEditorElement().innerHTML = html;
  return { editor, target };
}

describe('undo/redo events', () => {
  it('editor emits undo event when undo() is called', () => {
    const { editor, target } = makeEditor();
    const fn = vi.fn();
    editor.on('undo', fn);
    editor.getEditorElement().innerHTML = '<p>changed</p>';
    editor.history.takeSnapshot();
    editor.undo();
    expect(fn).toHaveBeenCalled();
    cleanup(editor, target);
  });

  it('editor emits redo event when redo() is called', () => {
    const { editor, target } = makeEditor();
    const fn = vi.fn();
    editor.on('redo', fn);
    editor.getEditorElement().innerHTML = '<p>changed</p>';
    editor.history.takeSnapshot();
    editor.undo();
    editor.redo();
    expect(fn).toHaveBeenCalled();
    cleanup(editor, target);
  });
});

describe('afterCommand auto-snapshot', () => {
  it('executing a command adds a new history entry', () => {
    const { editor, target } = makeEditor('<p>hello</p>');
    const before = editor.history._stack.length;
    editor.commands.execute('selectAll');
    window.getSelection().removeAllRanges();
    expect(editor.history._stack.length).toBeGreaterThan(before);
    cleanup(editor, target);
  });
});

describe('batch() produces one snapshot, not N', () => {
  it('two commands in a batch produce exactly one new snapshot', () => {
    const { editor, target } = makeEditor('<p>text</p>');
    const before = editor.history._stack.length;
    editor.commands.batch(() => {
      editor.commands.execute('alignCenter');
      editor.commands.execute('alignLeft');
    });
    expect(editor.history._stack.length).toBe(before + 1);
    cleanup(editor, target);
  });
});

describe('C1 fix — undo/redo do not corrupt the stack', () => {
  it('undo via commands.execute does not push an extra snapshot', () => {
    const { editor, target } = makeEditor('<p>start</p>');
    const el = editor.getEditorElement();
    el.innerHTML = '<p>edit one</p>';
    editor.history.takeSnapshot();
    const stackBefore = editor.history._stack.length;
    const indexBefore = editor.history._index;
    editor.commands.execute('undo');
    expect(editor.history._stack.length).toBe(stackBefore);
    expect(editor.history._index).toBe(indexBefore - 1);
    cleanup(editor, target);
  });

  it('redo remains available after undo via commands.execute', () => {
    const { editor, target } = makeEditor('<p>start</p>');
    const el = editor.getEditorElement();
    el.innerHTML = '<p>edit one</p>';
    editor.history.takeSnapshot();
    editor.commands.execute('undo');
    expect(editor.canRedo()).toBe(true);
    cleanup(editor, target);
  });

  it('full undo→redo cycle restores correct content', () => {
    const { editor, target } = makeEditor();
    const el = editor.getEditorElement();
    el.innerHTML = '<p>version A</p>';
    editor.history.takeSnapshot();
    el.innerHTML = '<p>version B</p>';
    editor.history.takeSnapshot();
    editor.commands.execute('undo');
    expect(el.innerHTML).toBe('<p>version A</p>');
    editor.commands.execute('redo');
    expect(el.innerHTML).toBe('<p>version B</p>');
    cleanup(editor, target);
  });
});

describe('M1 fix — Tab key produces a history snapshot', () => {
  it('Tab on second list item creates a new history entry', () => {
    const { editor, target } = makeEditor();
    const el = editor.getEditorElement();
    el.innerHTML = '<ul><li>one</li><li>two</li></ul>';
    editor.history.takeSnapshot();
    const before = editor.history._stack.length;
    const li2 = el.querySelectorAll('li')[1];
    const range = document.createRange();
    range.setStart(li2.firstChild, 0);
    range.collapse(true);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    const tabEvent = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    el.dispatchEvent(tabEvent);
    expect(editor.history._stack.length).toBeGreaterThan(before);
    cleanup(editor, target);
  });
});

describe('M2 fix — undo/redo work in readonly mode', () => {
  it('undo executes when editor is readonly', () => {
    const { editor, target } = makeEditor('<p>start</p>');
    const el = editor.getEditorElement();
    editor.history.takeSnapshot();
    el.innerHTML = '<p>changed</p>';
    editor.history.takeSnapshot();
    editor.setReadOnly(true);
    expect(() => editor.commands.execute('undo')).not.toThrow();
    expect(el.innerHTML).toBe('<p>start</p>');
    cleanup(editor, target);
  });

  it('redo executes when editor is readonly', () => {
    const { editor, target } = makeEditor('<p>start</p>');
    const el = editor.getEditorElement();
    el.innerHTML = '<p>changed</p>';
    editor.history.takeSnapshot();
    editor.history.undo();
    editor.setReadOnly(true);
    expect(() => editor.commands.execute('redo')).not.toThrow();
    expect(el.innerHTML).toBe('<p>changed</p>');
    cleanup(editor, target);
  });
});
