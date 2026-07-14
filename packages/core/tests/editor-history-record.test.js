/**
 * Editor history integration tests — Part A: public API surface, canUndo/canRedo,
 * undo/redo content restoration, setHTML history reset, command registration,
 * and keyboard shortcut registration.
 * Split from editor-history.test.js to stay within the 300-line limit.
 */
import { describe, it, expect } from 'vitest';
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

describe('Phase 5 — history public API', () => {
  it('editor.history is a HistoryManager after construction', () => {
    const { editor, target } = makeEditor();
    expect(editor.history).not.toBeNull();
    expect(typeof editor.history.undo).toBe('function');
    cleanup(editor, target);
  });

  it('editor.undo() exists and does not throw', () => {
    const { editor, target } = makeEditor();
    expect(() => editor.undo()).not.toThrow();
    cleanup(editor, target);
  });

  it('editor.redo() exists and does not throw', () => {
    const { editor, target } = makeEditor();
    expect(() => editor.redo()).not.toThrow();
    cleanup(editor, target);
  });

  it('editor.canUndo() returns false initially (initial snapshot at index 0)', () => {
    const { editor, target } = makeEditor();
    expect(editor.canUndo()).toBe(false);
    cleanup(editor, target);
  });

  it('editor.canRedo() returns false initially', () => {
    const { editor, target } = makeEditor();
    expect(editor.canRedo()).toBe(false);
    cleanup(editor, target);
  });

  it('editor.history is null after destroy()', () => {
    const { editor, target } = makeEditor();
    editor.destroy();
    expect(editor.history).toBeNull();
    if (target.parentNode) target.parentNode.removeChild(target);
  });
});

describe('canUndo / canRedo after manual snapshots', () => {
  it('canUndo() returns true after a second snapshot is taken', () => {
    const { editor, target } = makeEditor();
    editor.getEditorElement().innerHTML = '<p>changed</p>';
    editor.history.takeSnapshot();
    expect(editor.canUndo()).toBe(true);
    cleanup(editor, target);
  });

  it('canRedo() returns true after an undo', () => {
    const { editor, target } = makeEditor();
    editor.getEditorElement().innerHTML = '<p>changed</p>';
    editor.history.takeSnapshot();
    editor.undo();
    expect(editor.canRedo()).toBe(true);
    cleanup(editor, target);
  });
});

describe('undo restores editor content', () => {
  it('undo() restores previous innerHTML', () => {
    const { editor, target } = makeEditor();
    const el = editor.getEditorElement();
    el.innerHTML = '<p>version one</p>';
    editor.history.takeSnapshot();
    el.innerHTML = '<p>version two</p>';
    editor.history.takeSnapshot();
    editor.undo();
    expect(el.innerHTML).toBe('<p>version one</p>');
    cleanup(editor, target);
  });

  it('redo() re-applies content after undo', () => {
    const { editor, target } = makeEditor();
    const el = editor.getEditorElement();
    el.innerHTML = '<p>version one</p>';
    editor.history.takeSnapshot();
    el.innerHTML = '<p>version two</p>';
    editor.history.takeSnapshot();
    editor.undo();
    editor.redo();
    expect(el.innerHTML).toBe('<p>version two</p>');
    cleanup(editor, target);
  });
});

describe('setHTML() resets history', () => {
  it('canUndo() returns false after setHTML()', () => {
    const { editor, target } = makeEditor();
    editor.history.takeSnapshot();
    editor.setHTML('<p>fresh content</p>');
    expect(editor.canUndo()).toBe(false);
    cleanup(editor, target);
  });

  it('canRedo() returns false after setHTML()', () => {
    const { editor, target } = makeEditor();
    editor.history.takeSnapshot();
    editor.undo();
    editor.setHTML('<p>reset</p>');
    expect(editor.canRedo()).toBe(false);
    cleanup(editor, target);
  });
});

describe('undo/redo commands registered in CommandManager', () => {
  it('undo command is registered', () => {
    const { editor, target } = makeEditor();
    expect(editor.commands.getAll().has('undo')).toBe(true);
    cleanup(editor, target);
  });

  it('redo command is registered', () => {
    const { editor, target } = makeEditor();
    expect(editor.commands.getAll().has('redo')).toBe(true);
    cleanup(editor, target);
  });

  it('commands.execute("undo") does not throw', () => {
    const { editor, target } = makeEditor();
    expect(() => editor.commands.execute('undo')).not.toThrow();
    cleanup(editor, target);
  });

  it('commands.execute("redo") does not throw', () => {
    const { editor, target } = makeEditor();
    expect(() => editor.commands.execute('redo')).not.toThrow();
    cleanup(editor, target);
  });
});

describe('undo/redo keyboard shortcuts registered', () => {
  it('ctrl+z is registered to undo', () => {
    const { editor, target } = makeEditor();
    const all = editor.shortcuts.getAll();
    const entry = all.get('ctrl+z');
    expect(entry).not.toBeUndefined();
    expect(entry.command).toBe('undo');
    cleanup(editor, target);
  });

  it('ctrl+y is registered to redo', () => {
    const { editor, target } = makeEditor();
    const all = editor.shortcuts.getAll();
    const entry = all.get('ctrl+y');
    expect(entry).not.toBeUndefined();
    expect(entry.command).toBe('redo');
    cleanup(editor, target);
  });

  it('ctrl+shift+z is registered to redo', () => {
    const { editor, target } = makeEditor();
    const all = editor.shortcuts.getAll();
    const entry = all.get('ctrl+shift+z');
    expect(entry).not.toBeUndefined();
    expect(entry.command).toBe('redo');
    cleanup(editor, target);
  });
});
