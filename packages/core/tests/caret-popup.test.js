/**
 * caret-popup.test.js — Phase 16.6 Stage 0: shared caret-anchored popup used by
 * the slash-command palette (16.6.1) and @mentions autocomplete (16.6.3).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createCaretPopup } from '../src/ui/caret-popup.js';

let popup;
afterEach(() => { if (popup) { popup.destroy(); popup = null; } });

function makeRange() {
  const el = document.createElement('div');
  el.textContent = 'hello';
  document.body.appendChild(el);
  const range = document.createRange();
  range.selectNodeContents(el);
  return { range, el };
}

describe('createCaretPopup', () => {
  it('starts closed (hidden) and not in the DOM', () => {
    popup = createCaretPopup(document);
    expect(popup.el.hidden).toBe(true);
    expect(popup.isOpen()).toBe(false);
    expect(popup.el.parentNode).toBeNull();
  });

  it('open() mounts the panel, makes it visible, and renders items', () => {
    popup = createCaretPopup(document);
    const { range, el } = makeRange();
    popup.open(range, [{ label: 'Heading 1' }, { label: 'Heading 2' }]);
    expect(popup.isOpen()).toBe(true);
    expect(document.body.contains(popup.el)).toBe(true);
    expect(popup.el.querySelectorAll('.oe-caret-popup__option').length).toBe(2);
    el.remove();
  });

  it('renders an empty-state row when items is empty', () => {
    popup = createCaretPopup(document);
    const { range, el } = makeRange();
    popup.open(range, []);
    expect(popup.el.querySelector('.oe-caret-popup__empty')).not.toBeNull();
    el.remove();
  });

  it('moveActive() cycles forward/backward with wraparound', () => {
    popup = createCaretPopup(document);
    const { range, el } = makeRange();
    popup.open(range, [{ label: 'A' }, { label: 'B' }, { label: 'C' }]);
    const activeClass = () => popup.el.querySelector('.oe-caret-popup__option--active').textContent;
    expect(activeClass()).toBe('A'); // open() defaults to index 0
    popup.moveActive(1);
    expect(activeClass()).toBe('B');
    popup.moveActive(1);
    expect(activeClass()).toBe('C');
    popup.moveActive(1); // wraps
    expect(activeClass()).toBe('A');
    popup.moveActive(-1); // wraps backward
    expect(activeClass()).toBe('C');
    el.remove();
  });

  it('pickActive() invokes onPick with the active item', () => {
    let picked = null;
    popup = createCaretPopup(document, { onPick: (item) => { picked = item; } });
    const { range, el } = makeRange();
    popup.open(range, [{ label: 'A', id: 1 }, { label: 'B', id: 2 }]);
    popup.moveActive(1);
    popup.pickActive();
    expect(picked).toEqual({ label: 'B', id: 2 });
    el.remove();
  });

  it('clicking an option invokes onPick with that item (not necessarily the active one)', () => {
    let picked = null;
    popup = createCaretPopup(document, { onPick: (item) => { picked = item; } });
    const { range, el } = makeRange();
    popup.open(range, [{ label: 'A' }, { label: 'B' }]);
    popup.el.querySelectorAll('.oe-caret-popup__option')[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(picked).toEqual({ label: 'B' });
    el.remove();
  });

  it('setItems() replaces items and resets active index to 0', () => {
    popup = createCaretPopup(document);
    const { range, el } = makeRange();
    popup.open(range, [{ label: 'A' }]);
    popup.moveActive(1); // no-op, only one item
    popup.setItems([{ label: 'X' }, { label: 'Y' }]);
    expect(popup.el.querySelectorAll('.oe-caret-popup__option').length).toBe(2);
    expect(popup.el.querySelector('.oe-caret-popup__option--active').textContent).toBe('X');
    el.remove();
  });

  it('close() hides the panel and clears items without removing it from the DOM', () => {
    popup = createCaretPopup(document);
    const { range, el } = makeRange();
    popup.open(range, [{ label: 'A' }]);
    popup.close();
    expect(popup.isOpen()).toBe(false);
    expect(popup.el.hidden).toBe(true);
    expect(document.body.contains(popup.el)).toBe(true); // still mounted, just hidden
    el.remove();
  });

  it('renderItem() customizes row content when provided', () => {
    popup = createCaretPopup(document, { renderItem: (item) => `>> ${item.label}` });
    const { range, el } = makeRange();
    popup.open(range, [{ label: 'A' }]);
    expect(popup.el.querySelector('.oe-caret-popup__option').textContent).toBe('>> A');
    el.remove();
  });

  it('destroy() removes the panel from the DOM entirely', () => {
    popup = createCaretPopup(document);
    const { range, el } = makeRange();
    popup.open(range, [{ label: 'A' }]);
    popup.destroy();
    expect(document.body.contains(popup.el)).toBe(false);
    el.remove();
    popup = null; // already destroyed, skip afterEach double-destroy
  });

  it('does not throw when the anchor range is detached / positioning fails', () => {
    popup = createCaretPopup(document);
    const { range, el } = makeRange();
    el.remove(); // detach before opening — getBoundingClientRect on a detached range
    expect(() => popup.open(range, [{ label: 'A' }])).not.toThrow();
  });
});
