/**
 * list-tab-gating.test.js — Phase 2 leak-fix regression (Gap #1, keyboard).
 *
 * Tab/Shift+Tab list nesting runs from keydown, NOT through commands.execute, so
 * handleListTab must gate itself on list.indent. When list.indent is withheld,
 * Tab must not nest (returns false → key passes through), leaving the list flat.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { OpenEditor } from '../src/editor.js';
import { handleListTab } from '../src/commands/list-keyboard.js';

let target;
function mount(config) {
  target = document.createElement('div');
  document.body.appendChild(target);
  return new OpenEditor(target, config);
}
// Put the caret at the START of the SECOND <li> (Tab-nest only fires there).
function caretAtSecondLi(ed) {
  ed.focus();
  const lis = ed.getEditorElement().querySelectorAll('li');
  const li = lis[1] || lis[0];
  const node = li.firstChild || li;
  const r = document.createRange(); r.setStart(node, 0); r.collapse(true);
  const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
}
let editor;
afterEach(() => { editor && editor.destroy && editor.destroy(); target && target.remove(); });

const TWO_ITEM_UL = '<ul><li>one</li><li>two</li></ul>';

describe('Phase 2 leak-fix — keyboard Tab list nesting gating', () => {
  it('list.indent NOT granted → Tab does not nest (returns false, list stays flat)', () => {
    editor = mount({ grantedFeatures: ['list.bullet'] }); // list but NOT list.indent
    editor.setHTML(TWO_ITEM_UL);
    caretAtSecondLi(editor);
    const handled = handleListTab(editor, false);
    expect(handled).toBe(false);                 // not handled → key passes through
    // no nested <ul> was created inside an <li>
    expect(editor.getHTML()).toBe('<ul><li>one</li><li>two</li></ul>');
  });

  it('list.indent granted → Tab nests the second item', () => {
    editor = mount({ grantedFeatures: ['list.bullet', 'list.indent'] });
    editor.setHTML(TWO_ITEM_UL);
    caretAtSecondLi(editor);
    const handled = handleListTab(editor, false);
    expect(handled).toBe(true);
    expect(editor.getHTML()).toContain('<ul>'); // nested structure present
    // second item is now nested (a <ul> appears inside the first <li>)
    expect(editor.getEditorElement().querySelector('li ul, li ol')).toBeTruthy();
  });

  it('default grant-all → Tab nests', () => {
    editor = mount({});
    editor.setHTML(TWO_ITEM_UL);
    caretAtSecondLi(editor);
    expect(handleListTab(editor, false)).toBe(true);
  });
});
