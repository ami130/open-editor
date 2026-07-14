/**
 * image-selection.test.js — undo/redo/setHTML stale-selection-reference
 * regression for ImageSelectionManager (ported from the identical fix in
 * media-selection.js). Other ImageSelectionManager behavior (dblclick,
 * context menu, deleteFigure) is already covered by image-properties-wiring.test.js.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestEditor } from '../src/testing/test-harness.js';
import { ImageSelectionManager } from '../src/plugins/image/image-selection.js';
import { createFigure } from '../src/plugins/image/image-dom.js';

let editor, root, mgr;
beforeEach(() => {
  editor = createTestEditor();
  root = editor.getEditorElement();
  mgr = new ImageSelectionManager();
  mgr.install(editor);
});
afterEach(() => {
  mgr.destroy();
  if (!editor.isDestroyed()) editor.destroy();
  if (editor._target && editor._target.parentNode) editor._target.remove();
});

function insertFig() {
  const fig = createFigure('https://x.com/a.png', {}, {}, document);
  root.innerHTML = '';
  root.appendChild(fig);
  return fig;
}

function mousedownOn(el) {
  const e = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'target', { value: el, enumerable: true });
  editor.emit('mousedown', e);
}

// REGRESSION: undo/redo/setHTML replace the editor's innerHTML wholesale,
// destroying the selected figure's DOM node. A stale reference to it must
// not silently block re-selecting the NEW node that replaces it. Found and
// fixed for video embeds first (media-selection.test.js); ported here so
// images get the identical fix.
describe('ImageSelectionManager — undo/redo/setHTML clear a stale selection', () => {
  it('undo clears a stale selection reference so the replaced figure can be reselected', () => {
    const f = insertFig();
    mousedownOn(f);
    expect(f.classList.contains('oe-figure--selected')).toBe(true);

    editor.emit('undo', { index: 0 });
    expect(mgr.getSelected()).toBeNull();

    const f2 = insertFig();
    let selectedFigure = null;
    editor.on('imageSelected', ({ figure }) => { selectedFigure = figure; });
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

  it('destroy still removes the undo/redo/setHTML listeners (no leak, no throw after)', () => {
    const f = insertFig();
    mousedownOn(f);
    mgr.destroy();
    expect(() => editor.emit('undo', { index: 0 })).not.toThrow();
    expect(() => editor.emit('redo', { index: 0 })).not.toThrow();
    expect(() => editor.emit('setHTML', { html: '<p><br></p>' })).not.toThrow();
  });
});
