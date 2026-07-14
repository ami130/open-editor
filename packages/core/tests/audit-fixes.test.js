import { describe, it, expect } from 'vitest';
import { OpenEditor } from '../src/editor.js';

function makeEditor(html = '<p>hello</p>', config = {}) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  const editor = new OpenEditor(target, config);
  editor.getEditorElement().innerHTML = html;
  return { editor, target };
}
function cleanup(e, t) { if (e && !e.isDestroyed()) e.destroy(); if (t && t.parentNode) t.parentNode.removeChild(t); }
function setCursor(node, offset) {
  const r = document.createRange(); r.setStart(node, offset); r.collapse(true);
  window.getSelection().removeAllRanges(); window.getSelection().addRange(r);
}
function selectAll(node) {
  const r = document.createRange(); r.selectNodeContents(node);
  window.getSelection().removeAllRanges(); window.getSelection().addRange(r);
}

describe('H4: block format commands place cursor correctly (SKIP_RESTORE)', () => {
  it('h2 then paragraph round-trips and keeps content', () => {
    const { editor, target } = makeEditor('<p>hello</p>');
    setCursor(editor.getEditorElement().querySelector('p').firstChild, 0);
    editor.commands.execute('h2');
    expect(editor.getEditorElement().querySelector('h2')).not.toBeNull();
    const h2 = editor.getEditorElement().querySelector('h2');
    setCursor(h2.firstChild, 0);
    editor.commands.execute('paragraph');
    expect(editor.getEditorElement().querySelector('p')).not.toBeNull();
    expect(editor.getEditorElement().textContent).toBe('hello');
    cleanup(editor, target);
  });
});

describe('H9: removeFormat strips class and inline tags', () => {
  it('removes strong/em wrappers and class attributes', () => {
    const { editor, target } = makeEditor('<p><strong class="x">bold</strong> plain</p>');
    const p = editor.getEditorElement().querySelector('p');
    selectAll(p);
    editor.commands.execute('removeFormat');
    const html = editor.getEditorElement().innerHTML;
    expect(html).not.toMatch(/<strong/);
    expect(html).not.toMatch(/class=/);
    expect(editor.getEditorElement().textContent).toMatch(/bold plain/);
    cleanup(editor, target);
  });
});

describe('M6: alignment lands on the li, not the ul container', () => {
  it('alignCenter inside a list item sets text-align on the li', () => {
    const { editor, target } = makeEditor('<ul><li>item</li></ul>');
    const li = editor.getEditorElement().querySelector('li');
    setCursor(li.firstChild, 0);
    editor.commands.execute('alignCenter');
    expect(li.style.textAlign).toBe('center');
    expect(editor.getEditorElement().querySelector('ul').style.textAlign).toBe('');
    cleanup(editor, target);
  });
});

describe('M7: definitionList has no literal placeholder text', () => {
  it('inserts empty dt/dd', () => {
    const { editor, target } = makeEditor('<p>x</p>');
    setCursor(editor.getEditorElement().querySelector('p').firstChild, 0);
    editor.commands.execute('definitionList');
    const dl = editor.getEditorElement().querySelector('dl');
    expect(dl).not.toBeNull();
    expect(dl.textContent).not.toMatch(/Term|Definition/);
    cleanup(editor, target);
  });
});

describe('M10: Enter at end of nested blockquote keeps the new p in the same parent', () => {
  it('new paragraph stays inside the wrapping div, not at root', async () => {
    const { handleBlockquoteEnter } = await import('../src/commands/block-commands.js');
    const { editor, target } = makeEditor('<div id="wrap"><blockquote><p>quote</p><p><br></p></blockquote></div>');
    const lastP = editor.getEditorElement().querySelectorAll('blockquote > p')[1];
    setCursor(lastP, 0);
    const handled = handleBlockquoteEnter(editor);
    expect(handled).toBe(true);
    // The new <p> must live inside #wrap (the blockquote's parent), not the root.
    const wrap = editor.getEditorElement().querySelector('#wrap');
    expect(wrap).not.toBeNull();
    const directPs = Array.from(wrap.children).filter((c) => c.tagName === 'P');
    expect(directPs.length).toBeGreaterThanOrEqual(1);
    cleanup(editor, target);
  });
});

describe('H6: history enforces a byte budget', () => {
  it('drops oldest snapshots when total bytes exceed the cap but keeps >=2', () => {
    const { editor, target } = makeEditor('<p>x</p>');
    const h = editor.history;
    // Push many large snapshots
    const big = '<p>' + 'a'.repeat(200000) + '</p>';
    for (let i = 0; i < 60; i++) {
      editor.getEditorElement().innerHTML = big + '<!--' + i + '-->';
      h.takeSnapshot();
    }
    // Total retained bytes should be bounded well under 60 * 200KB = 12MB
    let total = 0;
    for (const s of h._stack) total += (s.html ? s.html.length : 0);
    expect(total).toBeLessThanOrEqual(5 * 1024 * 1024 + 200000);
    expect(h._stack.length).toBeGreaterThanOrEqual(2);
    cleanup(editor, target);
  });
});

describe('L1: insertNonBreakingSpace inserts U+00A0', () => {
  it('inserts a non-breaking space character', () => {
    const { editor, target } = makeEditor('<p>ab</p>');
    setCursor(editor.getEditorElement().querySelector('p').firstChild, 1);
    editor.commands.execute('insertNonBreakingSpace');
    expect(editor.getEditorElement().textContent).toContain(' ');
    cleanup(editor, target);
  });
});

describe('H2: removeTextColor clears color across selection', () => {
  it('clears color from a styled span', () => {
    const { editor, target } = makeEditor('<p><span style="color: red">hi</span></p>');
    const span = editor.getEditorElement().querySelector('span');
    selectAll(span.firstChild);
    editor.commands.execute('removeTextColor');
    expect(editor.getEditorElement().innerHTML).not.toMatch(/color:/);
    cleanup(editor, target);
  });
});
