/**
 * Tests that verify Jodit-matching UX for lists.
 * Every test maps to a specific user complaint or Jodit behaviour.
 */
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
function collapsedCursor(node, offset = 0) {
  const r = document.createRange();
  r.setStart(node, offset);
  r.collapse(true);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(r);
}

// ─── GAP 1: collapsed cursor wraps ONLY the current paragraph (Jodit exact) ───
//
// Jodit verified behaviour: cursor in a paragraph wraps ONLY that paragraph.
// Adjacent siblings are NOT pulled in. Multi-paragraph lists require selection.

describe('collapsed cursor wraps only the current paragraph (Jodit exact)', () => {
  it('cursor in single paragraph → that paragraph becomes <li>', () => {
    const ctx = make('<p>hello</p>');
    const p = ctx.ed.getEditorElement().querySelector('p');
    collapsedCursor(p.firstChild, 3);
    ctx.ed.commands.execute('ul');
    const root = ctx.ed.getEditorElement();
    cleanup(ctx);
    expect(root.querySelector('ul li')).not.toBeNull();
    expect(root.querySelector('ul li').textContent).toBe('hello');
  });

  it('cursor in 2nd of 2 paragraphs → only that paragraph wraps (Jodit exact)', () => {
    const ctx = make('<p>hello</p><p>world</p>');
    const p2 = ctx.ed.getEditorElement().querySelectorAll('p')[1];
    collapsedCursor(p2.firstChild, 0);
    ctx.ed.commands.execute('ul');
    const root = ctx.ed.getEditorElement();
    cleanup(ctx);
    // Only "world" becomes a list item; "hello" stays as <p>
    expect(root.querySelectorAll('li').length).toBe(1);
    expect(root.querySelector('li').textContent).toBe('world');
    expect(root.querySelector('p').textContent).toBe('hello');
  });

  it('cursor in 1st of 3 paragraphs → only that one wraps', () => {
    const ctx = make('<p>a</p><p>b</p><p>c</p>');
    const p1 = ctx.ed.getEditorElement().querySelector('p');
    collapsedCursor(p1.firstChild, 0);
    ctx.ed.commands.execute('ol');
    const root = ctx.ed.getEditorElement();
    cleanup(ctx);
    expect(root.querySelectorAll('li').length).toBe(1);
    expect(root.querySelector('li').textContent).toBe('a');
    expect(root.querySelectorAll('p').length).toBe(2); // b and c remain as <p>
  });

  it('to wrap multiple paragraphs, select them all first', () => {
    const ctx = make('<p>a</p><p>b</p><p>c</p>');
    const root = ctx.ed.getEditorElement();
    const range = document.createRange();
    range.selectNodeContents(root);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    ctx.ed.commands.execute('ul');
    cleanup(ctx);
    // All 3 paragraphs selected → all become list items in one list
    expect(root.querySelectorAll('li').length).toBe(3);
    expect(root.querySelectorAll('ul').length).toBe(1);
  });
});

// ─── GAP 2: indent/outdent never disabled ─────────────────────────────────────

describe('indent/outdent never disabled (Jodit behaviour)', () => {
  it('indent is always isEnabled=true', () => {
    const ctx = make('<ul><li>only</li></ul>');
    const li = ctx.ed.getEditorElement().querySelector('li');
    collapsedCursor(li.firstChild, 0);
    expect(ctx.ed.commands.isEnabled('indent')).toBe(true);
    cleanup(ctx);
  });

  it('outdent is always isEnabled=true even outside list', () => {
    const ctx = make('<p>hello</p>');
    const p = ctx.ed.getEditorElement().querySelector('p');
    collapsedCursor(p.firstChild, 0);
    expect(ctx.ed.commands.isEnabled('outdent')).toBe(true);
    cleanup(ctx);
  });

  it('indent on first li applies marginLeft: 10px (Jodit margin-based)', () => {
    const ctx = make('<ul><li>only</li></ul>');
    const li = ctx.ed.getEditorElement().querySelector('li');
    collapsedCursor(li.firstChild, 0);
    ctx.ed.commands.execute('indent');
    const root = ctx.ed.getEditorElement();
    cleanup(ctx);
    // Jodit uses margin, not list nesting — no sub-list appears, but marginLeft is set
    expect(root.querySelector('li ul')).toBeNull();
    expect(li.style.marginLeft).toBe('10px');
  });

  it('outdent outside list (no margin): DOM unchanged', () => {
    const ctx = make('<p>hello</p>');
    const p = ctx.ed.getEditorElement().querySelector('p');
    collapsedCursor(p.firstChild, 0);
    ctx.ed.commands.execute('outdent');
    const after = ctx.ed.getEditorElement().innerHTML;
    cleanup(ctx);
    // No margin to remove → marginLeft cleared, style attribute removed, HTML same
    expect(after).toBe('<p>hello</p>');
  });
});

// ─── GAP 3: toggle off works cleanly ──────────────────────────────────────────

describe('toggle off: click UL again unwraps back to paragraphs', () => {
  it('click UL twice: make list then remove it', () => {
    const ctx = make('<p>hello</p><p>world</p>');
    const p1 = ctx.ed.getEditorElement().querySelector('p');
    collapsedCursor(p1.firstChild, 0);
    ctx.ed.commands.execute('ul'); // make list
    const root = ctx.ed.getEditorElement();
    expect(root.querySelector('ul')).not.toBeNull();

    // Now click UL again with cursor inside the list
    const li = root.querySelector('li');
    collapsedCursor(li.firstChild, 0);
    ctx.ed.commands.execute('ul'); // remove list
    cleanup(ctx);
    expect(root.querySelector('ul')).toBeNull();
    expect(root.querySelectorAll('p').length).toBeGreaterThanOrEqual(1);
  });
});

// ─── GAP 4: indent / outdent work correctly (Jodit margin-based) ─────────────

describe('indent and outdent correctness', () => {
  it('indent on any <li> applies marginLeft: 10px (no list nesting)', () => {
    const ctx = make('<ul><li>one</li><li>two</li></ul>');
    const li2 = ctx.ed.getEditorElement().querySelectorAll('li')[1];
    collapsedCursor(li2.firstChild, 0);
    ctx.ed.commands.execute('indent');
    const root = ctx.ed.getEditorElement();
    cleanup(ctx);
    // Jodit toolbar indent = margin, not structural nesting
    expect(li2.style.marginLeft).toBe('10px');
    expect(root.querySelector('li ul li')).toBeNull();
  });

  it('outdent on <li> with marginLeft reduces margin by 10px', () => {
    const ctx = make('<ul><li style="margin-left:20px">two</li></ul>');
    const li = ctx.ed.getEditorElement().querySelector('li');
    collapsedCursor(li.firstChild, 0);
    ctx.ed.commands.execute('outdent');
    cleanup(ctx);
    expect(li.style.marginLeft).toBe('10px');
  });

  it('outdent on <li> with no margin: marginLeft stays empty (no conversion)', () => {
    const ctx = make('<ul><li>hello</li></ul>');
    const li = ctx.ed.getEditorElement().querySelector('li');
    collapsedCursor(li.firstChild, 0);
    ctx.ed.commands.execute('outdent');
    const root = ctx.ed.getEditorElement();
    cleanup(ctx);
    // Still a list item — outdent removes margin only, no structural conversion
    expect(root.querySelector('ul')).not.toBeNull();
    expect(li.style.marginLeft).toBe('');
  });
});
