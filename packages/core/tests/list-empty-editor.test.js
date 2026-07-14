import { describe, it, expect } from 'vitest';
import { OpenEditor } from '../src/editor.js';

function makeEditor(html) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  const ed = new OpenEditor(target);
  if (html !== undefined) ed.getEditorElement().innerHTML = html;
  return { ed, target };
}

function placeCaretAt(node, offset = 0) {
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(range);
}

function cleanup({ ed, target }) {
  if (ed && !ed.isDestroyed()) ed.destroy();
  if (target && target.parentNode) target.parentNode.removeChild(target);
}

describe('list on empty/fresh editor', () => {
  it('UL on empty editor with <p><br>', () => {
    const ctx = makeEditor('<p><br></p>');
    const p = ctx.ed.getEditorElement().querySelector('p');
    placeCaretAt(p, 0); // cursor inside <p>
    ctx.ed.commands.execute('ul');
    const root = ctx.ed.getEditorElement();
    cleanup(ctx);
    expect(root.querySelector('ul')).not.toBeNull();
  });

  it('UL on editor with plain text paragraph', () => {
    const ctx = makeEditor('<p>Hello</p>');
    const p = ctx.ed.getEditorElement().querySelector('p');
    placeCaretAt(p.firstChild, 2);
    ctx.ed.commands.execute('ul');
    const root = ctx.ed.getEditorElement();
    cleanup(ctx);
    expect(root.querySelector('ul')).not.toBeNull();
  });

  it('indent on first <li> applies marginLeft: 10px (Jodit margin-based)', () => {
    const ctx = makeEditor('<ul><li>only</li></ul>');
    const li = ctx.ed.getEditorElement().querySelector('li');
    placeCaretAt(li.firstChild, 0);
    ctx.ed.commands.execute('indent');
    const root = ctx.ed.getEditorElement();
    cleanup(ctx);
    // Jodit uses marginLeft, not list nesting — applies to any li regardless of position
    expect(root.querySelector('li ul')).toBeNull();
    expect(li.style.marginLeft).toBe('10px');
  });

  it('outdent on <li> with no margin: stays as list item (no structural conversion)', () => {
    const ctx = makeEditor('<ul><li>item</li></ul>');
    const li = ctx.ed.getEditorElement().querySelector('li');
    placeCaretAt(li.firstChild, 0);
    ctx.ed.commands.execute('outdent');
    const root = ctx.ed.getEditorElement();
    cleanup(ctx);
    // No margin to remove — li stays as li, marginLeft stays empty
    expect(root.querySelector('ul')).not.toBeNull();
    expect(li.style.marginLeft).toBe('');
  });
});
