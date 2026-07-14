import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { OpenEditor } from '../src/editor.js';

describe('Phase 6 — editor.ui integration', () => {
  let container, editor;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    editor = new OpenEditor(container);
  });

  afterEach(() => {
    if (!editor.isDestroyed()) editor.destroy();
    if (container.parentNode) container.parentNode.removeChild(container);
  });

  // 6.1 / 6.5 / 6.6 — editor.ui exists after init
  it('editor.ui is defined after init', () => {
    expect(editor.ui).toBeTruthy();
  });

  it('editor.ui.modal is a ModalManager instance', () => {
    expect(typeof editor.ui.modal.open).toBe('function');
    expect(typeof editor.ui.modal.close).toBe('function');
  });

  it('editor.ui.tooltip is a TooltipManager instance', () => {
    expect(typeof editor.ui.tooltip.show).toBe('function');
    expect(typeof editor.ui.tooltip.hide).toBe('function');
  });

  it('editor.ui.contextMenu is a ContextMenuManager instance', () => {
    expect(typeof editor.ui.contextMenu.show).toBe('function');
    expect(typeof editor.ui.contextMenu.hide).toBe('function');
  });

  // 6.8 — UI is scoped to editor wrapper, not document.body
  it('modal opens inside editor wrapper', () => {
    editor.ui.modal.open({ title: 'Scoped' });
    const wrapper = container.querySelector('.oe-wrapper');
    expect(wrapper.querySelector('.oe-backdrop')).toBeTruthy();
    expect(document.body.querySelector(':scope > .oe-backdrop')).toBeNull();
    editor.ui.modal.closeAll();
  });

  it('tooltip renders inside editor wrapper', () => {
    const el = container.querySelector('.oe-editor');
    editor.ui.tooltip.show(el, 'hint');
    const wrapper = container.querySelector('.oe-wrapper');
    expect(wrapper.querySelector('.oe-tooltip')).toBeTruthy();
    editor.ui.tooltip.hide();
  });

  it('context menu renders inside editor wrapper', () => {
    editor.ui.contextMenu.show(10, 10, [{ label: 'Cut', command: 'cut' }]);
    const wrapper = container.querySelector('.oe-wrapper');
    expect(wrapper.querySelector('.oe-menu')).toBeTruthy();
    editor.ui.contextMenu.hide();
  });

  // contextmenu DOM event emits 'contextmenu' event on editor
  it('right-click on editor emits contextmenu event', () => {
    let fired = false;
    editor.on('contextmenu', () => { fired = true; });
    const el = container.querySelector('.oe-editor');
    el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
    expect(fired).toBe(true);
  });

  // destroy tears down editor.ui
  it('editor.ui is null after destroy()', () => {
    editor.destroy();
    expect(editor.ui).toBeNull();
  });

  // destroy while modal open resolves modal and removes DOM
  it('destroy() closes open modal cleanly', async () => {
    const p = editor.ui.modal.open({ title: 'open on destroy' });
    editor.destroy();
    const result = await p;
    expect(result).toBeNull();
  });

  // Multiple editor instances — each scoped independently
  it('two editors have independent ui namespaces', () => {
    const c2 = document.createElement('div');
    document.body.appendChild(c2);
    const e2 = new OpenEditor(c2);
    expect(editor.ui.modal).not.toBe(e2.ui.modal);
    e2.destroy();
    c2.parentNode.removeChild(c2);
  });
});
