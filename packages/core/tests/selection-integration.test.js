import { describe, it, expect } from 'vitest';
import { OpenEditor } from '../src/editor.js';
import { SelectionManager } from '../src/selection/selection-manager.js';

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

// ─── 3.1 — editor.selection is a SelectionManager ────────────────────────────

describe('3.1 — editor.selection integration', () => {
  it('editor.selection is a SelectionManager instance after construction', () => {
    const target = makeTarget();
    const editor = new OpenEditor(target);
    expect(editor.selection).toBeInstanceOf(SelectionManager);
    cleanup(editor, target);
  });

  it('editor.selection is null after destroy()', () => {
    const target = makeTarget();
    const editor = new OpenEditor(target);
    editor.destroy();
    expect(editor.selection).toBeNull();
    target.parentNode && target.parentNode.removeChild(target);
  });

  it('editor.selection.get() returns null when nothing is selected', () => {
    const target = makeTarget();
    const editor = new OpenEditor(target);
    window.getSelection().removeAllRanges();
    expect(editor.selection.get()).toBeNull();
    cleanup(editor, target);
  });

  it('editor.selection.save() returns null when nothing is selected', () => {
    const target = makeTarget();
    const editor = new OpenEditor(target);
    window.getSelection().removeAllRanges();
    expect(editor.selection.save()).toBeNull();
    cleanup(editor, target);
  });

  it('editor.selection.getSelectedHTML() returns empty string when nothing selected', () => {
    const target = makeTarget();
    const editor = new OpenEditor(target);
    window.getSelection().removeAllRanges();
    expect(editor.selection.getSelectedHTML()).toBe('');
    cleanup(editor, target);
  });

  it('editor.selection.getSelectedText() returns empty string when nothing selected', () => {
    const target = makeTarget();
    const editor = new OpenEditor(target);
    window.getSelection().removeAllRanges();
    expect(editor.selection.getSelectedText()).toBe('');
    cleanup(editor, target);
  });

  it('editor.selection.selectAll() does not throw on empty editor', () => {
    const target = makeTarget();
    const editor = new OpenEditor(target);
    expect(() => editor.selection.selectAll()).not.toThrow();
    cleanup(editor, target);
  });

  it('editor.selection.restore(null) does not throw', () => {
    const target = makeTarget();
    const editor = new OpenEditor(target);
    expect(() => editor.selection.restore(null)).not.toThrow();
    cleanup(editor, target);
  });

  it('editor.selection.insertAtCursor() does not throw when no selection exists', () => {
    const target = makeTarget();
    const editor = new OpenEditor(target);
    window.getSelection().removeAllRanges();
    expect(() => editor.selection.insertAtCursor('<strong>test</strong>')).not.toThrow();
    cleanup(editor, target);
  });
});
