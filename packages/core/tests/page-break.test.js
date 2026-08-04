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

  it('H1: page break inside a list item hoists OUT to sit after the list', () => {
    make();
    editor.setHTML('<ul><li>item</li></ul>');
    const li = editor.getEditorElement().querySelector('li');
    editor.selection.set(li.firstChild, 2, li.firstChild, 2);   // caret mid-word
    editor.commands.execute('insertPageBreak');
    const root = editor.getEditorElement();
    // No <hr> may live inside the list (invalid + won't break the printed page).
    expect(root.querySelector('li hr, ul hr')).toBeNull();
    // The break is a top-level node after the <ul>, and the item text is intact.
    const hr = root.querySelector('hr.oe-page-break');
    expect(hr.parentElement).toBe(root);
    expect(root.querySelector('li').textContent).toBe('item');   // word not split/lost
  });

  it('H1: page break inside a table cell hoists OUT to sit after the table', () => {
    make();
    editor.setHTML('<table><tbody><tr><td>cell</td></tr></tbody></table>');
    const td = editor.getEditorElement().querySelector('td');
    editor.selection.set(td.firstChild, 2, td.firstChild, 2);
    editor.commands.execute('insertPageBreak');
    const root = editor.getEditorElement();
    expect(root.querySelector('td hr, table hr')).toBeNull();
    expect(root.querySelector('hr.oe-page-break').parentElement).toBe(root);
    expect(root.querySelector('td').textContent).toBe('cell');
  });

  it('H1: page break inside a blockquote hoists OUT to sit after the quote', () => {
    make();
    editor.setHTML('<blockquote><p>quoted</p></blockquote>');
    const p = editor.getEditorElement().querySelector('blockquote p');
    editor.selection.set(p.firstChild, 3, p.firstChild, 3);
    editor.commands.execute('insertPageBreak');
    const root = editor.getEditorElement();
    expect(root.querySelector('blockquote hr')).toBeNull();
    expect(root.querySelector('hr.oe-page-break').parentElement).toBe(root);
  });

  it('H1: a plain paragraph break is NOT hoisted (stays where inserted)', () => {
    make();
    editor.setHTML('<p>hello world</p>');
    const p = editor.getEditorElement().querySelector('p');
    editor.selection.set(p.firstChild, 5, p.firstChild, 5);
    editor.commands.execute('insertPageBreak');
    const hr = editor.getEditorElement().querySelector('hr.oe-page-break');
    expect(hr.parentElement).toBe(editor.getEditorElement());  // top-level already
  });

  it('H6: inserting a page break right after an existing one does NOT stack', () => {
    make();
    editor.setHTML('<p>a</p><hr class="oe-page-break"><p><br></p>');
    const p = editor.getEditorElement().querySelectorAll('p')[1];  // the empty <p> after the break
    editor.selection.set(p, 0, p, 0);
    editor.commands.execute('insertPageBreak');
    // Still exactly ONE page break (the redundant adjacent one was dropped).
    expect(editor.getEditorElement().querySelectorAll('hr.oe-page-break').length).toBe(1);
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
    expect(written).toMatch(/break-after:\s*page/);
    expect(written).toContain('hr.oe-page-break');
    expect(written).toContain('<hr class="oe-page-break">');
    // H2: the full editor stylesheet now travels (was: only the page-break rule)
    expect(written).toContain('.oe-editor');            // base CSS present
    expect(written).toMatch(/--oe-[a-z-]+:/);           // theme tokens present
    expect(written).toContain('<div class="oe-editor">'); // content wrapped so rules match
  });
});
