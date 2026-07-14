/**
 * List command tests — Part B: Tab structural nesting (T8), Enter exit-list
 * (T9), batch command grouping (4.23), and handleListTab readonly guard (Q3).
 * Split from list-commands.test.js to stay within the 300-line limit.
 */
import { describe, it, expect } from 'vitest';
import { OpenEditor } from '../src/editor.js';
import { handleListTab, handleListEnter } from '../src/commands/list-commands.js';

function makeTarget() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}
function cleanup(editor, target) {
  if (editor && !editor.isDestroyed()) editor.destroy();
  if (target && target.parentNode) target.parentNode.removeChild(target);
}
function makeEditorWith(html) {
  const target = makeTarget();
  const editor = new OpenEditor(target);
  editor.getEditorElement().innerHTML = html;
  return { editor, target };
}
function setCursor(node, offset = 0) {
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(range);
}

describe('Tab inside list (T8)', () => {
  it('Tab on second list item nests it under first', () => {
    const { editor, target } = makeEditorWith('<ul><li>one</li><li>two</li></ul>');
    const items = editor.getEditorElement().querySelectorAll('li');
    setCursor(items[1].firstChild, 0);
    const consumed = handleListTab(editor, false);
    expect(consumed).toBe(true);
    expect(editor.getEditorElement().querySelector('li ul, li ol')).not.toBeNull();
    cleanup(editor, target);
  });

  // 16.7.1 — a brand-new sublist auto-varies its marker by depth.
  it('a newly-created depth-2 sublist gets a circle marker (not the same disc as its parent)', () => {
    const { editor, target } = makeEditorWith('<ul><li>one</li><li>two</li></ul>');
    const items = editor.getEditorElement().querySelectorAll('li');
    setCursor(items[1].firstChild, 0);
    handleListTab(editor, false);
    const sub = editor.getEditorElement().querySelector('li ul');
    expect(sub.style.listStyleType).toBe('circle');
    cleanup(editor, target);
  });

  it('indenting a second item into an ALREADY-nested sublist does not clobber its existing style', () => {
    const { editor, target } = makeEditorWith(
      '<ul><li>one<ul style="list-style-type: circle;"><li>two</li></ul></li><li>three</li></ul>'
    );
    const items = editor.getEditorElement().querySelectorAll('li');
    const three = items[items.length - 1];
    setCursor(three.firstChild, 0);
    handleListTab(editor, false);
    const sub = editor.getEditorElement().querySelector('li ul');
    expect(sub.style.listStyleType).toBe('circle'); // unchanged, not re-assigned
    expect(sub.querySelectorAll('li').length).toBe(2); // "two" and "three" both in it
    cleanup(editor, target);
  });
});

describe('Enter on empty list item exits list (T9)', () => {
  it('inserts <p> after list and removes the empty <li>', () => {
    const { editor, target } = makeEditorWith('<ul><li>item</li><li></li></ul>');
    const items = editor.getEditorElement().querySelectorAll('li');
    const emptyLi = items[1];
    emptyLi.innerHTML = '<br>';
    setCursor(emptyLi, 0);
    const handled = handleListEnter(editor);
    expect(handled).toBe(true);
    const p = editor.getEditorElement().querySelector('p');
    expect(p).not.toBeNull();
    expect(editor.getEditorElement().querySelectorAll('li').length).toBe(1);
    cleanup(editor, target);
  });
});

describe('batch command grouping (4.23)', () => {
  it('executes multiple commands inside batch without throwing', () => {
    const { editor, target } = makeEditorWith('<p>hello</p>');
    expect(() => {
      editor.commands.batch(() => {
        editor.commands.execute('alignCenter');
        editor.commands.execute('alignLeft');
      });
    }).not.toThrow();
    cleanup(editor, target);
  });

  it('_batching is false after batch completes', () => {
    const { editor, target } = makeEditorWith('<p>hello</p>');
    editor.commands.batch(() => {});
    expect(editor.commands._batching).toBe(false);
    cleanup(editor, target);
  });
});

describe('handleListTab readonly guard — Q3', () => {
  it('returns false immediately when editor is readonly', () => {
    const target = makeTarget();
    const editor = new OpenEditor(target, { readonly: true });
    editor.getEditorElement().innerHTML = '<ul><li>item</li></ul>';
    const li = editor.getEditorElement().querySelector('li');
    setCursor(li.firstChild || li, 0);
    const result = handleListTab(editor, false);
    expect(result).toBe(false);
    cleanup(editor, target);
  });
});
