/**
 * image-drop-indicator.test.js — IMG15: the drop-position caret line shown
 * while dragging an image file over the editor.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestEditor } from '../src/testing/test-harness.js';
import { ImageDropIndicator } from '../src/plugins/image/image-drop-indicator.js';

let editor, root, ind;
beforeEach(() => {
  editor = createTestEditor();
  root = editor.getEditorElement();
  root.innerHTML = '<p>hello world</p>';
  ind = new ImageDropIndicator(editor);
});
afterEach(() => {
  ind.destroy();
  if (!editor.isDestroyed()) editor.destroy();
  if (editor._target && editor._target.parentNode) editor._target.remove();
});

describe('ImageDropIndicator (IMG15)', () => {
  it('creates a wrapper-level, aria-hidden, hidden-by-default overlay element', () => {
    const el = editor._wrapper.querySelector('.oe-img-drop-indicator');
    expect(el).not.toBeNull();
    expect(el.hidden).toBe(true);
    expect(el.getAttribute('aria-hidden')).toBe('true');
  });

  it('hides when the point does not resolve to an editable caret', () => {
    // jsdom has no caretRangeFromPoint → no range → stays hidden.
    ind.update(9999, 9999);
    const el = editor._wrapper.querySelector('.oe-img-drop-indicator');
    expect(el.hidden).toBe(true);
  });

  it('shows and positions the line when the point resolves inside the editable', () => {
    const doc = editor._wrapper.ownerDocument;
    const textNode = root.querySelector('p').firstChild;
    // Stub caretRangeFromPoint to return a range inside the editable content.
    const range = doc.createRange();
    range.setStart(textNode, 0);
    range.collapse(true);
    range.getBoundingClientRect = () => ({ left: 10, right: 40, top: 20, bottom: 34, width: 30, height: 14 });
    doc.caretRangeFromPoint = () => range;
    editor._wrapper.getBoundingClientRect = () => ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 });

    ind.update(15, 25);
    const el = editor._wrapper.querySelector('.oe-img-drop-indicator');
    expect(el.hidden).toBe(false);
    expect(el.style.width).toBe('30px');
    // top is caret bottom (34) - wrapperTop (0) + scrollTop (0) - 1
    expect(el.style.top).toBe('33px');
  });

  it('hide() re-hides an already-shown line', () => {
    const doc = editor._wrapper.ownerDocument;
    const textNode = root.querySelector('p').firstChild;
    const range = doc.createRange();
    range.setStart(textNode, 0); range.collapse(true);
    range.getBoundingClientRect = () => ({ left: 10, right: 40, top: 20, bottom: 34, width: 30, height: 14 });
    doc.caretRangeFromPoint = () => range;
    editor._wrapper.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 });
    ind.update(15, 25);
    const el = editor._wrapper.querySelector('.oe-img-drop-indicator');
    expect(el.hidden).toBe(false);
    ind.hide();
    expect(el.hidden).toBe(true);
  });

  it('destroy removes the overlay element from the DOM', () => {
    const el = editor._wrapper.querySelector('.oe-img-drop-indicator');
    ind.destroy();
    expect(el.parentNode).toBeNull();
  });
});
