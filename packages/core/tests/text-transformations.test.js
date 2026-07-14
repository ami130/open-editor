/**
 * 17.5.2 — text transformations: pure matcher + the live input path through a
 * real editor (code-context skip, per-group config, undo-to-literal).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { OpenEditor } from '../src/editor.js';
import { createAutoformatPlugin } from '../src/plugins/autoformat/autoformat-plugin.js';
import { matchTransformation, transformationGroups } from '../src/plugins/autoformat/text-transformations.js';

const ALL = transformationGroups(true);

describe('17.5.2 — matcher (pure)', () => {
  it('symbols fire immediately on the closing paren', () => {
    expect(matchTransformation('copyright (c)', ALL)).toEqual({ start: 10, end: 13, replacement: '©' });
    expect(matchTransformation('brand (TM)', ALL)).toEqual({ start: 6, end: 10, replacement: '™' });
    expect(matchTransformation('reg (r)', ALL)).toEqual({ start: 4, end: 7, replacement: '®' });
  });

  it('fractions fire only on a following boundary, not mid-number', () => {
    expect(matchTransformation('take 1/2', ALL)).toBeNull();            // no boundary yet
    expect(matchTransformation('take 1/2 ', ALL)).toEqual({ start: 5, end: 8, replacement: '½' });
    expect(matchTransformation('take 11/2 ', ALL)).toBeNull();          // part of 11/2
    expect(matchTransformation('3/4.', ALL)).toEqual({ start: 0, end: 3, replacement: '¾' });
  });

  it('dashes fire on the following space; 4+ hyphens are left alone', () => {
    expect(matchTransformation('a -- ', ALL)).toEqual({ start: 2, end: 4, replacement: '–' });
    expect(matchTransformation('a --- ', ALL)).toEqual({ start: 2, end: 5, replacement: '—' });
    expect(matchTransformation('a ---- ', ALL)).toBeNull();
  });

  it('smart quotes open after whitespace/start, close otherwise', () => {
    expect(matchTransformation('"', ALL)).toEqual({ start: 0, end: 1, replacement: '“' });
    expect(matchTransformation('say "', ALL)).toEqual({ start: 4, end: 5, replacement: '“' });
    expect(matchTransformation('word"', ALL)).toEqual({ start: 4, end: 5, replacement: '”' });
    expect(matchTransformation("don'", ALL)).toEqual({ start: 3, end: 4, replacement: '’' });
    expect(matchTransformation("say '", ALL)).toEqual({ start: 4, end: 5, replacement: '‘' });
  });

  it('per-group config disables exactly that group', () => {
    const noQuotes = transformationGroups({ smartQuotes: false });
    expect(matchTransformation('word"', noQuotes)).toBeNull();
    expect(matchTransformation('brand (c)', noQuotes)).not.toBeNull();
    expect(matchTransformation('x (c)', transformationGroups(false))).toBeNull();
  });
});

describe('17.5.2 — through a real editor', () => {
  let editor, target;
  function make(config = {}) {
    target = document.createElement('div');
    document.body.appendChild(target);
    editor = new OpenEditor(target, config);
    editor.plugins.install(createAutoformatPlugin());
    return editor;
  }
  function typeInto(node, text) {
    // Simulate the state right after typing: set node text + caret, fire input.
    node.nodeValue = text;
    editor.selection.set(node, text.length, node, text.length);
    editor.getEditorElement().dispatchEvent(new Event('input', { bubbles: true }));
  }
  afterEach(() => {
    if (editor && !editor.isDestroyed()) editor.destroy();
    if (target && target.parentNode) target.remove();
    editor = target = null;
  });

  it('replaces (c) with © at the caret and keeps typing position', () => {
    make();
    editor.setHTML('<p>x</p>');
    const node = editor.getEditorElement().querySelector('p').firstChild;
    typeInto(node, 'copyright (c)');
    expect(node.nodeValue).toBe('copyright ©');
    const sel = editor.selection.get();
    expect(sel.startOffset).toBe('copyright ©'.length);
  });

  it('em-dash on space, with the boundary char preserved after the caret math', () => {
    make();
    editor.setHTML('<p>x</p>');
    const node = editor.getEditorElement().querySelector('p').firstChild;
    typeInto(node, 'wait --- ');
    expect(node.nodeValue).toBe('wait — ');
  });

  it('one undo restores the literal typed text', () => {
    make();
    editor.setHTML('<p>x</p>');
    const node = editor.getEditorElement().querySelector('p').firstChild;
    typeInto(node, 'brand (tm)');
    expect(node.nodeValue).toBe('brand ™');
    editor.undo();
    expect(editor.getText()).toContain('brand (tm)');
  });

  it('never fires inside <code> or <pre>', () => {
    make();
    editor.setHTML('<p>a <code>x</code></p><pre><code>y</code></pre>');
    const codeNode = editor.getEditorElement().querySelector('p code').firstChild;
    typeInto(codeNode, 'quote "');
    expect(codeNode.nodeValue).toBe('quote "'); // untouched
  });

  it('config textTransformations:false disables everything (autoformat stays on)', () => {
    make({ textTransformations: false });
    editor.setHTML('<p>x</p>');
    const node = editor.getEditorElement().querySelector('p').firstChild;
    typeInto(node, 'brand (c)');
    expect(node.nodeValue).toBe('brand (c)');
  });

  it('smart quotes convert as typed', () => {
    make();
    editor.setHTML('<p>x</p>');
    const node = editor.getEditorElement().querySelector('p').firstChild;
    typeInto(node, 'she said "');
    expect(node.nodeValue).toBe('she said “');
    typeInto(node, 'she said “hi"');
    expect(node.nodeValue).toBe('she said “hi”');
  });
});
