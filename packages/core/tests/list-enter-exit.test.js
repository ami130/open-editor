/**
 * list-enter-exit.test.js — Enter-to-exit audit fixes:
 *   L3   empty FIRST li + trailing items no longer leaves a stray empty <ul>
 *   L10  empty outline-parent (empty li that owns a sublist) can be exited
 */
import { describe, it, expect } from 'vitest';
import { OpenEditor } from '../src/editor.js';
import { handleListEnter } from '../src/commands/list-commands.js';

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
function caret(node, off = 0) {
  const r = document.createRange(); r.setStart(node, off); r.collapse(true);
  window.getSelection().removeAllRanges(); window.getSelection().addRange(r);
}
function emptyListCount(root) {
  return Array.from(root.querySelectorAll('ul, ol')).filter((l) => l.children.length === 0).length;
}

describe('L3: Enter on empty FIRST li leaves no stray empty list', () => {
  it('<ul><li>|</li><li>c</li></ul> + Enter → no empty <ul>', () => {
    const { editor, target, root } = mk('<ul><li><br></li><li>c</li></ul>');
    const emptyLi = root.querySelector('li');
    caret(emptyLi, 0);
    expect(handleListEnter(editor)).toBe(true);
    expect(emptyListCount(root)).toBe(0);           // NO stray empty list
    // c survives in a continuation list
    const lis = Array.from(root.querySelectorAll('li')).map((l) => l.textContent);
    expect(lis).toEqual(['c']);
    // a <p> now separates them
    expect(root.querySelector('p')).not.toBeNull();
    done(editor, target);
  });

  it('empty MIDDLE li + trailing still preserves leading + trailing, no orphan', () => {
    const { editor, target, root } = mk('<ul><li>a</li><li><br></li><li>c</li></ul>');
    const emptyLi = root.querySelectorAll('li')[1];
    caret(emptyLi, 0);
    expect(handleListEnter(editor)).toBe(true);
    expect(emptyListCount(root)).toBe(0);
    const lists = root.querySelectorAll('ul');
    expect(lists.length).toBe(2);                   // a-list and c-list
    expect(lists[0].textContent).toBe('a');
    expect(lists[1].textContent).toBe('c');
    done(editor, target);
  });

  it('continuation list keeps the ordered type + marker', () => {
    const { editor, target, root } = mk('<ol style="list-style-type: lower-roman"><li><br></li><li>c</li></ol>');
    caret(root.querySelector('li'), 0);
    handleListEnter(editor);
    const cont = root.querySelector('ol');
    expect(cont).not.toBeNull();
    expect(cont.textContent).toBe('c');
    expect(cont.style.listStyleType).toBe('lower-roman');
    done(editor, target);
  });
});

describe('L10: empty outline-parent can be Enter-exited (not trapped)', () => {
  it('<ul><li>|<ul><li>child</li></ul></li></ul> + Enter promotes the child', () => {
    const { editor, target, root } = mk('<ul><li><br><ul><li>child</li></ul></li></ul>');
    const parentLi = root.querySelector('li');
    caret(parentLi, 0);
    const handled = handleListEnter(editor);
    expect(handled).toBe(true);                     // NOT trapped
    // child survives, promoted up a level (no data loss)
    const lis = Array.from(root.querySelectorAll('li')).map((l) => l.textContent);
    expect(lis).toEqual(['child']);
    // the empty parent + its empty sublist are gone
    expect(emptyListCount(root)).toBe(0);
    done(editor, target);
  });
});
