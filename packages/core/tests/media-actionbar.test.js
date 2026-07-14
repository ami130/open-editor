/**
 * media-actionbar.test.js — floating action bar for a selected video embed.
 * Mirrors image-actionbar.test.js: show on mediaSelected, hide on
 * mediaDeselected, alignment applies, delete callback fires with the figure.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestEditor } from '../src/testing/test-harness.js';
import { MediaActionBar } from '../src/plugins/media/media-actionbar.js';
import { buildEmbed } from '../src/plugins/media/media-dom.js';

let editor, root, bar;
beforeEach(() => {
  editor = createTestEditor();
  root = editor.getEditorElement();
  bar = new MediaActionBar(editor);
});
afterEach(() => {
  bar.destroy();
  if (!editor.isDestroyed()) editor.destroy();
  if (editor._target && editor._target.parentNode) editor._target.remove();
});

function fig() {
  const f = buildEmbed(editor, { provider: 'youtube', src: 'https://www.youtube-nocookie.com/embed/x' });
  root.innerHTML = '';
  root.appendChild(f);
  return f;
}
function q(sel) { return bar.getElement().querySelector(sel); }

describe('MediaActionBar', () => {
  it('is hidden initially', () => {
    expect(bar.getElement().hidden).toBe(true);
  });

  it('shows on mediaSelected and hides on mediaDeselected', () => {
    const f = fig();
    editor.emit('mediaSelected', { figure: f });
    expect(bar.getElement().hidden).toBe(false);
    editor.emit('mediaDeselected', { figure: f });
    expect(bar.getElement().hidden).toBe(true);
  });

  it('align buttons apply the alignment class to the figure', () => {
    const f = fig();
    editor.emit('mediaSelected', { figure: f });
    q('[aria-label="Center"]').click();
    expect(f.classList.contains('oe-embed--center')).toBe(true);
    q('[aria-label="Align right"]').click();
    expect(f.classList.contains('oe-embed--right')).toBe(true);
    expect(f.classList.contains('oe-embed--center')).toBe(false);
  });

  it('delete button invokes the callback with the figure', () => {
    const f = fig();
    let deleted = null;
    bar.onDelete = (x) => { deleted = x; };
    editor.emit('mediaSelected', { figure: f });
    q('[aria-label="Delete video"]').click();
    expect(deleted).toBe(f);
  });

  it('has no edit/link buttons (a video embed has nothing to edit but its URL)', () => {
    const f = fig();
    editor.emit('mediaSelected', { figure: f });
    expect(q('[aria-label="Edit image"]')).toBeNull();
    expect(q('[aria-label="Add / edit link"]')).toBeNull();
  });

  it('destroy removes the bar element and event listeners', () => {
    const el = bar.getElement();
    bar.destroy();
    expect(el.parentNode).toBeNull();
    expect(() => editor.emit('mediaSelected', { figure: fig() })).not.toThrow();
  });
});
