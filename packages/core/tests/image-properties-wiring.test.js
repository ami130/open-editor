/**
 * image-properties-wiring.test.js — Phase 9.1c triggers.
 * Verifies double-click fires onEditProps, the context menu offers "Image
 * properties…", config imageOpenOnDblClick gates the dblclick, and
 * deleteFigure removes the figure.
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

describe('9.1c — double-click opens properties', () => {
  it('dblclick on a figure fires onEditProps with that figure', () => {
    const fig = insertFig();
    let got = null;
    mgr.onEditProps = (f) => { got = f; };
    fig.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(got).toBe(fig);
  });

  it('dblclick inside the caption does NOT open properties', () => {
    const fig = insertFig();
    let called = false;
    mgr.onEditProps = () => { called = true; };
    const cap = fig.querySelector('[data-oe-caption]');
    cap.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(called).toBe(false);
  });

  it('respects imageOpenOnDblClick:false', () => {
    editor._config.imageOpenOnDblClick = false;
    const fig = insertFig();
    let called = false;
    mgr.onEditProps = () => { called = true; };
    fig.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(called).toBe(false);
  });
});

describe('9.1c — context menu offers Image properties…', () => {
  it('menu items include an Image properties… entry that calls onEditProps', () => {
    const fig = insertFig();
    let got = null;
    mgr.onEditProps = (f) => { got = f; };
    const items = mgr._buildContextMenuItems(fig);
    const props = items.find((i) => i.label === 'Image properties…');
    expect(props).toBeTruthy();
    props.action();
    expect(got).toBe(fig);
  });
});

describe('9.1c — deleteFigure', () => {
  it('removes the figure', () => {
    const fig = insertFig();
    mgr.deleteFigure(fig);
    expect(root.querySelector('figure[data-oe-island]')).toBeNull();
  });
});
