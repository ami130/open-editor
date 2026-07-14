/**
 * 17.5.9 — type-around: slot insertion + caret placement + history.
 * (Hover geometry needs real layout — covered by the e2e.)
 */
import { describe, it, expect, afterEach } from 'vitest';
import { OpenEditor } from '../src/editor.js';
import { insertParagraphAtSlot } from '../src/editing/type-around.js';

let editor, target;
function make() {
  target = document.createElement('div');
  document.body.appendChild(target);
  editor = new OpenEditor(target, {});
  return editor;
}
afterEach(() => {
  if (editor && !editor.isDestroyed()) editor.destroy();
  if (target && target.parentNode) target.remove();
  editor = target = null;
});

describe('17.5.9 — type-around insertion', () => {
  it('inserts an escape <p><br></p> before a first-block table, caret inside', () => {
    make();
    editor.setHTML('<table><tbody><tr><td>x</td></tr></tbody></table>');
    const tableEl = editor.getEditorElement().querySelector('table');
    const p = insertParagraphAtSlot(editor, { ref: tableEl, where: 'before' });
    expect(editor.getEditorElement().firstElementChild.tagName).toBe('P');
    expect(p.innerHTML).toBe('<br>');
    const sel = window.getSelection();
    expect(p.contains(sel.anchorNode) || sel.anchorNode === p).toBe(true);
  });

  it('inserts after a last-block figure and is undoable in one step', () => {
    make();
    editor.setHTML('<p>a</p><figure class="oe-figure" contenteditable="false" data-oe-island="image"><figcaption contenteditable="true" data-oe-caption="">c</figcaption></figure>');
    const fig = editor.getEditorElement().querySelector('figure');
    insertParagraphAtSlot(editor, { ref: fig, where: 'after' });
    expect(editor.getEditorElement().lastElementChild.tagName).toBe('P');
    editor.undo();
    expect(editor.getEditorElement().lastElementChild.tagName).toBe('FIGURE');
  });

  it('the affordance element exists in the wrapper and dies with destroy()', () => {
    make();
    expect(target.querySelector('.oe-type-around')).toBeTruthy();
    editor.destroy();
    expect(target.querySelector('.oe-type-around')).toBeNull();
  });
});
