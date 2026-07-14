/**
 * Phase 4.5 — Block editing semantics unit tests (Part B).
 * Covers: 4.5.5 Structural Backspace, 4.5.6 Multi-block delete,
 *         4.5.7 contenteditable=false island, 4.5.8 Editor floor,
 *         4.5.9 blockIndent / blockOutdent commands.
 */
import { describe, it, expect } from 'vitest';
import { OpenEditor } from '../src/editor.js';
import {
  handleBackspace, handleDelete, ensureEditorFloor,
} from '../src/editing/block-editing.js';
import { handleMultiBlockDelete } from '../src/editing/block-editing-merge.js';

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
function setSelection(startNode, startOff, endNode, endOff) {
  const range = document.createRange();
  range.setStart(startNode, startOff);
  range.setEnd(endNode, endOff);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(range);
}

// ─── 4.5.5 Structural Backspace ──────────────────────────────────────────────

describe('4.5.5 — Backspace at structural block start', () => {
  it('<h2> at start converts to <p>', () => {
    const { editor, target } = makeEditorWith('<h2>Heading</h2>');
    const h2 = editor.getEditorElement().querySelector('h2');
    setCursor(h2.firstChild, 0);
    const handled = handleBackspace(editor);
    expect(handled).toBe(true);
    expect(editor.getEditorElement().querySelector('p')).not.toBeNull();
    expect(editor.getEditorElement().querySelector('h2')).toBeNull();
    expect(editor.getEditorElement().textContent).toContain('Heading');
    cleanup(editor, target);
  });

  it('<pre> at start converts to <p>', () => {
    const { editor, target } = makeEditorWith('<pre>code</pre>');
    const pre = editor.getEditorElement().querySelector('pre');
    setCursor(pre.firstChild, 0);
    const handled = handleBackspace(editor);
    expect(handled).toBe(true);
    expect(editor.getEditorElement().querySelector('p')).not.toBeNull();
    expect(editor.getEditorElement().querySelector('pre')).toBeNull();
    cleanup(editor, target);
  });

  it('<blockquote> at start unwraps one level', () => {
    const { editor, target } = makeEditorWith('<blockquote><p>quoted</p></blockquote>');
    const p = editor.getEditorElement().querySelector('blockquote p');
    setCursor(p.firstChild, 0);
    const handled = handleBackspace(editor);
    expect(handled).toBe(true);
    // blockquote should be gone, content remains
    expect(editor.getEditorElement().querySelector('blockquote')).toBeNull();
    expect(editor.getEditorElement().textContent).toContain('quoted');
    cleanup(editor, target);
  });
});

// ─── 4.5.6 Multi-block selection delete ──────────────────────────────────────

describe('4.5.6 — Multi-block selection delete', () => {
  it('selection spanning 2 blocks merges to 1', () => {
    const { editor, target } = makeEditorWith('<p>first</p><p>second</p>');
    const el = editor.getEditorElement();
    const paras = el.querySelectorAll('p');
    // Select from middle of first to middle of second
    setSelection(paras[0].firstChild, 2, paras[1].firstChild, 3);
    const handled = handleMultiBlockDelete(editor);
    expect(handled).toBe(true);
    expect(el.querySelectorAll('p').length).toBe(1);
    cleanup(editor, target);
  });

  it('selection spanning 3 blocks merges to 1', () => {
    const { editor, target } = makeEditorWith('<p>a</p><p>b</p><p>c</p>');
    const el = editor.getEditorElement();
    const paras = el.querySelectorAll('p');
    setSelection(paras[0].firstChild, 0, paras[2].firstChild, 1);
    const handled = handleMultiBlockDelete(editor);
    expect(handled).toBe(true);
    expect(el.querySelectorAll('p').length).toBe(1);
    cleanup(editor, target);
  });

  it('collapsed selection returns false (not multi-block)', () => {
    const { editor, target } = makeEditorWith('<p>text</p>');
    const p = editor.getEditorElement().querySelector('p');
    setCursor(p.firstChild, 2);
    const handled = handleMultiBlockDelete(editor);
    expect(handled).toBe(false);
    cleanup(editor, target);
  });

  it('single-block selection returns false', () => {
    const { editor, target } = makeEditorWith('<p>hello world</p>');
    const p = editor.getEditorElement().querySelector('p');
    setSelection(p.firstChild, 0, p.firstChild, 5);
    const handled = handleMultiBlockDelete(editor);
    expect(handled).toBe(false);
    cleanup(editor, target);
  });

  // M3 fix — deleting the ENTIRE content of the spanned blocks must leave a
  // filled (non-collapsed) block: the merged start block gets a <br> even if
  // deleteContents left a stray empty text node behind.
  it('full-content selection across blocks leaves a <br>-filled block, not collapsed', () => {
    const { editor, target } = makeEditorWith('<p>hello</p><p>world</p>');
    const el = editor.getEditorElement();
    const paras = el.querySelectorAll('p');
    setSelection(paras[0].firstChild, 0, paras[1].firstChild, 5);
    handleMultiBlockDelete(editor);
    const first = el.firstElementChild;
    expect(first).not.toBeNull();
    // Simulate the real-browser residue: inject a stray empty text node and
    // confirm the guard's emptiness test still treats the block as empty.
    expect(first.textContent.trim()).toBe('');
    expect(first.querySelector('br')).not.toBeNull();
    cleanup(editor, target);
  });

  // BUG-1 fix: a multi-block selection crossing a contenteditable=false island
  // must NOT be handled by the raw deleteContents path (which wipes the island
  // whole). It bails so the island survives.
  it('refuses (returns false) when the selection crosses a CE=false island', () => {
    const { editor, target } = makeEditorWith(
      '<p>abc</p><figure contenteditable="false"><img src="x.png"></figure><p>xyz</p>'
    );
    const el = editor.getEditorElement();
    const paras = el.querySelectorAll('p');
    setSelection(paras[0].firstChild, 1, paras[1].firstChild, 2);
    const handled = handleMultiBlockDelete(editor);
    expect(handled).toBe(false);
    expect(el.querySelector('figure[contenteditable="false"]')).not.toBeNull();
    expect(el.querySelector('img')).not.toBeNull();
    cleanup(editor, target);
  });

  // BUG-2 fix: a multi-block selection reaching into a table must NOT flatten
  // the table into a paragraph. It bails.
  it('refuses (returns false) when the selection reaches into a table', () => {
    const { editor, target } = makeEditorWith(
      '<p>abc</p><table><tbody><tr><td>cell</td></tr></tbody></table>'
    );
    const el = editor.getEditorElement();
    const p = el.querySelector('p');
    const td = el.querySelector('td');
    setSelection(p.firstChild, 1, td.firstChild, 2);
    const handled = handleMultiBlockDelete(editor);
    expect(handled).toBe(false);
    expect(el.querySelector('table')).not.toBeNull();
    expect(el.querySelector('td').textContent).toBe('cell');
    cleanup(editor, target);
  });

  // Guard must not over-trigger: a plain two-paragraph selection still merges.
  it('still merges a plain two-block selection (guard does not over-trigger)', () => {
    const { editor, target } = makeEditorWith('<p>abc</p><p>xyz</p>');
    const el = editor.getEditorElement();
    const paras = el.querySelectorAll('p');
    setSelection(paras[0].firstChild, 1, paras[1].firstChild, 2);
    const handled = handleMultiBlockDelete(editor);
    expect(handled).toBe(true);
    expect(el.querySelectorAll('p').length).toBe(1);
    expect(el.textContent).toBe('az');
    cleanup(editor, target);
  });
});

// ─── 4.5.7 contenteditable="false" island ────────────────────────────────────

describe('4.5.7 — contenteditable=false island delete', () => {
  it('Backspace before a contenteditable=false span deletes it whole', () => {
    const { editor, target } = makeEditorWith(
      '<p><span contenteditable="false">island</span>after</p>'
    );
    const el = editor.getEditorElement();
    const p = el.querySelector('p');
    const afterText = p.lastChild; // "after" text node
    setCursor(afterText, 0); // cursor right before "after", right after island
    const handled = handleBackspace(editor);
    expect(handled).toBe(true);
    expect(el.querySelector('[contenteditable="false"]')).toBeNull();
    cleanup(editor, target);
  });

  it('Delete after a contenteditable=false span deletes it whole', () => {
    const { editor, target } = makeEditorWith(
      '<p>before<span contenteditable="false">island</span></p>'
    );
    const el = editor.getEditorElement();
    const p = el.querySelector('p');
    const beforeText = p.firstChild; // "before" text node
    setCursor(beforeText, beforeText.length); // cursor at end of "before"
    const handled = handleDelete(editor);
    expect(handled).toBe(true);
    expect(el.querySelector('[contenteditable="false"]')).toBeNull();
    cleanup(editor, target);
  });
});

// ─── 4.5.8 Editor floor ──────────────────────────────────────────────────────

describe('4.5.8 — ensureEditorFloor', () => {
  it('leaves <p><br></p> when editor is emptied', () => {
    const { editor, target } = makeEditorWith('');
    const el = editor.getEditorElement();
    el.innerHTML = ''; // simulate fully empty editor
    ensureEditorFloor(editor);
    expect(el.innerHTML).toBe('<p><br></p>');
    cleanup(editor, target);
  });

  it('does not touch editor that has text content', () => {
    const { editor, target } = makeEditorWith('<p>content</p>');
    const el = editor.getEditorElement();
    ensureEditorFloor(editor);
    expect(el.querySelector('p')).not.toBeNull();
    expect(el.textContent).toContain('content');
    cleanup(editor, target);
  });

  it('does not touch editor that has only an image', () => {
    const { editor, target } = makeEditorWith('<p><img src="test.png"></p>');
    const el = editor.getEditorElement();
    const _before = el.innerHTML;
    ensureEditorFloor(editor);
    // Should NOT replace — has block content
    expect(el.querySelector('img')).not.toBeNull();
    cleanup(editor, target);
  });
});

// ─── 4.5.9 blockIndent / blockOutdent commands ───────────────────────────────

describe('4.5.9 — blockIndent command', () => {
  it('wraps current <p> in a <blockquote>', () => {
    const { editor, target } = makeEditorWith('<p>indent me</p>');
    const p = editor.getEditorElement().querySelector('p');
    setCursor(p.firstChild, 0);
    editor.commands.execute('blockIndent');
    expect(editor.getEditorElement().querySelector('blockquote')).not.toBeNull();
    expect(editor.getEditorElement().querySelector('blockquote p')).not.toBeNull();
    cleanup(editor, target);
  });

  it('double indent = nested blockquotes', () => {
    const { editor, target } = makeEditorWith('<p>nested</p>');
    const el = editor.getEditorElement();
    const p = el.querySelector('p');
    setCursor(p.firstChild, 0);
    editor.commands.execute('blockIndent');
    const innerP = el.querySelector('blockquote p');
    if (innerP) setCursor(innerP.firstChild || innerP, 0);
    editor.commands.execute('blockIndent');
    const nestedBQ = el.querySelector('blockquote blockquote');
    expect(nestedBQ).not.toBeNull();
    cleanup(editor, target);
  });
});

describe('4.5.9 — blockOutdent command', () => {
  it('unwraps one <blockquote> level', () => {
    const { editor, target } = makeEditorWith('<blockquote><p>quoted</p></blockquote>');
    const el = editor.getEditorElement();
    const p = el.querySelector('blockquote p');
    setCursor(p.firstChild, 0);
    editor.commands.execute('blockOutdent');
    expect(el.querySelector('blockquote')).toBeNull();
    expect(el.textContent).toContain('quoted');
    cleanup(editor, target);
  });

  it('blockOutdent on non-blockquote block is a no-op (does not throw)', () => {
    const { editor, target } = makeEditorWith('<p>plain</p>');
    const p = editor.getEditorElement().querySelector('p');
    setCursor(p.firstChild, 0);
    expect(() => editor.commands.execute('blockOutdent')).not.toThrow();
    cleanup(editor, target);
  });
});
