import { describe, it, expect } from 'vitest';
import { walkUp, getClosestTag, getParentBlock, isInsideTag, getDeepestNode } from '../src/selection/range-utils.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeDOM() {
  // root > p > strong > text
  //      > em > text
  const root = document.createElement('div');
  root.className = 'oe-editor';

  const p = document.createElement('p');
  const strong = document.createElement('strong');
  const text1 = document.createTextNode('bold text');
  strong.appendChild(text1);
  p.appendChild(strong);

  const em = document.createElement('em');
  const text2 = document.createTextNode('italic text');
  em.appendChild(text2);
  p.appendChild(em);

  root.appendChild(p);
  return { root, p, strong, em, text1, text2 };
}

// ─── walkUp ──────────────────────────────────────────────────────────────────

describe('walkUp', () => {
  it('returns node itself when predicate matches at start', () => {
    const { p, root } = makeDOM();
    const result = walkUp(p, root, (n) => n === p);
    expect(result).toBe(p);
  });

  it('walks up and finds matching ancestor', () => {
    const { text1, p, root } = makeDOM();
    const result = walkUp(text1, root, (n) => n === p);
    expect(result).toBe(p);
  });

  it('stops at root and does NOT return root', () => {
    const { text1, root } = makeDOM();
    const result = walkUp(text1, root, (n) => n === root);
    expect(result).toBeNull();
  });

  it('returns null when no match found', () => {
    const { text1, root } = makeDOM();
    const result = walkUp(text1, root, () => false);
    expect(result).toBeNull();
  });

  it('returns null when node is null', () => {
    const { root } = makeDOM();
    expect(walkUp(null, root, () => true)).toBeNull();
  });

  it('returns null when root is null', () => {
    const { text1 } = makeDOM();
    expect(walkUp(text1, null, () => true)).toBeNull();
  });

  it('returns null when node is the root itself (root is excluded)', () => {
    const { root } = makeDOM();
    const result = walkUp(root, root, () => true);
    expect(result).toBeNull();
  });
});

// ─── getClosestTag ───────────────────────────────────────────────────────────

describe('getClosestTag', () => {
  it('returns element itself if it matches the tag', () => {
    const { p, root } = makeDOM();
    expect(getClosestTag(p, 'p', root)).toBe(p);
  });

  it('finds nearest ancestor by tag name', () => {
    const { text1, strong, root } = makeDOM();
    expect(getClosestTag(text1, 'strong', root)).toBe(strong);
  });

  it('is case-insensitive on tag argument', () => {
    const { text1, strong, root } = makeDOM();
    expect(getClosestTag(text1, 'STRONG', root)).toBe(strong);
  });

  it('returns null when tag is not found below root', () => {
    const { text1, root } = makeDOM();
    expect(getClosestTag(text1, 'blockquote', root)).toBeNull();
  });

  it('returns null when node is null', () => {
    const { root } = makeDOM();
    expect(getClosestTag(null, 'p', root)).toBeNull();
  });

  it('returns null when tag is null', () => {
    const { p, root } = makeDOM();
    expect(getClosestTag(p, null, root)).toBeNull();
  });

  it('does not return root itself even if root matches the tag', () => {
    const root = document.createElement('p');
    const child = document.createTextNode('hi');
    root.appendChild(child);
    expect(getClosestTag(child, 'p', root)).toBeNull();
  });
});

// ─── getParentBlock ──────────────────────────────────────────────────────────

describe('getParentBlock', () => {
  it('returns the block element itself when node is a block', () => {
    const { p, root } = makeDOM();
    expect(getParentBlock(p, root)).toBe(p);
  });

  it('returns nearest block ancestor from a text node', () => {
    const { text1, p, root } = makeDOM();
    expect(getParentBlock(text1, root)).toBe(p);
  });

  it('returns nearest block ancestor from inline element', () => {
    const { strong, p, root } = makeDOM();
    expect(getParentBlock(strong, root)).toBe(p);
  });

  it('recognises all standard block tags', () => {
    const blockTags = [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'blockquote', 'pre', 'li', 'td', 'th', 'div',
      'figure', 'figcaption', 'dl', 'dt', 'dd',
      'table', 'thead', 'tbody', 'tfoot', 'tr',
      'ul', 'ol',
    ];
    for (const tag of blockTags) {
      const root = document.createElement('div');
      root.className = 'oe-root';
      const block = document.createElement(tag);
      const text = document.createTextNode('x');
      block.appendChild(text);
      root.appendChild(block);
      expect(getParentBlock(text, root)).toBe(block);
    }
  });

  it('returns null when no block found below root', () => {
    const root = document.createElement('div');
    root.className = 'oe-root';
    const span = document.createElement('span');
    const text = document.createTextNode('x');
    span.appendChild(text);
    root.appendChild(span);
    expect(getParentBlock(text, root)).toBeNull();
  });

  it('returns null when node is null', () => {
    const { root } = makeDOM();
    expect(getParentBlock(null, root)).toBeNull();
  });
});

// ─── isInsideTag ─────────────────────────────────────────────────────────────

describe('isInsideTag', () => {
  it('returns true when node is inside the tag', () => {
    const { text1, root } = makeDOM();
    expect(isInsideTag(text1, 'strong', root)).toBe(true);
  });

  it('returns true when node itself is the tag', () => {
    const { strong, root } = makeDOM();
    expect(isInsideTag(strong, 'strong', root)).toBe(true);
  });

  it('returns false when node is not inside the tag', () => {
    const { text2, root } = makeDOM();
    expect(isInsideTag(text2, 'strong', root)).toBe(false);
  });

  it('returns false when node is null', () => {
    const { root } = makeDOM();
    expect(isInsideTag(null, 'p', root)).toBe(false);
  });

  it('does not escape above root', () => {
    // strong is a child of p which is a child of root
    // asking isInsideTag from text1 for 'div' (root's parent) should be false
    const { text1, root } = makeDOM();
    const wrapper = document.createElement('div');
    wrapper.appendChild(root);
    // root is the boundary — 'div' above root must not be found
    expect(isInsideTag(text1, 'div', root)).toBe(false);
  });
});

// ─── getDeepestNode ───────────────────────────────────────────────────────────

describe('getDeepestNode', () => {
  it('descends the first-child chain to the leaf text node by default', () => {
    const { p, text1 } = makeDOM();
    // p > strong > "bold text" — first-child chain ends at text1
    expect(getDeepestNode(p)).toBe(text1);
  });

  it('descends the last-child chain when edge is "last"', () => {
    const { p, text2 } = makeDOM();
    // p > em > "italic text" — last-child chain ends at text2
    expect(getDeepestNode(p, 'last')).toBe(text2);
  });

  it('returns the node itself when it has no children', () => {
    const { text1 } = makeDOM();
    expect(getDeepestNode(text1)).toBe(text1);
  });

  it('returns null for a null node', () => {
    expect(getDeepestNode(null)).toBeNull();
  });
});
