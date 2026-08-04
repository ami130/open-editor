/**
 * list-unwrap-convert.test.js — audit fixes for list toggle-off (unwrap) and
 * ul<->ol conversion / mixed-merge:
 *   L2  unwrap MOVES nodes (identity preserved), never clones
 *   L5  a heading inside an <li> is restored as a real block, not <p><h2></p>
 *   L6  ul<->ol convert remaps/strips list-style-type
 *   L7  mixed-selection merge preserves the source list's start/style/id
 */
import { describe, it, expect } from 'vitest';
import { OpenEditor } from '../src/editor.js';
import { unwrapListToBlocksAll, convertListType, coalesceAdjacentLists, wrapBlocksInList } from '../src/commands/list-dom.js';

function mk(html) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  const editor = new OpenEditor(target);
  editor.getEditorElement().innerHTML = html;
  return { editor, target, root: editor.getEditorElement() };
}
function done(editor, target) {
  if (editor && !editor.isDestroyed()) editor.destroy();
  if (target && target.parentNode) target.parentNode.removeChild(target);
}
function selectAll(node) {
  const r = document.createRange(); r.selectNodeContents(node);
  window.getSelection().removeAllRanges(); window.getSelection().addRange(r);
}

describe('L2: unwrap MOVES nodes (node identity preserved)', () => {
  it('the SAME element instance survives toggle-off', () => {
    const { editor, target, root } = mk('<ul><li><span id="live">x</span></li></ul>');
    const original = root.querySelector('#live');
    original._marker = Symbol('id');
    unwrapListToBlocksAll(document, root.querySelector('ul'));
    const after = root.querySelector('#live');
    expect(after).toBe(original);            // moved, not cloned
    expect(after._marker).toBe(original._marker);
    done(editor, target);
  });

  it('a contenteditable="false" island keeps its identity through unwrap', () => {
    const { editor, target, root } = mk('<ul><li><span contenteditable="false" data-oe-island="w">x</span></li></ul>');
    const island = root.querySelector('[data-oe-island="w"]');
    unwrapListToBlocksAll(document, root.querySelector('ul'));
    expect(root.querySelector('[data-oe-island="w"]')).toBe(island);
    done(editor, target);
  });
});

describe('L5: heading inside <li> restores as a real block (not <p><h2>)', () => {
  it('li wrapping exactly a heading -> the heading, not nested in <p>', () => {
    const { editor, target, root } = mk('<ul><li><h2>Title</h2></li></ul>');
    unwrapListToBlocksAll(document, root.querySelector('ul'));
    expect(root.querySelector('p > h2')).toBeNull();   // never invalid nesting
    expect(root.querySelector('h2').textContent).toBe('Title');
    done(editor, target);
  });

  it('li with heading + a trailing whitespace text node still restores the heading', () => {
    // whitespace text node used to push childNodes.length to 2 -> fell to <p> path
    const { editor, target, root } = mk('<ul><li><h2>Title</h2> </li></ul>');
    unwrapListToBlocksAll(document, root.querySelector('ul'));
    expect(root.querySelector('p > h2')).toBeNull();
    expect(root.querySelector('h2').textContent).toBe('Title');
    done(editor, target);
  });

  it('li with heading + a nested list keeps the heading a block and the list separate', () => {
    const { editor, target, root } = mk('<ul><li><h2>T</h2><ul><li>sub</li></ul></li></ul>');
    unwrapListToBlocksAll(document, root.querySelector('ul'));
    expect(root.querySelector('p > h2')).toBeNull();
    const h2 = root.querySelector('h2');
    expect(h2).not.toBeNull();
    // the sublist survives as its own list, not lost
    expect(root.querySelectorAll('li').length).toBe(1);
    expect(root.querySelector('li').textContent).toBe('sub');
    done(editor, target);
  });
});

describe('L6: ul<->ol convert remaps/strips list-style-type', () => {
  it('ul(square) -> ol drops the bullet marker (no square on an ordered list)', () => {
    const { editor, target, root } = mk('<ul style="list-style-type: square"><li>a</li></ul>');
    const newList = convertListType(document, root.querySelector('ul'), 'ol');
    expect(newList.tagName).toBe('OL');
    expect(newList.style.listStyleType).not.toBe('square');
    done(editor, target);
  });

  it('ol(decimal) -> ul drops the numeric marker (no decimal on a bullet list)', () => {
    const { editor, target, root } = mk('<ol style="list-style-type: decimal"><li>a</li></ol>');
    const newList = convertListType(document, root.querySelector('ol'), 'ul');
    expect(newList.tagName).toBe('UL');
    expect(newList.style.listStyleType).not.toBe('decimal');
    done(editor, target);
  });

  it('a compatible marker is preserved (ul disc kept meaningless-but-harmless? no: stays a bullet)', () => {
    // ul->ol with an OL-valid marker like lower-roman should be preserved
    const { editor, target, root } = mk('<ul style="list-style-type: disc"><li>a</li></ul>');
    const newList = convertListType(document, root.querySelector('ul'), 'ol');
    // disc is a bullet marker — invalid on ol — so it must be dropped
    expect(newList.style.listStyleType).not.toBe('disc');
    done(editor, target);
  });

  it('preserves id / class / non-style attributes across convert', () => {
    const { editor, target, root } = mk('<ol id="steps" class="x" start="3"><li>a</li></ol>');
    const newList = convertListType(document, root.querySelector('ol'), 'ul');
    expect(newList.id).toBe('steps');
    expect(newList.className).toBe('x');
    done(editor, target);
  });
});

describe('L8: a bare text node "block" keeps its text (no data loss)', () => {
  it('wrapBlocksInList moves a text node into the <li>, does not delete it', () => {
    const { editor, target, root } = mk('<p>keep</p>');
    // Inject a stray text node directly under root (as browsers sometimes do).
    const stray = document.createTextNode('stray words');
    root.insertBefore(stray, root.firstChild);
    const list = wrapBlocksInList(document, [stray], 'ul');
    expect(list.textContent).toContain('stray words');   // text preserved
    expect(root.textContent).toContain('stray words');
    done(editor, target);
  });
});

describe('L9: adjacent same-type lists coalesce into one', () => {
  it('merges a following same-type sibling list', () => {
    const { editor, target, root } = mk('<ul><li>a</li></ul><ul><li>b</li></ul>');
    coalesceAdjacentLists(root.querySelector('ul'));
    expect(root.querySelectorAll('ul').length).toBe(1);
    expect(Array.from(root.querySelectorAll('li')).map((l) => l.textContent)).toEqual(['a', 'b']);
    done(editor, target);
  });

  it('merges a preceding same-type sibling list (order preserved)', () => {
    const { editor, target, root } = mk('<ul><li>a</li></ul><ul><li>b</li></ul>');
    coalesceAdjacentLists(root.querySelectorAll('ul')[1]);
    expect(root.querySelectorAll('ul').length).toBe(1);
    expect(Array.from(root.querySelectorAll('li')).map((l) => l.textContent)).toEqual(['a', 'b']);
    done(editor, target);
  });

  it('does NOT merge a different-type sibling (ul next to ol)', () => {
    const { editor, target, root } = mk('<ul><li>a</li></ul><ol><li>b</li></ol>');
    coalesceAdjacentLists(root.querySelector('ul'));
    expect(root.querySelectorAll('ul').length).toBe(1);
    expect(root.querySelectorAll('ol').length).toBe(1);
    done(editor, target);
  });

  it('does NOT merge same-tag lists with different markers (distinct styling kept)', () => {
    const { editor, target, root } = mk('<ul style="list-style-type: disc"><li>a</li></ul><ul style="list-style-type: square"><li>b</li></ul>');
    coalesceAdjacentLists(root.querySelector('ul'));
    expect(root.querySelectorAll('ul').length).toBe(2);
    done(editor, target);
  });

  it('integration: UL on a paragraph next to an existing UL yields ONE list', () => {
    const { editor, target, root } = mk('<ul><li>a</li></ul><p>b</p>');
    const p = root.querySelector('p');
    const r = document.createRange(); r.setStart(p.firstChild, 0); r.collapse(true);
    window.getSelection().removeAllRanges(); window.getSelection().addRange(r);
    editor.commands.execute('ul');
    expect(root.querySelectorAll('ul').length).toBe(1);
    expect(Array.from(root.querySelectorAll('li')).map((l) => l.textContent)).toEqual(['a', 'b']);
    done(editor, target);
  });
});

describe('L7: mixed-selection merge preserves source list attributes', () => {
  it('merging a paragraph + an <ol start=5 id=steps> keeps start & id on the result', () => {
    const { editor, target, root } = mk('<p>X</p><ol start="5" id="steps" style="list-style-type: lower-roman"><li>a</li></ol>');
    selectAll(root);                       // span both blocks
    editor.commands.execute('ol');          // toggle OL over the mixed selection
    const ol = root.querySelector('ol');
    expect(ol).not.toBeNull();
    expect(ol.getAttribute('start')).toBe('5');
    expect(ol.id).toBe('steps');
    expect(ol.style.listStyleType).toBe('lower-roman');
    // content merged in order
    expect(Array.from(ol.querySelectorAll('li')).map((l) => l.textContent)).toEqual(['X', 'a']);
    done(editor, target);
  });
});
