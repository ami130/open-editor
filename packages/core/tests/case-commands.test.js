/**
 * 17.5.1 — change case: pure transforms + the real command through an editor
 * (markup preservation, cross-node Title Case word state, island safety).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { OpenEditor } from '../src/editor.js';
import { titleCase, simpleCase } from '../src/commands/case-commands.js';

let editor, target;
function make(html) {
  target = document.createElement('div');
  document.body.appendChild(target);
  editor = new OpenEditor(target, {});
  editor.getEditorElement().innerHTML = html;
  return editor;
}
function selectAll() {
  const el = editor.getEditorElement();
  const r = document.createRange();
  r.selectNodeContents(el);
  const s = window.getSelection();
  s.removeAllRanges(); s.addRange(r);
}
afterEach(() => {
  if (editor && !editor.isDestroyed()) editor.destroy();
  if (target && target.parentNode) target.remove();
  editor = target = null;
});

describe('17.5.1 — case transforms (pure)', () => {
  it('simpleCase upper/lower are locale-aware', () => {
    expect(simpleCase('héllo wörld', 'upper')).toBe('HÉLLO WÖRLD');
    expect(simpleCase('HÉLLO', 'lower')).toBe('héllo');
  });

  it('titleCase capitalizes word starts, lowercases the rest', () => {
    expect(titleCase('hello WORLD foo-bar')).toBe('Hello World Foo-Bar');
    expect(titleCase('él arbol único')).toBe('Él Arbol Único');
  });

  it('titleCase carries word state via prevChar (cross-node continuation)', () => {
    // "he" ended a node; "llo world" continues the SAME word.
    expect(titleCase('llo world', 'e')).toBe('llo World');
    // previous char was a space → new word starts.
    expect(titleCase('llo world', ' ')).toBe('Llo World');
  });

  it('titleCase leaves digits/punctuation alone', () => {
    expect(titleCase('3rd place: ok')).toBe('3rd Place: Ok');
  });
});

describe('17.5.1 — changeCase command through a real editor', () => {
  it('uppercases across inline markup without touching the tags', () => {
    make('<p>hello <strong>bold</strong> world</p>');
    selectAll();
    expect(editor.commands.execute('changeCase', 'upper')).toBe(true);
    expect(editor.getHTML()).toBe('<p>HELLO <strong>BOLD</strong> WORLD</p>');
  });

  it('Title Case treats a word split by markup as ONE word', () => {
    make('<p>he<strong>llo</strong> world</p>');
    selectAll();
    editor.commands.execute('changeCase', 'title');
    // "llo" continues "he" — must NOT become "Llo".
    expect(editor.getHTML()).toBe('<p>He<strong>llo</strong> World</p>');
  });

  it('lowercase mode works and is undoable', () => {
    make('<p>x</p>');
    editor.setHTML('<p>SHOUTING TEXT</p>'); // proper path: resets history baseline
    selectAll();
    editor.commands.execute('changeCase', 'lower');
    expect(editor.getHTML()).toContain('shouting text');
    editor.undo();
    expect(editor.getHTML()).toContain('SHOUTING TEXT');
  });

  it('does nothing on a collapsed selection', () => {
    make('<p>hello</p>');
    const el = editor.getEditorElement();
    const r = document.createRange();
    r.setStart(el.firstChild.firstChild, 2);
    r.collapse(true);
    const s = window.getSelection();
    s.removeAllRanges(); s.addRange(r);
    // execute() returns "ran without throwing" (frozen semantics) — assert
    // via content: nothing may change on a collapsed selection.
    editor.commands.execute('changeCase', 'upper');
    expect(editor.getHTML()).toContain('hello');
    expect(editor.getHTML()).not.toContain('HELLO');
  });

  it('rejects an unknown mode', () => {
    make('<p>hello</p>');
    selectAll();
    editor.commands.execute('changeCase', 'sponge');
    expect(editor.getHTML()).toContain('hello'); // content untouched
  });

  it('skips text inside a contenteditable=false island', () => {
    make('<p>before</p>'
      + '<figure contenteditable="false" data-oe-island="image"><figcaption contenteditable="true" data-oe-caption="">cap</figcaption></figure>'
      + '<p>after</p>');
    // The figure's non-editable internals must not be transformed; the
    // editable figcaption and surrounding paragraphs may.
    selectAll();
    editor.commands.execute('changeCase', 'upper');
    const html = editor.getHTML();
    expect(html).toContain('BEFORE');
    expect(html).toContain('AFTER');
    expect(html).toContain('CAP'); // figcaption is contenteditable=true
  });

  it('partial selection transforms only the selected slice', () => {
    make('<p>hello world</p>');
    const textNode = editor.getEditorElement().firstChild.firstChild;
    const r = document.createRange();
    r.setStart(textNode, 0);
    r.setEnd(textNode, 5); // "hello"
    const s = window.getSelection();
    s.removeAllRanges(); s.addRange(r);
    editor.commands.execute('changeCase', 'upper');
    expect(editor.getHTML()).toBe('<p>HELLO world</p>');
  });
});
