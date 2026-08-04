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

  // ─── L1: outdenting a top-level parent must PRESERVE its nested children ───
  it('L1: top-level outdent keeps nested sub-items (no data loss)', () => {
    root.innerHTML = '<ul><li>Parent<ul><li>child1</li><li>child2</li></ul></li></ul>';
    const parentLi = root.querySelector('li');
    const result = outdentLi(document, root, parentLi);
    // "Parent" becomes a <p>; the children survive as a following list.
    expect(result.node.tagName).toBe('P');
    expect(result.node.textContent).toBe('Parent');
    const survivingLis = Array.from(root.querySelectorAll('li')).map((l) => l.textContent);
    expect(survivingLis).toEqual(['child1', 'child2']);   // NOT deleted
    // The sublist now follows the <p> as a sibling.
    expect(result.node.nextElementSibling.tagName).toMatch(/^(UL|OL)$/);
  });

  it('L1: promoted sublist keeps the SAME child li nodes (identity, not clone)', () => {
    root.innerHTML = '<ul><li>P<ul><li>a</li></ul></li></ul>';
    const parentLi = root.querySelector('li');
    const childLi = root.querySelector('li li');
    childLi._marker = Symbol('child');
    outdentLi(document, root, parentLi);
    const moved = root.querySelector('li');
    expect(moved.textContent).toBe('a');
    expect(moved._marker).toBe(childLi._marker);   // same instance moved, not cloned
  });

  // ─── I8: outdenting a styled top-level <li> to a <p> keeps its block styles ──
  it('I8: top-level outdent carries the li alignment/line-height onto the <p>', () => {
    root.innerHTML = '<ul><li style="text-align:center;line-height:2" id="it" class="hi">item</li></ul>';
    const li = root.querySelector('li');
    const result = outdentLi(document, root, li);
    expect(result.node.tagName).toBe('P');
    expect(result.node.style.textAlign).toBe('center');   // was: dropped
    expect(result.node.style.lineHeight).toBe('2');
    expect(result.node.id).toBe('it');
    expect(result.node.className).toBe('hi');
  });
});
