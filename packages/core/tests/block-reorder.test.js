/**
 * block-reorder.test.js — Phase 16.6.4 pure DOM reorder primitives.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { isReorderableBlock, getReorderableBlocks, moveBlockBefore } from '../src/plugins/block-drag/block-reorder.js';

let root;
afterEach(() => { if (root) root.remove(); });

function makeRoot(html) {
  root = document.createElement('div');
  root.innerHTML = html;
  document.body.appendChild(root);
  return root;
}

describe('isReorderableBlock', () => {
  it('true for a direct-child <p>/<h1>/<ul>/<table>', () => {
    makeRoot('<p>a</p><h1>b</h1><ul><li>c</li></ul><table><tr><td>d</td></tr></table>');
    for (const child of Array.from(root.children)) {
      expect(isReorderableBlock(child, root)).toBe(true);
    }
  });

  it('false for a nested element (not a direct child)', () => {
    makeRoot('<ul><li>item</li></ul>');
    const li = root.querySelector('li');
    expect(isReorderableBlock(li, root)).toBe(false);
  });

  it('false for a table cell/row (never independently draggable)', () => {
    makeRoot('<table><tbody><tr><td>x</td></tr></tbody></table>');
    const tr = root.querySelector('tr');
    const td = root.querySelector('td');
    expect(isReorderableBlock(tr, root)).toBe(false);
    expect(isReorderableBlock(td, root)).toBe(false);
  });

  it('false for null/non-element input', () => {
    makeRoot('<p>a</p>');
    expect(isReorderableBlock(null, root)).toBe(false);
    expect(isReorderableBlock(document.createTextNode('x'), root)).toBe(false);
  });
});

describe('getReorderableBlocks', () => {
  it('returns direct-child blocks in document order', () => {
    makeRoot('<p>a</p><h1>b</h1><ul><li>c</li></ul>');
    const blocks = getReorderableBlocks(root);
    expect(blocks.map((b) => b.tagName.toLowerCase())).toEqual(['p', 'h1', 'ul']);
  });

  it('returns an empty array for a null root', () => {
    expect(getReorderableBlocks(null)).toEqual([]);
  });
});

describe('moveBlockBefore', () => {
  it('moves a block before an earlier sibling', () => {
    makeRoot('<p id="a">a</p><p id="b">b</p><p id="c">c</p>');
    const [a, , c] = Array.from(root.children);
    moveBlockBefore(root, c, a); // move c to the front
    expect(Array.from(root.children).map((el) => el.id)).toEqual(['c', 'a', 'b']);
  });

  it('moves a block to the end when target is null', () => {
    makeRoot('<p id="a">a</p><p id="b">b</p>');
    const [a] = Array.from(root.children);
    moveBlockBefore(root, a, null);
    expect(Array.from(root.children).map((el) => el.id)).toEqual(['b', 'a']);
  });

  it('is a no-op when block === target', () => {
    makeRoot('<p id="a">a</p><p id="b">b</p>');
    const [a] = Array.from(root.children);
    expect(moveBlockBefore(root, a, a)).toBe(false);
    expect(Array.from(root.children).map((el) => el.id)).toEqual(['a', 'b']);
  });

  it('is a no-op when the block is already immediately before the target', () => {
    makeRoot('<p id="a">a</p><p id="b">b</p><p id="c">c</p>');
    const [a, b] = Array.from(root.children);
    expect(moveBlockBefore(root, a, b)).toBe(false); // a is already right before b
    expect(Array.from(root.children).map((el) => el.id)).toEqual(['a', 'b', 'c']);
  });

  it('returns false and does nothing for a null root or block', () => {
    makeRoot('<p>a</p>');
    expect(moveBlockBefore(null, root.firstChild, null)).toBe(false);
    expect(moveBlockBefore(root, null, null)).toBe(false);
  });
});
