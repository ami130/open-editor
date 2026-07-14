import { describe, it, expect } from 'vitest';
import { OpenEditor } from '../src/editor.js';

function make(html) {
  const t = document.createElement('div');
  document.body.appendChild(t);
  const ed = new OpenEditor(t);
  ed.getEditorElement().innerHTML = html;
  return { ed, t };
}
function cleanup({ ed, t }) {
  if (!ed.isDestroyed()) ed.destroy();
  if (t.parentNode) t.parentNode.removeChild(t);
}
function selectAll(ed) {
  const root = ed.getEditorElement();
  const range = document.createRange();
  range.selectNodeContents(root);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(range);
}
function cursorIn(node, offset = 0) {
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(range);
}

describe('multi-block list toggle', () => {
  it('two paragraphs → both become <li> in one <ul>', () => {
    const ctx = make('<p>hello</p><p>world</p>');
    selectAll(ctx.ed);
    ctx.ed.commands.execute('ul');
    const root = ctx.ed.getEditorElement();
    const lis = root.querySelectorAll('li');
    const lists = root.querySelectorAll('ul');
    cleanup(ctx);
    expect(lists.length).toBe(1);
    expect(lis.length).toBe(2);
    expect(lis[0].textContent).toBe('hello');
    expect(lis[1].textContent).toBe('world');
  });

  it('three paragraphs → all three become <li> in one <ol>', () => {
    const ctx = make('<p>a</p><p>b</p><p>c</p>');
    selectAll(ctx.ed);
    ctx.ed.commands.execute('ol');
    const root = ctx.ed.getEditorElement();
    const lis = root.querySelectorAll('li');
    cleanup(ctx);
    expect(root.querySelectorAll('ol').length).toBe(1);
    expect(lis.length).toBe(3);
  });

  it('toggle UL off → all <li>s unwrap back to <p>', () => {
    const ctx = make('<ul><li>hello</li><li>world</li></ul>');
    // place cursor inside first li
    const li = ctx.ed.getEditorElement().querySelector('li');
    cursorIn(li.firstChild, 0);
    ctx.ed.commands.execute('ul');
    const root = ctx.ed.getEditorElement();
    cleanup(ctx);
    expect(root.querySelector('ul')).toBeNull();
    expect(root.querySelectorAll('p').length).toBeGreaterThanOrEqual(1);
  });

  it('UL → click OL converts list type', () => {
    const ctx = make('<ul><li>hello</li><li>world</li></ul>');
    const li = ctx.ed.getEditorElement().querySelector('li');
    cursorIn(li.firstChild, 0);
    ctx.ed.commands.execute('ol');
    const root = ctx.ed.getEditorElement();
    cleanup(ctx);
    expect(root.querySelector('ul')).toBeNull();
    expect(root.querySelector('ol')).not.toBeNull();
    expect(root.querySelectorAll('li').length).toBe(2);
  });
});

describe('indent / outdent', () => {
  it('indent on <li> applies marginLeft: 10px (Jodit margin-based)', () => {
    const ctx = make('<ul><li>one</li><li>two</li></ul>');
    const li2 = ctx.ed.getEditorElement().querySelectorAll('li')[1];
    cursorIn(li2.firstChild, 0);
    ctx.ed.commands.execute('indent');
    const root = ctx.ed.getEditorElement();
    cleanup(ctx);
    expect(li2.style.marginLeft).toBe('10px');
    // No list nesting — Jodit uses margin, not structural nesting for toolbar indent
    expect(root.querySelector('li ul, li ol')).toBeNull();
  });

  it('indent on first <li>: applies marginLeft 10px', () => {
    const ctx = make('<ul><li>only</li></ul>');
    const li = ctx.ed.getEditorElement().querySelector('li');
    cursorIn(li.firstChild, 0);
    ctx.ed.commands.execute('indent');
    cleanup(ctx);
    expect(li.style.marginLeft).toBe('10px');
  });

  it('indent on <p> applies marginLeft: 10px', () => {
    const ctx = make('<p>hello</p>');
    const p = ctx.ed.getEditorElement().querySelector('p');
    cursorIn(p.firstChild, 0);
    ctx.ed.commands.execute('indent');
    cleanup(ctx);
    expect(p.style.marginLeft).toBe('10px');
  });

  it('outdent reduces marginLeft by 10px, removes at 0', () => {
    const ctx = make('<p style="margin-left:10px">hello</p>');
    const p = ctx.ed.getEditorElement().querySelector('p');
    cursorIn(p.firstChild, 0);
    ctx.ed.commands.execute('outdent');
    cleanup(ctx);
    // 10px - 10px = 0 → style removed, never negative
    expect(p.style.marginLeft).toBe('');
  });

  it('indent/outdent are always enabled (Jodit: never disabled)', () => {
    const ctx = make('<ul><li>one</li><li>two</li></ul>');
    const lis = ctx.ed.getEditorElement().querySelectorAll('li');

    cursorIn(lis[0].firstChild, 0);
    expect(ctx.ed.commands.isEnabled('indent')).toBe(true);

    cursorIn(lis[1].firstChild, 0);
    expect(ctx.ed.commands.isEnabled('indent')).toBe(true);

    cleanup(ctx);
  });

  it('indent/outdent outside list: always enabled, applies margin', () => {
    const ctx = make('<p>hello</p><ul><li>item</li></ul>');
    const p = ctx.ed.getEditorElement().querySelector('p');
    cursorIn(p.firstChild, 0);
    expect(ctx.ed.commands.isEnabled('outdent')).toBe(true);
    expect(ctx.ed.commands.isEnabled('indent')).toBe(true);

    const li = ctx.ed.getEditorElement().querySelector('li');
    cursorIn(li.firstChild, 0);
    expect(ctx.ed.commands.isEnabled('outdent')).toBe(true);

    cleanup(ctx);
  });

  it('multiple indent steps accumulate correctly', () => {
    const ctx = make('<p>hello</p>');
    const p = ctx.ed.getEditorElement().querySelector('p');
    cursorIn(p.firstChild, 0);
    ctx.ed.commands.execute('indent');
    ctx.ed.commands.execute('indent');
    ctx.ed.commands.execute('indent');
    cleanup(ctx);
    expect(p.style.marginLeft).toBe('30px');
  });
});
