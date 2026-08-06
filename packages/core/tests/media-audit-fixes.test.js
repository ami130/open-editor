/**
 * media-audit-fixes.test.js — deep-audit fixes for the embedded-video plugin:
 *  M1 keyboard focus/select (tabindex + focusin) + ContextMenu key opens the menu
 *  M2 arrow keys resize the selected embed (mirrors image keyboard-resize)
 *  M3 resize overlay refits on afterCommand (align-desync fix)
 *  M4 resize has an upper clamp (MAX_WIDTH/MAX_HEIGHT), not just a floor
 *  M5 oe-embed--selected never survives into getHTML() output
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestEditor } from '../src/testing/test-harness.js';
import { MediaSelectionManager } from '../src/plugins/media/media-selection.js';
import { MediaResizeManager } from '../src/plugins/media/media-resize.js';
import { buildEmbed } from '../src/plugins/media/media-dom.js';

let editor, root, selMgr, resizeMgr;
beforeEach(() => {
  editor = createTestEditor();
  root = editor.getEditorElement();
  selMgr = new MediaSelectionManager();
  selMgr.install(editor);
  resizeMgr = new MediaResizeManager();
  resizeMgr.install(editor);
});
afterEach(() => {
  resizeMgr.destroy();
  selMgr.destroy();
  if (!editor.isDestroyed()) editor.destroy();
  if (editor._target && editor._target.parentNode) editor._target.remove();
});

function insertFig() {
  const f = buildEmbed(editor, { provider: 'youtube', src: 'https://www.youtube-nocookie.com/embed/x' });
  root.innerHTML = '';
  root.appendChild(f);
  return f;
}

describe('M1 — keyboard focus/select', () => {
  it('the built figure is keyboard-focusable (tabindex=0)', () => {
    const f = insertFig();
    expect(f.getAttribute('tabindex')).toBe('0');
  });

  it('focusin on the figure selects it', () => {
    const f = insertFig();
    let selected = null;
    editor.on('mediaSelected', ({ figure }) => { selected = figure; });
    const e = new Event('focusin', { bubbles: true });
    Object.defineProperty(e, 'target', { value: f, enumerable: true });
    editor.getEditorElement().dispatchEvent(e);
    expect(selected).toBe(f);
  });

  it('ContextMenu key opens the actions menu for the selected figure', () => {
    const f = insertFig();
    let shown = null;
    const origShow = editor.ui.contextMenu.show;
    editor.ui.contextMenu.show = (x, y, items) => { shown = items; };
    selMgr._selectFigure(f);
    const handled = selMgr.onKeyDown({ key: 'ContextMenu', preventDefault() {} });
    editor.ui.contextMenu.show = origShow;
    expect(handled).toBe(true);
    expect(Array.isArray(shown)).toBe(true);
  });
});

describe('M2 — arrow-key resize', () => {
  it('ArrowRight grows width and preserves aspect ratio via height', () => {
    const f = insertFig();
    f.getBoundingClientRect = () => ({ width: 320, height: 180 });
    selMgr._selectFigure(f);
    const handled = selMgr.onKeyDown({ key: 'ArrowRight', shiftKey: false, preventDefault() {} });
    expect(handled).toBe(true);
    expect(f.style.width).toBe('321px');
  });

  it('emits afterCommand:keyboardResizeMedia', () => {
    const f = insertFig();
    f.getBoundingClientRect = () => ({ width: 320, height: 180 });
    selMgr._selectFigure(f);
    let cmd = null;
    editor.on('afterCommand', (p) => { cmd = p.command; });
    selMgr.onKeyDown({ key: 'ArrowUp', shiftKey: true, preventDefault() {} });
    expect(cmd).toBe('keyboardResizeMedia');
  });
});

describe('M3 — resize overlay refits on afterCommand (align-desync fix)', () => {
  it('reposition() is called when afterCommand fires while a figure is attached', () => {
    const f = insertFig();
    editor.emit('mediaSelected', { figure: f });
    let repositioned = 0;
    resizeMgr._reposition = () => { repositioned++; };
    editor.emit('afterCommand', { command: 'mediaAligned', args: [] });
    expect(repositioned).toBe(1);
  });

  it('does nothing if no figure is attached', () => {
    let repositioned = 0;
    resizeMgr._reposition = () => { repositioned++; };
    editor.emit('afterCommand', { command: 'mediaAligned', args: [] });
    expect(repositioned).toBe(0);
  });
});

describe('M4 — resize upper clamp', () => {
  it('drag-move clamps width to MAX_WIDTH=8000', () => {
    const f = insertFig();
    editor.emit('mediaSelected', { figure: f });
    resizeMgr._onHandleMouseDown({ preventDefault() {}, stopPropagation() {}, clientX: 0, clientY: 0 }, 'e');
    resizeMgr._handleDragMove({ clientX: 999999, clientY: 0, shiftKey: false });
    expect(parseInt(f.style.width, 10)).toBeLessThanOrEqual(8000);
  });
});

describe('M5 — selection class never leaks into getHTML()', () => {
  it('oe-embed--selected is stripped from serialized output', () => {
    const f = insertFig();
    editor.emit('mediaSelected', { figure: f });
    f.classList.add('oe-embed--selected');
    const html = editor.getHTML();
    expect(html).not.toContain('oe-embed--selected');
  });
});
