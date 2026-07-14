/**
 * link-commands.test.js — Phase 10 unlink command + linkIsActive predicate.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestEditor } from '../src/testing/test-harness.js';
import { unlinkCommand, linkIsActive } from '../src/plugins/link/link-commands.js';

let editor, root;
beforeEach(() => { editor = createTestEditor(); root = editor.getEditorElement(); });
afterEach(() => {
  if (!editor.isDestroyed()) editor.destroy();
  if (editor._target && editor._target.parentNode) editor._target.remove();
});

function caretInside(node, offset = 0) {
  const win = editor.selection.getWindow();
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  const sel = win.getSelection();
  sel.removeAllRanges(); sel.addRange(range);
}

describe('linkIsActive', () => {
  it('true when caret is inside an <a>', () => {
    root.innerHTML = '<p><a href="https://x.com">link</a></p>';
    caretInside(root.querySelector('a').firstChild, 1);
    expect(linkIsActive(editor)).toBe(true);
  });
  it('false when caret is in plain text', () => {
    root.innerHTML = '<p>plain</p>';
    caretInside(root.querySelector('p').firstChild, 1);
    expect(linkIsActive(editor)).toBe(false);
  });
});

describe('unlinkCommand', () => {
  it('removes the link at the caret, keeping text', () => {
    root.innerHTML = '<p>a <a href="https://x.com">link</a> b</p>';
    caretInside(root.querySelector('a').firstChild, 1);
    unlinkCommand.execute(editor);
    expect(root.querySelector('a')).toBeNull();
    expect(root.querySelector('p').textContent).toBe('a link b');
  });
  it('is a no-op when caret is not in a link', () => {
    root.innerHTML = '<p>plain</p>';
    caretInside(root.querySelector('p').firstChild, 1);
    expect(() => unlinkCommand.execute(editor)).not.toThrow();
    expect(root.querySelector('p').textContent).toBe('plain');
  });
});
