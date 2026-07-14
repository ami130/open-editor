/**
 * Regression tests for partial inline-toggle (bold/italic/underline/etc.).
 *
 * A partial selection inside a formatted run must remove the formatting from
 * exactly that portion — WITHOUT reordering text and WITHOUT leaving empty
 * element husks. These exact-HTML expectations were verified identical in real
 * headless Chromium (jsdom matched Chromium for every case), so they lock in
 * browser-correct behaviour. Split from text-commands-toggle.test.js to stay
 * within the 300-line limit.
 */
import { describe, it, expect } from 'vitest';
import { OpenEditor } from '../src/editor.js';

function makeEditorWith(html) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  const editor = new OpenEditor(target);
  editor.getEditorElement().innerHTML = html;
  return { editor, target };
}
function cleanup(editor, target) {
  if (editor && !editor.isDestroyed()) editor.destroy();
  if (target && target.parentNode) target.parentNode.removeChild(target);
}
function setRange(startNode, so, endNode, eo) {
  const range = document.createRange();
  range.setStart(startNode, so);
  range.setEnd(endNode, eo);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(range);
}

describe('toggleInlineDom partial selection', () => {
  function expectBold(html, sel, s, e, expected) {
    const { editor, target } = makeEditorWith(html);
    const node = editor.getEditorElement().querySelector(sel).firstChild;
    setRange(node, s, node, e);
    editor.commands.execute('bold');
    expect(editor.getEditorElement().innerHTML).toBe(expected);
    cleanup(editor, target);
  }

  it('mid-word: before+after both stay bold, selected unwrapped', () => {
    expectBold('<p><strong>one two three</strong></p>', 'strong', 4, 7,
      '<p><strong>one </strong>two<strong> three</strong></p>');
  });

  it('trailing: only the leading portion stays bold (no empty husk)', () => {
    expectBold('<p><strong>one two three</strong></p>', 'strong', 4, 13,
      '<p><strong>one </strong>two three</p>');
  });

  it('leading: only the trailing portion stays bold (no empty husk)', () => {
    expectBold('<p><strong>one two three</strong></p>', 'strong', 0, 4,
      '<p>one <strong>two three</strong></p>');
  });

  it('nested children: unwrapping leading text keeps the <em> wrapped', () => {
    expectBold('<p><strong>foo<em>bar</em></strong></p>', 'strong', 0, 3,
      '<p>foo<strong><em>bar</em></strong></p>');
  });

  it('nested children: unwrapping the inner <em> text leaves no husk', () => {
    expectBold('<p><strong>foo<em>bar</em></strong></p>', 'em', 0, 3,
      '<p><strong>foo</strong><em>bar</em></p>');
  });

  it('full selection removes the <strong> entirely', () => {
    const { editor, target } = makeEditorWith('<p><strong>hello</strong></p>');
    const strong = editor.getEditorElement().querySelector('strong');
    setRange(strong.firstChild, 0, strong.firstChild, 5);
    editor.commands.execute('bold');
    expect(editor.getEditorElement().innerHTML).toBe('<p>hello</p>');
    cleanup(editor, target);
  });

  it('full selection of a strong with nested children fully unwraps', () => {
    const { editor, target } = makeEditorWith('<p><strong>foo<em>bar</em></strong></p>');
    const strong = editor.getEditorElement().querySelector('strong');
    const r = document.createRange();
    r.selectNodeContents(strong);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(r);
    editor.commands.execute('bold');
    expect(editor.getEditorElement().innerHTML).toBe('<p>foo<em>bar</em></p>');
    cleanup(editor, target);
  });

  it('italic uses the same partial-unwrap path', () => {
    const { editor, target } = makeEditorWith('<p><em>one two three</em></p>');
    const em = editor.getEditorElement().querySelector('em');
    setRange(em.firstChild, 4, em.firstChild, 7);
    editor.commands.execute('italic');
    expect(editor.getEditorElement().innerHTML).toBe(
      '<p><em>one </em>two<em> three</em></p>');
    cleanup(editor, target);
  });
});

describe('inlineCode partial-selection unwrap', () => {
  it('mid-word: before+after stay in <code>, selected portion unwrapped', () => {
    const { editor, target } = makeEditorWith('<p><code>one two three</code></p>');
    const code = editor.getEditorElement().querySelector('code');
    setRange(code.firstChild, 4, code.firstChild, 7);
    editor.commands.execute('inlineCode');
    const codes = editor.getEditorElement().querySelectorAll('code');
    expect(codes.length).toBe(2);
    expect(codes[0].textContent).toBe('one ');
    expect(codes[1].textContent).toBe(' three');
    const unwrapped = Array.from(editor.getEditorElement().querySelector('p').childNodes)
      .filter((n) => n.nodeType === 3).map((n) => n.nodeValue).join('');
    expect(unwrapped).toContain('two');
    cleanup(editor, target);
  });

  it('trailing: leading portion stays in <code>, rest unwrapped', () => {
    const { editor, target } = makeEditorWith('<p><code>one two three</code></p>');
    const code = editor.getEditorElement().querySelector('code');
    setRange(code.firstChild, 4, code.firstChild, 13);
    editor.commands.execute('inlineCode');
    const codes = editor.getEditorElement().querySelectorAll('code');
    expect(codes.length).toBe(1);
    expect(codes[0].textContent).toBe('one ');
    cleanup(editor, target);
  });

  it('leading: trailing portion stays in <code>, rest unwrapped', () => {
    const { editor, target } = makeEditorWith('<p><code>one two three</code></p>');
    const code = editor.getEditorElement().querySelector('code');
    setRange(code.firstChild, 0, code.firstChild, 4);
    editor.commands.execute('inlineCode');
    const codes = editor.getEditorElement().querySelectorAll('code');
    expect(codes.length).toBe(1);
    expect(codes[0].textContent).toBe('two three');
    cleanup(editor, target);
  });
});
