/**
 * media-selection.test.js — click-to-select, keyboard delete, and
 * history-crossing deselect for video embed islands.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestEditor } from '../src/testing/test-harness.js';
import { MediaSelectionManager } from '../src/plugins/media/media-selection.js';
import { buildEmbed, applyAlignment } from '../src/plugins/media/media-dom.js';

let editor, root, mgr;
beforeEach(() => {
  editor = createTestEditor();
  root = editor.getEditorElement();
  mgr = new MediaSelectionManager();
  mgr.install(editor);
});
afterEach(() => {
  mgr.destroy();
  if (!editor.isDestroyed()) editor.destroy();
  if (editor._target && editor._target.parentNode) editor._target.remove();
});

function insertFig() {
  const f = buildEmbed(editor, { provider: 'youtube', src: 'https://www.youtube-nocookie.com/embed/x' });
  root.innerHTML = '';
  root.appendChild(f);
  return f;
}

function mousedownOn(el) {
  const e = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'target', { value: el, enumerable: true });
  editor.emit('mousedown', e);
}

describe('MediaSelectionManager', () => {
  it('selects a video figure on click and emits mediaSelected', () => {
    const f = insertFig();
    let selectedFigure = null;
    editor.on('mediaSelected', ({ figure }) => { selectedFigure = figure; });
    mousedownOn(f);
    expect(f.classList.contains('oe-embed--selected')).toBe(true);
    expect(selectedFigure).toBe(f);
  });

  it('deselects on a click outside any figure, emitting mediaDeselected', () => {
    const f = insertFig();
    mousedownOn(f);
    let deselected = null;
    editor.on('mediaDeselected', ({ figure }) => { deselected = figure; });
    mousedownOn(root);
    expect(f.classList.contains('oe-embed--selected')).toBe(false);
    expect(deselected).toBe(f);
  });

  it('clicking a different figure moves selection to it', () => {
    const f1 = insertFig();
    const f2 = buildEmbed(editor, { provider: 'vimeo', src: 'https://player.vimeo.com/video/1' });
    root.appendChild(f2);
    mousedownOn(f1);
    mousedownOn(f2);
    expect(f1.classList.contains('oe-embed--selected')).toBe(false);
    expect(f2.classList.contains('oe-embed--selected')).toBe(true);
  });

  it('Backspace/Delete removes the selected figure via onKeyDown', () => {
    const f = insertFig();
    mousedownOn(f);
    const handled = mgr.onKeyDown({ key: 'Backspace' });
    expect(handled).toBe(true);
    expect(root.contains(f)).toBe(false);
  });

  it('onKeyDown returns false when nothing is selected', () => {
    expect(mgr.onKeyDown({ key: 'Backspace' })).toBe(false);
  });

  it('Escape deselects without deleting', () => {
    const f = insertFig();
    mousedownOn(f);
    const handled = mgr.onKeyDown({ key: 'Escape' });
    expect(handled).toBe(true);
    expect(root.contains(f)).toBe(true);
    expect(f.classList.contains('oe-embed--selected')).toBe(false);
  });

  it('deleteFigure() removes any figure, selected or not', () => {
    const f = insertFig();
    mgr.deleteFigure(f);
    expect(root.contains(f)).toBe(false);
  });

  it('deleting the only figure restores the canonical empty-editor floor', () => {
    const f = insertFig();
    mousedownOn(f);
    mgr.onKeyDown({ key: 'Delete' });
    expect(root.innerHTML).toBe('<p><br></p>');
  });

  // REGRESSION: undo/redo/setHTML replace the editor's innerHTML wholesale,
  // destroying the selected figure's DOM node. A stale reference to it must
  // not silently block re-selecting the NEW node that replaces it.
  it('undo clears a stale selection reference so the replaced figure can be reselected', () => {
    const f = insertFig();
    mousedownOn(f);
    expect(f.classList.contains('oe-embed--selected')).toBe(true);

    editor.emit('undo', { index: 0 });
    expect(mgr.getSelected()).toBeNull();

    // A brand-new figure node (simulating the post-undo re-render) selects cleanly.
    const f2 = insertFig();
    let selectedFigure = null;
    editor.on('mediaSelected', ({ figure }) => { selectedFigure = figure; });
    mousedownOn(f2);
    expect(selectedFigure).toBe(f2);
  });

  it('redo and setHTML also clear a stale selection reference', () => {
    const f = insertFig();
    mousedownOn(f);
    editor.emit('redo', { index: 0 });
    expect(mgr.getSelected()).toBeNull();

    const f2 = insertFig();
    mousedownOn(f2);
    expect(mgr.getSelected()).toBe(f2);
    editor.emit('setHTML', { html: '<p><br></p>' });
    expect(mgr.getSelected()).toBeNull();
  });

  it('destroy deselects and stops listening', () => {
    const f = insertFig();
    mousedownOn(f);
    mgr.destroy();
    expect(f.classList.contains('oe-embed--selected')).toBe(false);
    expect(() => mousedownOn(f)).not.toThrow();
  });
});

describe('applyAlignment (media-dom.js)', () => {
  it('applies left/right/center/inline classes and clears previous ones', () => {
    const f = insertFig();
    applyAlignment(f, 'left');
    expect(f.classList.contains('oe-embed--left')).toBe(true);
    applyAlignment(f, 'right');
    expect(f.classList.contains('oe-embed--left')).toBe(false);
    expect(f.classList.contains('oe-embed--right')).toBe(true);
    applyAlignment(f, 'center');
    expect(f.classList.contains('oe-embed--right')).toBe(false);
    expect(f.classList.contains('oe-embed--center')).toBe(true);
    applyAlignment(f, 'inline');
    expect(f.classList.contains('oe-embed--center')).toBe(false);
    expect(f.classList.contains('oe-embed--inline')).toBe(true);
  });
});
