/**
 * Regression: inline-format toggle across BLOCK boundaries and over MIXED
 * (partly-formatted) selections.
 *
 * BUG-3: toggling OFF a format on a selection spanning several already-formatted
 *   blocks only unwrapped the FIRST block (start-node's wrapper), leaving later
 *   blocks formatted — the toggle was not reversible across blocks.
 * BUG-4: toggling a selection that STARTS inside the format but extends into
 *   unformatted text used to UNWRAP (removing it from the covered part) instead
 *   of ADDING to the whole selection, which is the Word/Jodit behaviour.
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

function selectAcross(startNode, startOff, endNode, endOff) {
  const r = document.createRange();
  r.setStart(startNode, startOff);
  r.setEnd(endNode, endOff);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(r);
}

describe('cross-block toggle-off (BUG-3)', () => {
  it('un-bolds ALL blocks when the whole multi-block selection is bold', () => {
    editor.getEditorElement().innerHTML = '<p>aaa</p><p>bbb</p>';
    let ps = editor.getEditorElement().querySelectorAll('p');
    selectAcross(ps[0].firstChild, 0, ps[1].firstChild, 3);
    editor.commands.execute('bold'); // ON — both blocks
    expect(editor.getHTML()).toBe('<p><strong>aaa</strong></p><p><strong>bbb</strong></p>');
    ps = editor.getEditorElement().querySelectorAll('p');
    selectAcross(ps[0].querySelector('strong').firstChild, 0,
                 ps[1].querySelector('strong').firstChild, 3);
    editor.commands.execute('bold'); // OFF — must clear BOTH
    expect(editor.getHTML()).toBe('<p>aaa</p><p>bbb</p>');
  });

  it('un-italics all three blocks', () => {
    editor.getEditorElement().innerHTML = '<p><em>a</em></p><p><em>b</em></p><p><em>c</em></p>';
    const ps = editor.getEditorElement().querySelectorAll('p');
    selectAcross(ps[0].querySelector('em').firstChild, 0,
                 ps[2].querySelector('em').firstChild, 1);
    editor.commands.execute('italic');
    expect(editor.getEditorElement().querySelectorAll('em').length).toBe(0);
    expect(editor.getEditorElement().textContent).toBe('abc');
  });
});

describe('mixed-selection toggle adds, not strips (BUG-4)', () => {
  it('bolds the whole selection when it is only partly bold, with no nesting', () => {
    editor.getEditorElement().innerHTML = '<p><strong>abc</strong>def</p>';
    const p = editor.getEditorElement().querySelector('p');
    selectAcross(p.querySelector('strong').firstChild, 1, p.childNodes[1], 2);
    editor.commands.execute('bold');
    const html = editor.getHTML();
    // "bcde" all bold, text intact, no nested <strong><strong>.
    expect(html).not.toMatch(/<strong>\s*<strong>/);
    expect(editor.getEditorElement().textContent).toBe('abcdef');
    // The selected slice "bcde" is bold.
    const bolds = Array.from(editor.getEditorElement().querySelectorAll('strong'))
      .map((s) => s.textContent).join('|');
    expect(bolds).toContain('bcde');
  });

  it('preserves the mid-word partial-unwrap behaviour (fully-covered selection)', () => {
    editor.getEditorElement().innerHTML = '<p><strong>one two three</strong></p>';
    const t = editor.getEditorElement().querySelector('strong').firstChild;
    selectAcross(t, 4, t, 7); // "two"
    editor.commands.execute('bold');
    expect(editor.getHTML()).toBe('<p><strong>one </strong>two<strong> three</strong></p>');
  });
});
