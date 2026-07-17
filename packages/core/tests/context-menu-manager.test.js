import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ContextMenuManager } from '../src/ui/context-menu-manager.js';

function makeWrapper(doc) {
  const w = doc.createElement('div');
  w.style.cssText = 'position:relative;width:600px;height:400px;';
  doc.body.appendChild(w);
  return w;
}

const ITEMS = [
  { label: 'Cut',   command: 'cut',   shortcut: 'Ctrl+X' },
  { separator: true },
  { label: 'Paste', command: 'paste', disabled: true },
  { label: 'Format', submenu: [{ label: 'Bold', command: 'bold' }] },
];

describe('ContextMenuManager', () => {
  let wrapper, mgr;

  beforeEach(() => {
    wrapper = makeWrapper(document);
    mgr = new ContextMenuManager(wrapper, document, null);
  });

  afterEach(() => {
    mgr.destroy();
    if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
  });

  // 6.6 — show() mounts menu
  it('show() renders menu inside wrapper', () => {
    mgr.show(10, 10, ITEMS);
    expect(wrapper.querySelector('.oe-menu')).toBeTruthy();
  });

  // 6.6 — hide() removes menu
  it('hide() removes menu from DOM', () => {
    mgr.show(10, 10, ITEMS);
    mgr.hide();
    expect(wrapper.querySelector('.oe-menu')).toBeNull();
  });

  // 6.7 — items rendered with labels
  it('renders item labels', () => {
    mgr.show(10, 10, ITEMS);
    const labels = Array.from(wrapper.querySelectorAll('.oe-menu__item-label'))
      .map((el) => el.textContent);
    expect(labels).toContain('Cut');
    expect(labels).toContain('Format');
  });

  // 6.7 — separator rendered
  it('renders separator', () => {
    mgr.show(10, 10, ITEMS);
    expect(wrapper.querySelector('.oe-menu__separator')).toBeTruthy();
  });

  // 6.7 — disabled item has class + aria-disabled
  it('disabled item has aria-disabled and disabled class', () => {
    mgr.show(10, 10, ITEMS);
    const disabled = wrapper.querySelector('.oe-menu__item--disabled');
    expect(disabled).toBeTruthy();
    expect(disabled.getAttribute('aria-disabled')).toBe('true');
  });

  // 6.7 — shortcut hint rendered
  it('renders shortcut hint', () => {
    mgr.show(10, 10, ITEMS);
    const sc = wrapper.querySelector('.oe-menu__item-shortcut');
    expect(sc.textContent).toBe('Ctrl+X');
  });

  // 6.7 — submenu: aria-haspopup on parent item
  it('submenu parent has aria-haspopup="true"', () => {
    mgr.show(10, 10, ITEMS);
    const items = wrapper.querySelectorAll('.oe-menu__item');
    const subParent = Array.from(items).find(
      (el) => el.getAttribute('aria-haspopup') === 'true'
    );
    expect(subParent).toBeTruthy();
  });

  // 6.6 — Escape key closes menu
  it('Escape key closes the menu', () => {
    mgr.show(10, 10, ITEMS);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(wrapper.querySelector('.oe-menu')).toBeNull();
  });

  // 6.6 — ArrowDown moves focus to next item
  it('ArrowDown moves focus to next focusable item', () => {
    mgr.show(10, 10, ITEMS);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    const focused = wrapper.querySelector('.oe-menu__item--focused');
    expect(focused).toBeTruthy();
  });

  // 6.6 — click outside closes menu
  it('click outside wrapper closes menu', () => {
    mgr.show(10, 10, ITEMS);
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(wrapper.querySelector('.oe-menu')).toBeNull();
  });

  // 6.6 — click inside does not close (unless item clicked)
  it('click inside menu does not close via outside-click handler', () => {
    mgr.show(10, 10, ITEMS);
    const menu = wrapper.querySelector('.oe-menu');
    menu.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(wrapper.querySelector('.oe-menu')).toBeTruthy();
    mgr.hide();
  });

  // 6.9 — ARIA roles
  it('menu has role="menu"', () => {
    mgr.show(10, 10, ITEMS);
    expect(wrapper.querySelector('.oe-menu').getAttribute('role')).toBe('menu');
  });

  it('items have role="menuitem"', () => {
    mgr.show(10, 10, ITEMS);
    const items = wrapper.querySelectorAll('[role="menuitem"]');
    expect(items.length).toBeGreaterThan(0);
  });

  // 6.8 — scoped to wrapper
  it('menu is inside wrapper, not document.body', () => {
    mgr.show(10, 10, ITEMS);
    expect(document.body.querySelector(':scope > .oe-menu')).toBeNull();
    expect(wrapper.querySelector('.oe-menu')).toBeTruthy();
  });

  // command execution via editor.commands
  it('clicking an item executes its command on editor.commands', () => {
    const mockEditor = { commands: { execute: vi.fn() } };
    const localMgr = new ContextMenuManager(wrapper, document, mockEditor);
    localMgr.show(10, 10, [{ label: 'Cut', command: 'cut' }]);
    wrapper.querySelector('.oe-menu__item').click();
    expect(mockEditor.commands.execute).toHaveBeenCalledWith('cut');
    localMgr.destroy();
  });

  // action function called when no command
  it('clicking item with action() calls the function', () => {
    const action = vi.fn();
    mgr.show(10, 10, [{ label: 'Do it', action }]);
    wrapper.querySelector('.oe-menu__item').click();
    expect(action).toHaveBeenCalled();
  });

  // show() with empty items renders empty menu (no crash)
  it('show() with empty items array does not throw', () => {
    expect(() => mgr.show(10, 10, [])).not.toThrow();
  });

  // destroy cleans up
  it('destroy() cleans up menu and listeners', () => {
    mgr.show(10, 10, ITEMS);
    mgr.destroy();
    expect(wrapper.querySelector('.oe-menu')).toBeNull();
  });

  // 6.6 — ArrowRight opens submenu on focused item
  it('ArrowRight on submenu parent opens the submenu', () => {
    mgr.show(10, 10, ITEMS);
    // ITEMS focusable: [Cut(0), Format(1)] — Paste is disabled, separator skipped
    // show() already focuses Cut (idx 0); one ArrowDown → Format (idx 1)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(wrapper.querySelector('.oe-menu__submenu')).toBeTruthy();
    mgr.hide();
  });

  // 6.6 — ArrowLeft closes open submenu
  it('ArrowLeft closes the open submenu', () => {
    mgr.show(10, 10, ITEMS);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(wrapper.querySelector('.oe-menu__submenu')).toBeTruthy();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(wrapper.querySelector('.oe-menu__submenu')).toBeNull();
    mgr.hide();
  });

  // Regression (2026-07-16): after moving the submenu to the WRAPPER, ArrowLeft
  // must RETURN FOCUS to the parent row (via the tracked owner row) — not get
  // stranded on the wrapper. Previously used _subMenuEl.parentNode = wrapper.
  it('ArrowLeft restores focus to the parent row after closing the submenu', () => {
    mgr.show(10, 10, ITEMS);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    // the focused row is now the "Format" submenu parent
    const parentRow = wrapper.querySelector('.oe-menu__item--focused');
    expect(parentRow.textContent).toContain('Format');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    // submenu closed AND focus is back on the parent row (not lost)
    expect(wrapper.querySelector('.oe-menu__submenu')).toBeNull();
    const refocused = wrapper.querySelector('.oe-menu__item--focused');
    expect(refocused).toBe(parentRow);
    mgr.hide();
  });

  // 6.6 — Escape with submenu open closes only submenu, not entire menu
  it('Escape with submenu open closes only the submenu', () => {
    mgr.show(10, 10, ITEMS);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(wrapper.querySelector('.oe-menu__submenu')).toBeTruthy();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    // Submenu gone, root menu still present
    expect(wrapper.querySelector('.oe-menu__submenu')).toBeNull();
    expect(wrapper.querySelector('.oe-menu')).toBeTruthy();
    mgr.hide();
  });

  // 6.6 — initial focus: first focusable item is focused on show()
  it('first focusable item has focused class on show()', () => {
    mgr.show(10, 10, ITEMS);
    const focused = wrapper.querySelector('.oe-menu__item--focused');
    expect(focused).toBeTruthy();
    // Should be the first non-disabled, non-separator item (Cut)
    expect(focused.querySelector('.oe-menu__item-label').textContent).toBe('Cut');
    mgr.hide();
  });

  // 6.7 — icon property renders icon span
  it('item with icon renders icon span', () => {
    mgr.show(10, 10, [{ label: 'Bold', command: 'bold', icon: '<b>B</b>' }]);
    expect(wrapper.querySelector('.oe-menu__item-icon')).toBeTruthy();
    mgr.hide();
  });
});
