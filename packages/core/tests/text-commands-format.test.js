/**
 * Text-command tests — Part B: insertHorizontalRule, insertNonBreakingSpace,
 * bold/italic tag normalization (T3), and custom command registration (4.14).
 * Split from text-commands.test.js to stay within the 300-line limit.
 */
import { describe, it, expect, vi } from 'vitest';
import { OpenEditor } from '../src/editor.js';

function makeTarget() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}
function cleanup(editor, target) {
  if (editor && !editor.isDestroyed()) editor.destroy();
  if (target && target.parentNode) target.parentNode.removeChild(target);
}
function makeEditorWith(html) {
  const target = makeTarget();
  const editor = new OpenEditor(target);
  editor.getEditorElement().innerHTML = html;
  return { editor, target };
}
function setCursor(node, offset = 0) {
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(range);
}
function setRange(startNode, so, endNode, eo) {
  const range = document.createRange();
  range.setStart(startNode, so);
  range.setEnd(endNode, eo);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(range);
}

describe('insertHorizontalRule command (T1)', () => {
  it('inserts an <hr> element', () => {
    const { editor, target } = makeEditorWith('<p>before</p>');
    const p = editor.getEditorElement().querySelector('p');
    setCursor(p.firstChild, 6);
    editor.commands.execute('insertHorizontalRule');
    expect(editor.getEditorElement().querySelector('hr')).not.toBeNull();
    cleanup(editor, target);
  });

  it('places a <p> after the <hr>', () => {
    const { editor, target } = makeEditorWith('<p>before</p>');
    const p = editor.getEditorElement().querySelector('p');
    setCursor(p.firstChild, 0);
    editor.commands.execute('insertHorizontalRule');
    const hr = editor.getEditorElement().querySelector('hr');
    expect(hr).not.toBeNull();
    const afterHr = hr.nextElementSibling;
    expect(afterHr).not.toBeNull();
    expect(afterHr.tagName.toLowerCase()).toBe('p');
    cleanup(editor, target);
  });
});

describe('insertNonBreakingSpace command (T2)', () => {
  it('inserts a non-breaking space character (U+00A0)', () => {
    const { editor, target } = makeEditorWith('<p>ab</p>');
    const p = editor.getEditorElement().querySelector('p');
    setCursor(p.firstChild, 1);
    editor.commands.execute('insertNonBreakingSpace');
    expect(editor.getEditorElement().textContent).toContain(' ');
    cleanup(editor, target);
  });

  it('does not insert a regular space (U+0020) instead of NBSP', () => {
    const { editor, target } = makeEditorWith('<p>ab</p>');
    const p = editor.getEditorElement().querySelector('p');
    setCursor(p.firstChild, 1);
    editor.commands.execute('insertNonBreakingSpace');
    const content = editor.getEditorElement().textContent;
    const nbspIndex = content.indexOf(' ');
    expect(nbspIndex).toBeGreaterThan(-1);
    cleanup(editor, target);
  });
});

describe('tag normalization after bold/italic (T3)', () => {
  it('bold command produces <strong> not <b>', () => {
    const { editor, target } = makeEditorWith('<p>hello</p>');
    const textNode = editor.getEditorElement().querySelector('p').firstChild;
    setRange(textNode, 0, textNode, 5);
    editor.commands.execute('bold');
    expect(editor.getEditorElement().querySelector('b')).toBeNull();
    cleanup(editor, target);
  });

  it('italic command produces <em> not <i>', () => {
    const { editor, target } = makeEditorWith('<p>hello</p>');
    const textNode = editor.getEditorElement().querySelector('p').firstChild;
    setRange(textNode, 0, textNode, 5);
    editor.commands.execute('italic');
    expect(editor.getEditorElement().querySelector('i')).toBeNull();
    cleanup(editor, target);
  });
});

describe('custom command registration (4.14)', () => {
  it('registers and executes a custom command', () => {
    const { editor, target } = makeEditorWith('<p>hello</p>');
    const execute = vi.fn();
    editor.commands.register('myPlugin:doThing', { execute });
    editor.commands.execute('myPlugin:doThing');
    expect(execute).toHaveBeenCalled();
    cleanup(editor, target);
  });

  it('unregister removes custom command (4.15)', () => {
    const { editor, target } = makeEditorWith('<p>hello</p>');
    editor.commands.register('myPlugin:thing', { execute: vi.fn() });
    editor.commands.unregister('myPlugin:thing');
    expect(editor.commands.getAll().has('myPlugin:thing')).toBe(false);
    cleanup(editor, target);
  });

  it('executing an unregistered command returns false', () => {
    const { editor, target } = makeEditorWith('<p>hello</p>');
    expect(editor.commands.execute('nonexistent')).toBe(false);
    cleanup(editor, target);
  });
});
