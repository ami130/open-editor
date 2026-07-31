/**
 * list-style-gating.test.js — Phase 2 leak-fix regression (CRITICAL leak #1).
 *
 * toggleListWithStyle() formats via direct DOM (not commands.execute), so it
 * must gate itself. Before the fix, the list-style chevron applied a list +
 * list-style even when the license withheld list.bullet/list.style.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { OpenEditor } from '../src/editor.js';
import { toggleListWithStyle } from '../src/commands/list-commands.js';

let target;
function mount(config) {
  target = document.createElement('div');
  document.body.appendChild(target);
  return new OpenEditor(target, config);
}
function selectAllText(ed) {
  ed.focus();
  const p = ed.getEditorElement().querySelector('p') || ed.getEditorElement();
  const r = document.createRange(); r.selectNodeContents(p);
  const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
}
let editor;
afterEach(() => { editor && editor.destroy && editor.destroy(); target && target.remove(); });

describe('Phase 2 leak-fix — list-style picker gating', () => {
  it('list NOT granted → chevron makes no list at all', () => {
    editor = mount({ grantedFeatures: ['text.bold'] });
    editor.setHTML('<p>hello</p>');
    selectAllText(editor);
    toggleListWithStyle(editor, 'ul', 'square');
    expect(editor.getHTML()).not.toContain('<ul');
    expect(editor.getHTML()).not.toContain('list-style-type');
  });

  it('list granted but list.style NOT granted → makes the list, NO style applied', () => {
    editor = mount({ grantedFeatures: ['list.bullet'] });
    editor.setHTML('<p>hello</p>');
    selectAllText(editor);
    toggleListWithStyle(editor, 'ul', 'square');
    expect(editor.getHTML()).toContain('<ul');
    expect(editor.getHTML()).not.toContain('list-style-type'); // style gated away
  });

  it('both granted → list + style applied', () => {
    editor = mount({ grantedFeatures: ['list.bullet', 'list.style'] });
    editor.setHTML('<p>hello</p>');
    selectAllText(editor);
    toggleListWithStyle(editor, 'ul', 'square');
    expect(editor.getHTML()).toContain('<ul');
    expect(editor.getHTML()).toContain('list-style-type: square');
  });
});
