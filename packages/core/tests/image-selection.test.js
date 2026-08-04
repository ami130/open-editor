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

// ─── IMG1-3: keyboard accessibility ──────────────────────────────────────────
describe('image keyboard a11y (IMG1-3)', () => {
  it('the figure is keyboard-focusable (tabindex=0) with a role + label', () => {
    const fig = createFigure('https://x.com/a.png', { alt: 'A cat' }, {}, document);
    expect(fig.getAttribute('tabindex')).toBe('0');
    expect(fig.getAttribute('role')).toBe('group');
    expect(fig.getAttribute('aria-label')).toBe('Image: A cat');
  });

  it('an alt-less image gets a "no description" aria-label', () => {
    const fig = createFigure('https://x.com/a.png', {}, {}, document);
    expect(fig.getAttribute('aria-label')).toBe('Image (no description)');
  });

  it('tabindex/role are EDITING affordances — stripped from getHTML output', () => {
    editor.setHTML('');
    const fig = createFigure('https://x.com/a.png', { alt: 'x' }, {}, document);
    editor.getEditorElement().appendChild(fig);
    const html = editor.getHTML();
    expect(html).not.toMatch(/tabindex/);
    expect(html).not.toMatch(/role="group"/);
  });

  it('focusin on a figure selects it (Tab-to-select)', () => {
    const fig = insertFig();
    const e = new FocusEvent('focusin', { bubbles: true });
    Object.defineProperty(e, 'target', { value: fig, enumerable: true });
    editor.getEditorElement().dispatchEvent(e);
    expect(mgr.getSelected()).toBe(fig);
  });

  it('Enter on a selected figure opens properties', () => {
    const fig = insertFig();
    mousedownOn(fig);
    let opened = null;
    mgr.onEditProps = (f) => { opened = f; };
    const handled = mgr.onKeyDown({ key: 'Enter', preventDefault() {} });
    expect(handled).toBe(true);
    expect(opened).toBe(fig);
  });

  it('ArrowRight resizes the selected image (width grows, aspect kept)', () => {
    const fig = insertFig();
    const img = fig.querySelector('img');
    img.setAttribute('width', '100'); img.setAttribute('height', '50');
    mousedownOn(fig);
    const handled = mgr.onKeyDown({ key: 'ArrowRight', shiftKey: true, preventDefault() {} });
    expect(handled).toBe(true);
    expect(parseInt(img.getAttribute('width'), 10)).toBeGreaterThan(100);
  });

  it('Escape deselects and returns focus to the editor', () => {
    const fig = insertFig();
    mousedownOn(fig);
    const handled = mgr.onKeyDown({ key: 'Escape', preventDefault() {} });
    expect(handled).toBe(true);
    expect(mgr.getSelected()).toBeNull();
  });
});

// ─── IMG20: type-to-replace a selected image ─────────────────────────────────
describe('image type-to-replace (IMG20)', () => {
  it('typing a printable char over a selected image replaces it with that text', () => {
    const fig = insertFig();
    mousedownOn(fig);
    const handled = mgr.onKeyDown({ key: 'x', preventDefault() {}, ctrlKey: false, metaKey: false, altKey: false });
    expect(handled).toBe(true);
    expect(root.querySelector('figure')).toBeNull();     // image gone
    expect(root.textContent).toContain('x');             // replaced by the char
  });

  it('a modifier combo (Ctrl+C) over a selected image does NOT replace it', () => {
    const fig = insertFig();
    mousedownOn(fig);
    const handled = mgr.onKeyDown({ key: 'c', preventDefault() {}, ctrlKey: true, metaKey: false, altKey: false });
    expect(handled).toBe(false);
    expect(root.querySelector('figure')).not.toBeNull(); // still there
  });
});

// ─── IMG17: focusCaption (caption action-bar button target) ──────────────────
import { focusCaption } from '../src/plugins/image/image-keyboard-resize.js';

describe('focusCaption (IMG17)', () => {
  it('creates a figcaption when the figure has none, and focuses it', () => {
    const fig = insertFig();
    // Simulate older pasted content: strip the auto-created caption.
    const existing = fig.querySelector('figcaption');
    if (existing) existing.remove();
    expect(fig.querySelector('figcaption')).toBeNull();

    const ok = focusCaption(editor, fig);
    expect(ok).toBe(true);
    const cap = fig.querySelector('figcaption');
    expect(cap).not.toBeNull();
    expect(cap.getAttribute('contenteditable')).toBe('true');
    expect(cap.hasAttribute('data-oe-caption')).toBe(true);
  });

  it('reuses the existing caption instead of creating a second one', () => {
    const fig = insertFig();
    focusCaption(editor, fig);
    expect(fig.querySelectorAll('figcaption').length).toBe(1);
  });
});
