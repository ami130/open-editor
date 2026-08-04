/**
 * image-overlay-refit.test.js — unit-level contract for the stale-frame fix:
 * the resize overlay and action bar must reposition on `afterCommand` (align /
 * properties), and must clean that listener up on destroy. Real overlay geometry
 * is proven in the playground e2e of the same name (jsdom has no layout).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestEditor } from '../src/testing/test-harness.js';
import { ImageResizeManager } from '../src/plugins/image/image-resize.js';
import { ImageActionBar } from '../src/plugins/image/image-actionbar.js';
import { createFigure } from '../src/plugins/image/image-dom.js';

let editor, root;
beforeEach(() => {
  editor = createTestEditor();
  root = editor.getEditorElement();
});
afterEach(() => {
  if (!editor.isDestroyed()) editor.destroy();
  if (editor._target && editor._target.parentNode) editor._target.remove();
});

function fig() {
  const f = createFigure('https://x.com/a.png', {}, {}, document);
  root.innerHTML = '';
  root.appendChild(f);
  return f;
}

describe('resize overlay refits on afterCommand (stale-frame fix)', () => {
  it('repositions when afterCommand fires while a figure is attached', () => {
    const mgr = new ImageResizeManager();
    mgr.install(editor);
    const f = fig();
    editor.emit('imageSelected', { figure: f });   // attach
    const spy = vi.spyOn(mgr, '_reposition');
    editor.emit('afterCommand', { command: 'imageAligned', args: [] });
    expect(spy).toHaveBeenCalled();                 // _repositionSettled → _reposition
    mgr.destroy();
  });

  it('does NOT reposition on afterCommand when no figure is attached', () => {
    const mgr = new ImageResizeManager();
    mgr.install(editor);
    const spy = vi.spyOn(mgr, '_reposition');
    editor.emit('afterCommand', { command: 'bold', args: [] });
    expect(spy).not.toHaveBeenCalled();
    mgr.destroy();
  });

  it('removes the afterCommand listener on destroy (no leak / no throw)', () => {
    const mgr = new ImageResizeManager();
    mgr.install(editor);
    const f = fig();
    editor.emit('imageSelected', { figure: f });
    mgr.destroy();
    const spy = vi.spyOn(mgr, '_reposition');
    expect(() => editor.emit('afterCommand', { command: 'imageAligned', args: [] })).not.toThrow();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('action bar refits on afterCommand (stale-frame fix)', () => {
  it('repositions when afterCommand fires while a figure is shown', () => {
    const bar = new ImageActionBar(editor);
    const f = fig();
    editor.emit('imageSelected', { figure: f });    // showFor
    const spy = vi.spyOn(bar, '_reposition');
    editor.emit('afterCommand', { command: 'imageAligned', args: [] });
    expect(spy).toHaveBeenCalled();
    bar.destroy();
  });

  it('removes the afterCommand listener on destroy', () => {
    const bar = new ImageActionBar(editor);
    const f = fig();
    editor.emit('imageSelected', { figure: f });
    bar.destroy();
    // After destroy, a stray afterCommand must not throw.
    expect(() => editor.emit('afterCommand', { command: 'imageAligned', args: [] })).not.toThrow();
  });
});
