/**
 * 17.5.3 — page break: command, sanitizer round-trip, print CSS.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { OpenEditor } from '../src/editor.js';

let editor, target;
function make() {
  target = document.createElement('div');
  document.body.appendChild(target);
  editor = new OpenEditor(target, {});
  return editor;
}
afterEach(() => {
  if (editor && !editor.isDestroyed()) editor.destroy();
  if (target && target.parentNode) target.remove();
  editor = target = null;
});

describe('17.5.3 — insertPageBreak', () => {
  it('inserts <hr class="oe-page-break"> and leaves the caret in a following <p>', () => {
    make();
    editor.setHTML('<p>above</p>');
    const p = editor.getEditorElement().querySelector('p');
    editor.selection.set(p.firstChild, 5, p.firstChild, 5);
    editor.commands.execute('insertPageBreak');
    const html = editor.getHTML();
    expect(html).toContain('<hr class="oe-page-break">');
    // A paragraph exists after the break so typing can continue.
    const hr = editor.getEditorElement().querySelector('hr.oe-page-break');
    expect(hr.nextElementSibling && hr.nextElementSibling.tagName).toBe('P');
  });

  it('survives a setHTML round-trip (class preserved, no <br> injected into the hr)', () => {
    make();
    editor.setHTML('<p>a</p><hr class="oe-page-break"><p>b</p>');
    const out = editor.getHTML();
    expect(out).toContain('<hr class="oe-page-break">');
    editor.setHTML(out);
    expect(editor.getHTML()).toContain('<hr class="oe-page-break">');
  });

  it('plain insertHorizontalRule is unaffected (no class)', () => {
    make();
    editor.setHTML('<p>x</p>');
    const p = editor.getEditorElement().querySelector('p');
    editor.selection.set(p.firstChild, 1, p.firstChild, 1);
    editor.commands.execute('insertHorizontalRule');
    const hr = editor.getEditorElement().querySelector('hr');
    expect(hr.className).toBe('');
  });

  it('print() ships the page-break CSS into the print document', () => {
    make();
    editor.setHTML('<p>a</p><hr class="oe-page-break"><p>b</p>');
    let written = '';
    const fakeWin = {
      document: { write: (s) => { written += s; }, close() {} },
      focus() {}, print() {},
    };
    const orig = window.open;
    window.open = () => fakeWin;
    try { editor.print(); } finally { window.open = orig; }
    expect(written).toContain('break-after:page');
    expect(written).toContain('hr.oe-page-break');
    expect(written).toContain('<hr class="oe-page-break">');
  });
});
