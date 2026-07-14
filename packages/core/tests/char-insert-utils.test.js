/**
 * char-insert-utils.test.js — escapeLinkBoundary (shared by emoji + special-
 * chars plugins). Verifies inserting content after the caret does not
 * silently extend a hyperlink the caret happens to be inside.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createTestEditor } from '../src/testing/test-harness.js';
import { escapeLinkBoundary } from '../src/plugins/chars/char-insert-utils.js';

let editor;
afterEach(() => {
  if (editor && !editor.isDestroyed()) editor.destroy();
});

function setCursorAtEndOf(node) {
  const range = document.createRange();
  range.setStart(node, node.textContent.length);
  range.collapse(true);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

describe('escapeLinkBoundary', () => {
  it('moves the caret to just after the <a> when inside a link', () => {
    editor = createTestEditor();
    editor.setHTML('<p>before <a href="https://x.test">link text</a> after</p>');
    const a = editor.getEditorElement().querySelector('a');
    setCursorAtEndOf(a.firstChild);

    escapeLinkBoundary(editor);
    editor.selection.insertAtCursor('X');

    const html = editor.getHTML();
    expect(html).toContain('<a href="https://x.test">link text</a>X');
    // The inserted character must NOT be inside the <a>.
    expect(html).not.toContain('link textX</a>');
  });

  it('is a no-op when the caret is not inside a link', () => {
    editor = createTestEditor();
    editor.setHTML('<p>plain text</p>');
    const p = editor.getEditorElement().querySelector('p');
    setCursorAtEndOf(p.firstChild);

    escapeLinkBoundary(editor);
    editor.selection.insertAtCursor('X');

    expect(editor.getHTML()).toContain('plain textX');
  });

  it('does not throw when there is no selection or editor is minimal', () => {
    editor = createTestEditor();
    window.getSelection().removeAllRanges();
    expect(() => escapeLinkBoundary(editor)).not.toThrow();
    expect(() => escapeLinkBoundary(null)).not.toThrow();
  });

  it('is a no-op when a RANGE of text inside the link is selected (replace, not escape)', () => {
    editor = createTestEditor();
    editor.setHTML('<p><a href="https://x.test">link text</a></p>');
    const a = editor.getEditorElement().querySelector('a');
    // Select "link text" fully (a real range, not a collapsed caret).
    const range = document.createRange();
    range.selectNodeContents(a.firstChild);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    escapeLinkBoundary(editor); // must NOT collapse/move — selection stays a range
    editor.selection.insertAtCursor('X');

    // insertAtCursor deletes the selected range and inserts in its place — the
    // link's selected text is replaced, not preserved-and-appended-after.
    const html = editor.getHTML();
    expect(html).not.toContain('link text');
    expect(html).toContain('X');
  });
});
