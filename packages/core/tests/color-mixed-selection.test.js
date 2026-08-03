import { describe, it, expect } from 'vitest';
import { OpenEditor } from '../src/editor.js';
import { isColorMixed } from '../src/commands/color-commands.js';

function makeEditor(html) {
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
function selectAcross(startNode, so, endNode, eo) {
  const r = document.createRange();
  r.setStart(startNode, so); r.setEnd(endNode, eo);
  window.getSelection().removeAllRanges(); window.getSelection().addRange(r);
}
function setCursor(node, offset) {
  const r = document.createRange(); r.setStart(node, offset); r.collapse(true);
  window.getSelection().removeAllRanges(); window.getSelection().addRange(r);
}

describe('C3: mixed-selection color detection', () => {
  it('reports MIXED when a selection spans two different text colors', () => {
    const { editor, target } = makeEditor(
      '<p><span style="color: rgb(255, 0, 0)">red</span>' +
      '<span style="color: rgb(0, 0, 255)">blue</span></p>'
    );
    const spans = editor.getEditorElement().querySelectorAll('span');
    selectAcross(spans[0].firstChild, 0, spans[1].firstChild, 4);
    expect(isColorMixed(editor, 'color')).toBe(true);
    // the command exposes it too
    expect(editor.commands.get('textColor').isMixed(editor)).toBe(true);
    cleanup(editor, target);
  });

  it('reports MIXED when part of the selection is colored and part is not', () => {
    const { editor, target } = makeEditor(
      '<p><span style="color: rgb(255, 0, 0)">red</span>plain</p>'
    );
    const span = editor.getEditorElement().querySelector('span');
    const p = editor.getEditorElement().querySelector('p');
    selectAcross(span.firstChild, 0, p.lastChild, 5);
    expect(isColorMixed(editor, 'color')).toBe(true);
    cleanup(editor, target);
  });

  it('is NOT mixed when the whole selection is one uniform color', () => {
    const { editor, target } = makeEditor(
      '<p><span style="color: rgb(255, 0, 0)">red red</span></p>'
    );
    const span = editor.getEditorElement().querySelector('span');
    selectAcross(span.firstChild, 0, span.firstChild, 7);
    expect(isColorMixed(editor, 'color')).toBe(false);
    cleanup(editor, target);
  });

  it('is NOT mixed on a collapsed caret (nothing selected)', () => {
    const { editor, target } = makeEditor(
      '<p><span style="color: rgb(255, 0, 0)">red</span></p>'
    );
    const span = editor.getEditorElement().querySelector('span');
    setCursor(span.firstChild, 1);
    expect(isColorMixed(editor, 'color')).toBe(false);
    cleanup(editor, target);
  });

  it('tracks background color independently', () => {
    const { editor, target } = makeEditor(
      '<p><span style="background-color: rgb(255,255,0)">hi</span>' +
      '<span style="background-color: rgb(0,255,0)">yo</span></p>'
    );
    const spans = editor.getEditorElement().querySelectorAll('span');
    selectAcross(spans[0].firstChild, 0, spans[1].firstChild, 2);
    expect(isColorMixed(editor, 'backgroundColor')).toBe(true);
    expect(isColorMixed(editor, 'color')).toBe(false); // no text color anywhere
    cleanup(editor, target);
  });
});
