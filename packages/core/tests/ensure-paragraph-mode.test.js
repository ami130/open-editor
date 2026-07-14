/**
 * LOW (audit) — _ensureParagraphMode must wrap loose INLINE ELEMENT children,
 * not only bare text nodes. A loose <strong>/<a>/<span> directly under the
 * editor root (from paste or DOM manipulation) was previously left as an invalid
 * block-level child; now consecutive inline content is grouped into a <p>.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { OpenEditor } from '../src/editor.js';

let editor, target;
beforeEach(() => {
  target = document.createElement('div');
  document.body.appendChild(target);
  editor = new OpenEditor(target);
});
afterEach(() => {
  if (editor && !editor.isDestroyed()) editor.destroy();
  if (target && target.parentNode) target.remove();
});

describe('_ensureParagraphMode — loose inline elements (LOW)', () => {
  it('wraps a loose <strong> child in a <p>', () => {
    const el = editor.getEditorElement();
    el.innerHTML = '<strong>bold</strong>';
    editor._ensureParagraphMode();
    expect(el.children.length).toBe(1);
    expect(el.firstElementChild.tagName).toBe('P');
    expect(el.querySelector('p > strong')).not.toBeNull();
    expect(el.querySelector('p > strong').textContent).toBe('bold');
  });

  it('groups a run of loose inline nodes (text + inline elements) into one <p>', () => {
    const el = editor.getEditorElement();
    el.innerHTML = 'hi <em>there</em> <a href="#">link</a>';
    editor._ensureParagraphMode();
    expect(el.children.length).toBe(1);
    expect(el.firstElementChild.tagName).toBe('P');
    expect(el.querySelector('p > em')).not.toBeNull();
    expect(el.querySelector('p > a')).not.toBeNull();
    expect(el.textContent.trim()).toBe('hi there link');
  });

  it('leaves real block elements untouched', () => {
    const el = editor.getEditorElement();
    el.innerHTML = '<p>one</p><blockquote>two</blockquote><ul><li>x</li></ul>';
    editor._ensureParagraphMode();
    expect(el.querySelector('p').textContent).toBe('one');
    expect(el.querySelector('blockquote')).not.toBeNull();
    expect(el.querySelector('ul > li')).not.toBeNull();
    // No <p> was wrapped around the blockquote/list.
    expect(el.querySelector('p > blockquote')).toBeNull();
    expect(el.querySelector('p > ul')).toBeNull();
  });

  it('splits inline runs separated by a block into separate <p>s', () => {
    const el = editor.getEditorElement();
    el.innerHTML = '<span>a</span><div>block</div><span>b</span>';
    editor._ensureParagraphMode();
    const ps = el.querySelectorAll(':scope > p');
    // "a" and "b" become separate <p>s; the <div> stays between them.
    expect(ps.length).toBe(2);
    expect(el.querySelector(':scope > div')).not.toBeNull();
    expect(ps[0].textContent).toBe('a');
    expect(ps[1].textContent).toBe('b');
  });
});
