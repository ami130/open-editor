/**
 * 17.5.4 — show blocks: view-only toggle (class flip, isActive, content
 * untouched, readonly-exempt).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { OpenEditor } from '../src/editor.js';

let editor, target;
function make(config = {}) {
  target = document.createElement('div');
  document.body.appendChild(target);
  editor = new OpenEditor(target, config);
  return editor;
}
afterEach(() => {
  if (editor && !editor.isDestroyed()) editor.destroy();
  if (target && target.parentNode) target.remove();
  editor = target = null;
});

describe('17.5.4 — showBlocks', () => {
  it('toggles the class and reports isActive', () => {
    make();
    const el = editor.getEditorElement();
    expect(editor.commands.isActive('showBlocks')).toBe(false);
    editor.commands.execute('showBlocks');
    expect(el.classList.contains('oe-editor--show-blocks')).toBe(true);
    expect(editor.commands.isActive('showBlocks')).toBe(true);
    editor.commands.execute('showBlocks');
    expect(el.classList.contains('oe-editor--show-blocks')).toBe(false);
  });

  it('never leaks into content: getHTML is identical before/after', () => {
    make();
    editor.setHTML('<p>a</p><h2>b</h2>');
    const before = editor.getHTML();
    editor.commands.execute('showBlocks');
    expect(editor.getHTML()).toBe(before);
  });

  it('works in readonly mode (chrome-only toggle is exempt)', () => {
    make();
    editor.setReadOnly(true);
    editor.commands.execute('showBlocks');
    expect(editor.commands.isActive('showBlocks')).toBe(true);
  });

  it('toolbar button exists and reflects active state', () => {
    make();
    const btn = target.querySelector('.oe-tb__btn[data-name="showBlocks"]');
    expect(btn).toBeTruthy();
    btn.click();
    editor.toolbar._syncNow();
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });
});
