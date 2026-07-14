/**
 * Phase 4.5 — Block editing semantics unit tests (Part A).
 * Covers: 4.5.1 Enter-split, 4.5.2 Backspace-merge, 4.5.3 Delete-merge,
 *         4.5.4 List item Backspace.
 *
 * Part B (4.5.5–4.5.10) lives in block-editing-2.test.js.
 */
import { describe, it, expect } from 'vitest';
import { OpenEditor } from '../src/editor.js';
import {
  handleEnterSplit, handleBackspace, handleDelete,
} from '../src/editing/block-editing.js';
import { mergeWithPrevious, mergeWithNext } from '../src/editing/block-editing-merge.js';

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

// ─── 4.5.1 Enter-split ───────────────────────────────────────────────────────

describe('4.5.1 — handleEnterSplit', () => {
  it('splits <p> mid-word into two <p> elements', () => {
    const { editor, target } = makeEditorWith('<p>hello world</p>');
    const p = editor.getEditorElement().querySelector('p');
    // Place cursor after 'hello ' (offset 6)
    setCursor(p.firstChild, 6);
    const handled = handleEnterSplit(editor);
    expect(handled).toBe(true);
    const paras = editor.getEditorElement().querySelectorAll('p');
    expect(paras.length).toBe(2);
    expect(paras[0].textContent).toContain('hello');
    expect(paras[1].textContent).toContain('world');
    cleanup(editor, target);
  });

  it('splitting a heading produces a new <p> (not another heading)', () => {
    const { editor, target } = makeEditorWith('<h2>Title text</h2>');
    const h2 = editor.getEditorElement().querySelector('h2');
    setCursor(h2.firstChild, 5); // after 'Title'
    const handled = handleEnterSplit(editor);
    expect(handled).toBe(true);
    expect(editor.getEditorElement().querySelector('h2')).not.toBeNull();
    expect(editor.getEditorElement().querySelector('p')).not.toBeNull();
    cleanup(editor, target);
  });

  it('split at start produces empty first block and full second block', () => {
    const { editor, target } = makeEditorWith('<p>content</p>');
    const p = editor.getEditorElement().querySelector('p');
    setCursor(p.firstChild, 0);
    handleEnterSplit(editor);
    const paras = editor.getEditorElement().querySelectorAll('p');
    expect(paras.length).toBe(2);
    // Second block has the content
    expect(paras[1].textContent.replace(/[\u200B\uFEFF]/g,'')).toContain('content');
    cleanup(editor, target);
  });

  it('split at end produces full first block and empty second block', () => {
    const { editor, target } = makeEditorWith('<p>content</p>');
    const p = editor.getEditorElement().querySelector('p');
    setCursor(p.firstChild, p.firstChild.length);
    handleEnterSplit(editor);
    const paras = editor.getEditorElement().querySelectorAll('p');
    expect(paras.length).toBe(2);
    expect(paras[0].textContent.replace(/[\u200B\uFEFF]/g,'')).toContain('content');
    cleanup(editor, target);
  });

  it('does NOT handle Enter inside <li> (returns false)', () => {
    const { editor, target } = makeEditorWith('<ul><li>item</li></ul>');
    const li = editor.getEditorElement().querySelector('li');
    setCursor(li.firstChild, 2);
    const handled = handleEnterSplit(editor);
    expect(handled).toBe(false);
    cleanup(editor, target);
  });

  it('preserves inline formatting across split', () => {
    const { editor, target } = makeEditorWith('<p><strong>bold</strong> plain</p>');
    const p = editor.getEditorElement().querySelector('p');
    // Place cursor between bold and plain (after strong)
    const strong = p.querySelector('strong');
    setCursor(strong.firstChild, 4); // end of 'bold'
    handleEnterSplit(editor);
    const paras = editor.getEditorElement().querySelectorAll('p');
    expect(paras.length).toBe(2);
    expect(paras[0].querySelector('strong')).not.toBeNull();
    cleanup(editor, target);
  });
});

// ─── 4.5.2 Backspace-merge ───────────────────────────────────────────────────

describe('4.5.2 — mergeWithPrevious', () => {
  it('merges second <p> into first when called directly', () => {
    const { editor, target } = makeEditorWith('<p>first</p><p>second</p>');
    const el = editor.getEditorElement();
    const paras = el.querySelectorAll('p');
    mergeWithPrevious(editor, paras[1]);
    expect(el.querySelectorAll('p').length).toBe(1);
    expect(el.querySelector('p').textContent).toContain('first');
    expect(el.querySelector('p').textContent).toContain('second');
    cleanup(editor, target);
  });

  it('mergeWithPrevious returns false when block has no previous sibling', () => {
    const { editor, target } = makeEditorWith('<p>only</p>');
    const p = editor.getEditorElement().querySelector('p');
    const result = mergeWithPrevious(editor, p);
    expect(result).toBe(false);
    cleanup(editor, target);
  });

  it('handleBackspace at block start triggers merge', () => {
    const { editor, target } = makeEditorWith('<p>first</p><p>second</p>');
    const el = editor.getEditorElement();
    const paras = el.querySelectorAll('p');
    // Place cursor at start of second paragraph
    setCursor(paras[1].firstChild, 0);
    const handled = handleBackspace(editor);
    expect(handled).toBe(true);
    expect(el.querySelectorAll('p').length).toBe(1);
    cleanup(editor, target);
  });

  it('handleBackspace mid-block returns false (not at start)', () => {
    const { editor, target } = makeEditorWith('<p>hello</p>');
    const p = editor.getEditorElement().querySelector('p');
    setCursor(p.firstChild, 3);
    const handled = handleBackspace(editor);
    expect(handled).toBe(false);
    cleanup(editor, target);
  });

  it('preserves inline formatting from both blocks after merge', () => {
    const { editor, target } = makeEditorWith('<p><em>italic</em></p><p><strong>bold</strong></p>');
    const el = editor.getEditorElement();
    const paras = el.querySelectorAll('p');
    // Cursor at start of second paragraph
    const bold = paras[1].querySelector('strong');
    setCursor(bold.firstChild, 0);
    handleBackspace(editor);
    const merged = el.querySelector('p');
    expect(merged.querySelector('em')).not.toBeNull();
    expect(merged.querySelector('strong')).not.toBeNull();
    cleanup(editor, target);
  });
});

// ─── 4.5.3 Delete-merge ──────────────────────────────────────────────────────

describe('4.5.3 — mergeWithNext', () => {
  it('merges next <p> into current when called directly', () => {
    const { editor, target } = makeEditorWith('<p>first</p><p>second</p>');
    const el = editor.getEditorElement();
    const paras = el.querySelectorAll('p');
    mergeWithNext(editor, paras[0]);
    expect(el.querySelectorAll('p').length).toBe(1);
    expect(el.querySelector('p').textContent).toContain('first');
    expect(el.querySelector('p').textContent).toContain('second');
    cleanup(editor, target);
  });

  it('mergeWithNext returns false when block has no next sibling', () => {
    const { editor, target } = makeEditorWith('<p>only</p>');
    const p = editor.getEditorElement().querySelector('p');
    const result = mergeWithNext(editor, p);
    expect(result).toBe(false);
    cleanup(editor, target);
  });

  it('handleDelete at block end triggers merge', () => {
    const { editor, target } = makeEditorWith('<p>first</p><p>second</p>');
    const el = editor.getEditorElement();
    const paras = el.querySelectorAll('p');
    const firstText = paras[0].firstChild;
    setCursor(firstText, firstText.length); // end of first paragraph
    const handled = handleDelete(editor);
    expect(handled).toBe(true);
    expect(el.querySelectorAll('p').length).toBe(1);
    cleanup(editor, target);
  });

  it('handleDelete mid-block returns false (not at end)', () => {
    const { editor, target } = makeEditorWith('<p>hello</p>');
    const p = editor.getEditorElement().querySelector('p');
    setCursor(p.firstChild, 2);
    const handled = handleDelete(editor);
    expect(handled).toBe(false);
    cleanup(editor, target);
  });
});

// ─── 4.5.4 List item Backspace ───────────────────────────────────────────────

describe('4.5.4 — Backspace at list item start', () => {
  it('top-level list item at start converts to <p> after list', () => {
    const { editor, target } = makeEditorWith('<ul><li>item</li></ul>');
    const el = editor.getEditorElement();
    const li = el.querySelector('li');
    setCursor(li.firstChild, 0);
    const handled = handleBackspace(editor);
    expect(handled).toBe(true);
    // The li should be gone or list empty
    const remaining = el.querySelector('p');
    expect(remaining).not.toBeNull();
    expect(remaining.textContent).toContain('item');
    cleanup(editor, target);
  });

  it('nested list item at start outdents (does not delete bullet)', () => {
    const { editor, target } = makeEditorWith(
      '<ul><li>outer<ul><li>inner</li></ul></li></ul>'
    );
    const el = editor.getEditorElement();
    const innerLi = el.querySelector('li ul li');
    setCursor(innerLi.firstChild, 0);
    const handled = handleBackspace(editor);
    expect(handled).toBe(true);
    // innerLi should now be at the top-level list
    const topItems = el.querySelectorAll('ul > li');
    expect(topItems.length).toBeGreaterThanOrEqual(2);
    cleanup(editor, target);
  });
});
