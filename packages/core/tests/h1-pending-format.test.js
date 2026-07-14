import { describe, it, expect } from 'vitest';
import { OpenEditor } from '../src/editor.js';

function makeEditor(html = '<p>hello</p>') {
  const target = document.createElement('div');
  document.body.appendChild(target);
  const editor = new OpenEditor(target);
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

describe('H1: pending-format on collapsed cursor', () => {
  it('bold on collapsed cursor inserts empty <strong> with caret inside', () => {
    const { editor, target } = makeEditor('<p>hello</p>');
    const p = editor.getEditorElement().querySelector('p');
    setCursor(p.firstChild, 5); // end of "hello"
    editor.commands.execute('bold');
    const strong = editor.getEditorElement().querySelector('strong');
    expect(strong).not.toBeNull();
    // caret should be inside strong
    const sel = window.getSelection();
    const anchor = sel.anchorNode;
    const inStrong = anchor && (anchor === strong || (anchor.parentNode === strong));
    expect(inStrong).toBe(true);
    cleanup(editor, target);
  });

  it('bold still wraps a non-collapsed selection', () => {
    const { editor, target } = makeEditor('<p>hello</p>');
    const p = editor.getEditorElement().querySelector('p');
    selectAll(p.firstChild);
    editor.commands.execute('bold');
    expect(editor.getEditorElement().querySelector('strong')).not.toBeNull();
    cleanup(editor, target);
  });

  it('bold toggle-off unwraps existing strong', () => {
    const { editor, target } = makeEditor('<p><strong>hello</strong></p>');
    const strong = editor.getEditorElement().querySelector('strong');
    selectAll(strong.firstChild);
    editor.commands.execute('bold');
    expect(editor.getEditorElement().querySelector('strong')).toBeNull();
    expect(editor.getEditorElement().textContent).toMatch(/hello/);
    cleanup(editor, target);
  });

  it('getHTML strips the ZWSP from an empty pending wrapper', () => {
    const { editor, target } = makeEditor('<p>hi</p>');
    const p = editor.getEditorElement().querySelector('p');
    setCursor(p.firstChild, 2);
    editor.commands.execute('italic');
    const out = editor.getHTML();
    // ZWSP must not survive in output
    expect(out).not.toMatch(/\u200B/);
    cleanup(editor, target);
  });
});
