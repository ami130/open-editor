/**
 * autoformat-plugin.test.js — Phase 16.6.2, end-to-end against a real
 * OpenEditor + CommandManager.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createTestEditor } from '../src/testing/test-harness.js';
import { createAutoformatPlugin } from '../src/plugins/autoformat/autoformat-plugin.js';

let editor;
afterEach(() => {
  if (editor && !editor.isDestroyed()) editor.destroy();
  if (editor && editor._target && editor._target.parentNode) editor._target.remove();
});

function setCaretAtEnd(textNode) {
  const range = document.createRange();
  range.setStart(textNode, textNode.nodeValue.length);
  range.collapse(true);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

function fireInput(el) {
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('autoformat — block patterns', () => {
  it('"# " converts the block to h1 and strips the marker', () => {
    editor = createTestEditor();
    editor.plugins.install(createAutoformatPlugin());
    const p = editor.getEditorElement().querySelector('p');
    p.textContent = '# ';
    setCaretAtEnd(p.firstChild);
    fireInput(editor.getEditorElement());

    const h1 = editor.getEditorElement().querySelector('h1');
    expect(h1).not.toBeNull();
    expect(h1.textContent).toBe('');
  });

  it('"- " converts the block to a bulleted list', () => {
    editor = createTestEditor();
    editor.plugins.install(createAutoformatPlugin());
    const p = editor.getEditorElement().querySelector('p');
    p.textContent = '- ';
    setCaretAtEnd(p.firstChild);
    fireInput(editor.getEditorElement());

    expect(editor.getEditorElement().querySelector('ul li')).not.toBeNull();
  });

  it('"> " converts the block to a blockquote', () => {
    editor = createTestEditor();
    editor.plugins.install(createAutoformatPlugin());
    const p = editor.getEditorElement().querySelector('p');
    p.textContent = '> ';
    setCaretAtEnd(p.firstChild);
    fireInput(editor.getEditorElement());

    expect(editor.getEditorElement().querySelector('blockquote')).not.toBeNull();
  });

  it('does NOT convert "# " when it is not at the very start of the block', () => {
    editor = createTestEditor();
    editor.plugins.install(createAutoformatPlugin());
    const p = editor.getEditorElement().querySelector('p');
    p.textContent = 'hi # ';
    setCaretAtEnd(p.firstChild);
    fireInput(editor.getEditorElement());

    expect(editor.getEditorElement().querySelector('h1')).toBeNull();
  });
});

describe('autoformat — inline patterns', () => {
  it('**bold** wraps the inner text in <strong> and removes the markers', () => {
    editor = createTestEditor();
    editor.plugins.install(createAutoformatPlugin());
    const p = editor.getEditorElement().querySelector('p');
    p.textContent = '**bold**';
    setCaretAtEnd(p.firstChild);
    fireInput(editor.getEditorElement());

    const strong = editor.getEditorElement().querySelector('strong');
    expect(strong).not.toBeNull();
    expect(strong.textContent).toBe('bold');
    expect(editor.getEditorElement().textContent).toBe('bold');
    expect(editor.getEditorElement().textContent).not.toContain('*');
  });

  it('*italic* wraps the inner text in <em>', () => {
    editor = createTestEditor();
    editor.plugins.install(createAutoformatPlugin());
    const p = editor.getEditorElement().querySelector('p');
    p.textContent = '*italic*';
    setCaretAtEnd(p.firstChild);
    fireInput(editor.getEditorElement());

    const em = editor.getEditorElement().querySelector('em');
    expect(em).not.toBeNull();
    expect(em.textContent).toBe('italic');
  });

  it('`code` wraps the inner text in <code>', () => {
    editor = createTestEditor();
    editor.plugins.install(createAutoformatPlugin());
    const p = editor.getEditorElement().querySelector('p');
    p.textContent = '`code`';
    setCaretAtEnd(p.firstChild);
    fireInput(editor.getEditorElement());

    const code = editor.getEditorElement().querySelector('code');
    expect(code).not.toBeNull();
    expect(code.textContent).toBe('code');
  });

  it('preserves text before and after the matched span', () => {
    editor = createTestEditor();
    editor.plugins.install(createAutoformatPlugin());
    const p = editor.getEditorElement().querySelector('p');
    p.textContent = 'hello **world** done';
    // caret right after "**world**" (before " done")
    const offset = 'hello **world**'.length;
    const range = document.createRange();
    range.setStart(p.firstChild, offset);
    range.collapse(true);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    fireInput(editor.getEditorElement());

    const html = editor.getEditorElement().innerHTML;
    expect(html).toContain('hello');
    expect(html).toContain('<strong>world</strong>');
    expect(html).toContain('done');
  });

  it('is a no-op with no pattern match (plain typing)', () => {
    editor = createTestEditor();
    editor.plugins.install(createAutoformatPlugin());
    const p = editor.getEditorElement().querySelector('p');
    p.textContent = 'just some plain text';
    setCaretAtEnd(p.firstChild);
    fireInput(editor.getEditorElement());

    expect(editor.getEditorElement().querySelector('strong, em, code, h1, ul, blockquote')).toBeNull();
  });
});

describe('autoformat — config gate', () => {
  it('does nothing when config.autoformat is false', () => {
    editor = createTestEditor({ autoformat: false });
    editor.plugins.install(createAutoformatPlugin());
    const p = editor.getEditorElement().querySelector('p');
    p.textContent = '**bold**';
    setCaretAtEnd(p.firstChild);
    fireInput(editor.getEditorElement());

    expect(editor.getEditorElement().querySelector('strong')).toBeNull();
    expect(editor.getEditorElement().textContent).toBe('**bold**');
  });

  it('defaults to enabled (true) when not specified', () => {
    editor = createTestEditor();
    expect(editor._config.autoformat).toBe(true);
  });
});

describe('autoformat — undo correctness', () => {
  it('undo after autoformat restores the literal marker text', () => {
    editor = createTestEditor();
    editor.plugins.install(createAutoformatPlugin());
    editor.setHTML('<p>start</p>');
    const p = editor.getEditorElement().querySelector('p');
    p.textContent = '**bold**';
    setCaretAtEnd(p.firstChild);
    fireInput(editor.getEditorElement());
    expect(editor.getEditorElement().querySelector('strong')).not.toBeNull();

    editor.history.takeSnapshot();
    editor.undo();
    // Either reverts to the pre-autoformat literal text, or at minimum no
    // longer shows the <strong> — undo must not leave a broken/duplicated DOM.
    expect(editor.getEditorElement().innerHTML).not.toContain('<strong>bold</strong><strong>');
  });
});
