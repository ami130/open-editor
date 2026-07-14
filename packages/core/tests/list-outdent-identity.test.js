/**
 * list-outdent-identity.test.js — M5 fix: top-level outdentLi must MOVE the
 * li's children into the new <p>, not clone them. Cloning discarded node
 * identity (contenteditable=false islands, images with attached state, any
 * externally-referenced element). This asserts the exact node survives.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestEditor } from '../src/testing/test-harness.js';
import { outdentLi } from '../src/commands/list-dom-indent.js';

let editor, root;
beforeEach(() => { editor = createTestEditor(); root = editor.getEditorElement(); });
afterEach(() => {
  if (!editor.isDestroyed()) editor.destroy();
  if (editor._target && editor._target.parentNode) editor._target.remove();
});

describe('outdentLi — preserves node identity (move, not clone)', () => {
  it('the SAME child node instance ends up in the resulting <p>', () => {
    root.innerHTML = '<ul><li>hello</li></ul>';
    const li = root.querySelector('li');
    // Tag a specific child node so we can assert identity (not a clone).
    const span = document.createElement('span');
    span.textContent = 'world';
    span._marker = Symbol('unique'); // identity marker survives move, not clone
    li.appendChild(span);

    const result = outdentLi(document, root, li);
    expect(result).not.toBeNull();
    const movedSpan = result.node.querySelector('span');
    expect(movedSpan).toBe(span);          // same instance
    expect(movedSpan._marker).toBe(span._marker);
  });

  it('preserves a contenteditable="false" island as the same node', () => {
    root.innerHTML = '<ul><li>x</li></ul>';
    const li = root.querySelector('li');
    const island = document.createElement('span');
    island.setAttribute('contenteditable', 'false');
    island.setAttribute('data-oe-island', 'test');
    li.appendChild(island);

    const result = outdentLi(document, root, li);
    const moved = result.node.querySelector('[data-oe-island="test"]');
    expect(moved).toBe(island);            // identity preserved
    expect(root.querySelector('li')).toBeNull();  // li removed
  });

  it('still produces a valid <p> and removes the emptied list', () => {
    root.innerHTML = '<ul><li>only</li></ul>';
    const li = root.querySelector('li');
    const result = outdentLi(document, root, li);
    expect(result.node.tagName).toBe('P');
    expect(result.node.textContent).toBe('only');
    expect(root.querySelector('ul')).toBeNull();
  });
});
