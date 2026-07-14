/**
 * image-actionbar.test.js — Phase 9.4 floating action bar.
 * Verifies show on imageSelected, hide on imageDeselected, alignment applies,
 * and edit/link/delete callbacks fire with the current figure.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestEditor } from '../src/testing/test-harness.js';
import { ImageActionBar } from '../src/plugins/image/image-actionbar.js';
import { createFigure } from '../src/plugins/image/image-dom.js';

let editor, root, bar;
beforeEach(() => {
  editor = createTestEditor();
  root = editor.getEditorElement();
  bar = new ImageActionBar(editor);
});
afterEach(() => {
  bar.destroy();
  if (!editor.isDestroyed()) editor.destroy();
  if (editor._target && editor._target.parentNode) editor._target.remove();
});

function fig() {
  const f = createFigure('https://x.com/a.png', {}, {}, document);
  root.innerHTML = '';
  root.appendChild(f);
  return f;
}
function q(sel) { return bar.getElement().querySelector(sel); }

describe('ImageActionBar', () => {
  it('is hidden initially', () => {
    expect(bar.getElement().hidden).toBe(true);
  });

  it('shows on imageSelected and hides on imageDeselected', () => {
    const f = fig();
    editor.emit('imageSelected', { figure: f });
    expect(bar.getElement().hidden).toBe(false);
    editor.emit('imageDeselected', { figure: f });
    expect(bar.getElement().hidden).toBe(true);
  });

  it('align buttons apply the alignment class to the figure', () => {
    const f = fig();
    editor.emit('imageSelected', { figure: f });
    q('[aria-label="Center"]').click();
    expect(f.classList.contains('oe-figure--center')).toBe(true);
    q('[aria-label="Align right"]').click();
    expect(f.classList.contains('oe-figure--right')).toBe(true);
    expect(f.classList.contains('oe-figure--center')).toBe(false);
  });

  it('edit / link / delete buttons invoke callbacks with the figure', () => {
    const f = fig();
    let edited = null, linked = null, deleted = null;
    bar.onEdit = (x) => { edited = x; };
    bar.onLink = (x) => { linked = x; };
    bar.onDelete = (x) => { deleted = x; };
    editor.emit('imageSelected', { figure: f });
    q('[aria-label="Edit image"]').click();
    q('[aria-label="Add / edit link"]').click();
    q('[aria-label="Delete image"]').click();
    expect(edited).toBe(f);
    expect(linked).toBe(f);
    expect(deleted).toBe(f);
  });

  it('destroy removes the bar element and event listeners', () => {
    const el = bar.getElement();
    bar.destroy();
    expect(el.parentNode).toBeNull();
    // After destroy, a stray imageSelected must not throw or re-show.
    expect(() => editor.emit('imageSelected', { figure: fig() })).not.toThrow();
  });
});
