/**
 * link-behaviors.test.js — Phase 10 auxiliary behaviours.
 * Covers: paste autolink (lone URL vs. non-URL), readonly click guard,
 * dbl-click open gated by config.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestEditor } from '../src/testing/test-harness.js';
import {
  installPasteAutolink, installTypedAutolink, installDblClickOpen, installReadonlyNavGuard,
} from '../src/plugins/link/link-behaviors.js';

let editor;
beforeEach(() => { editor = createTestEditor(); });
afterEach(() => {
  if (!editor.isDestroyed()) editor.destroy();
  if (editor._target && editor._target.parentNode) editor._target.remove();
});

function makePasteEvent(plain, html) {
  const e = new window.Event('paste', { bubbles: true, cancelable: true });
  e.clipboardData = {
    getData(type) {
      if (type === 'text/html') return html || '';
      if (type === 'text/plain') return plain || '';
      return '';
    },
  };
  return e;
}

function caretInEditor() {
  const el = editor.getEditorElement();
  el.innerHTML = '<p>x</p>';
  const p = el.querySelector('p');
  editor.selection.set(p.firstChild, 1);
}

describe('installPasteAutolink', () => {
  it('wraps a lone pasted URL into an <a>', () => {
    installPasteAutolink(editor);
    caretInEditor();
    editor.getEditorElement().dispatchEvent(makePasteEvent('https://example.com'));
    const a = editor.getEditorElement().querySelector('a');
    expect(a).toBeTruthy();
    expect(a.getAttribute('href')).toBe('https://example.com');
    expect(a.textContent).toBe('https://example.com');
  });

  it('does NOT wrap non-URL text (multi-word)', () => {
    installPasteAutolink(editor);
    caretInEditor();
    const e = makePasteEvent('hello world this is text');
    editor.getEditorElement().dispatchEvent(e);
    expect(editor.getEditorElement().querySelector('a')).toBeNull();
  });

  it('does NOT wrap a bare relative path', () => {
    installPasteAutolink(editor);
    caretInEditor();
    const e = makePasteEvent('/some/path');
    editor.getEditorElement().dispatchEvent(e);
    expect(editor.getEditorElement().querySelector('a')).toBeNull();
  });

  it('strips trailing sentence punctuation from the href (LOW)', () => {
    installPasteAutolink(editor);
    caretInEditor();
    editor.getEditorElement().dispatchEvent(makePasteEvent('https://example.com/page.'));
    const a = editor.getEditorElement().querySelector('a');
    expect(a).toBeTruthy();
    expect(a.getAttribute('href')).toBe('https://example.com/page');
  });

  it('strips a trailing closing paren from the href (LOW)', () => {
    installPasteAutolink(editor);
    caretInEditor();
    editor.getEditorElement().dispatchEvent(makePasteEvent('https://example.com/x)'));
    expect(editor.getEditorElement().querySelector('a').getAttribute('href'))
      .toBe('https://example.com/x');
  });

  it('does NOT autolink when the caret is inside a <code> element (LOW)', () => {
    installPasteAutolink(editor);
    const el = editor.getEditorElement();
    el.innerHTML = '<p><code>x</code></p>';
    const code = el.querySelector('code');
    editor.selection.set(code.firstChild, 1);
    editor.getEditorElement().dispatchEvent(makePasteEvent('https://example.com'));
    expect(el.querySelector('a')).toBeNull();
  });

  it('does NOT autolink when the caret is inside a <pre> element (LOW)', () => {
    installPasteAutolink(editor);
    const el = editor.getEditorElement();
    el.innerHTML = '<pre>x</pre>';
    const pre = el.querySelector('pre');
    editor.selection.set(pre.firstChild, 1);
    editor.getEditorElement().dispatchEvent(makePasteEvent('https://example.com'));
    expect(el.querySelector('a')).toBeNull();
  });

  it('does NOT create a NEW link when the caret is inside an existing <a> (LOW)', () => {
    installPasteAutolink(editor);
    const el = editor.getEditorElement();
    el.innerHTML = '<p><a href="https://old.test">old</a></p>';
    const a = el.querySelector('a');
    editor.selection.set(a.firstChild, 1);
    editor.getEditorElement().dispatchEvent(makePasteEvent('https://example.com'));
    // Autolink must not have run — no anchor pointing at the pasted URL exists.
    const hrefs = Array.from(el.querySelectorAll('a')).map((x) => x.getAttribute('href'));
    expect(hrefs).not.toContain('https://example.com');
  });

  it('is disabled when linkAutoDetect is false', () => {
    editor._config.linkAutoDetect = false;
    installPasteAutolink(editor);
    caretInEditor();
    const e = makePasteEvent('https://example.com');
    editor.getEditorElement().dispatchEvent(e);
    // core paste path still runs; our autolink must not have created an <a>.
    expect(e.defaultPrevented).toBe(true); // core preventDefault on plain text
    expect(editor.getEditorElement().querySelector('a')).toBeNull();
  });
});

describe('installTypedAutolink (16.7.2)', () => {
  function setCaretAtEnd(p) {
    const text = p.firstChild;
    editor.selection.set(text, text.nodeValue.length);
    return text;
  }

  it('space after a bare URL wraps it in an <a>, preserving text before it', () => {
    installTypedAutolink(editor);
    const el = editor.getEditorElement();
    el.innerHTML = '<p>check https://example.com/page </p>'; // trailing space already "typed"
    const text = setCaretAtEnd(el.querySelector('p'));
    editor.emit('input', { data: ' ' });
    const a = el.querySelector('a');
    expect(a).toBeTruthy();
    expect(a.getAttribute('href')).toBe('https://example.com/page');
    expect(a.textContent).toBe('https://example.com/page');
    expect(el.querySelector('p').textContent).toBe('check https://example.com/page ');
    void text;
  });

  it('non-breaking-space trigger (contenteditable often substitutes nbsp) also wraps it', () => {
    installTypedAutolink(editor);
    const el = editor.getEditorElement();
    el.innerHTML = '<p>https://example.com/nbsp </p>';
    setCaretAtEnd(el.querySelector('p'));
    editor.emit('input', { data: ' ' });
    const a = el.querySelector('a');
    expect(a).toBeTruthy();
    expect(a.getAttribute('href')).toBe('https://example.com/nbsp');
  });

  it('does NOT wrap a non-URL word', () => {
    installTypedAutolink(editor);
    const el = editor.getEditorElement();
    el.innerHTML = '<p>hello world </p>';
    setCaretAtEnd(el.querySelector('p'));
    editor.emit('input', { data: ' ' });
    expect(el.querySelector('a')).toBeNull();
  });

  it('does NOT wrap a YouTube URL (claimed by media auto-embed instead)', () => {
    installTypedAutolink(editor);
    const el = editor.getEditorElement();
    el.innerHTML = '<p>https://www.youtube.com/watch?v=dQw4w9WgXcQ </p>';
    setCaretAtEnd(el.querySelector('p'));
    editor.emit('input', { data: ' ' });
    expect(el.querySelector('a')).toBeNull();
  });

  it('does NOT wrap inside a <pre>/<code> context', () => {
    installTypedAutolink(editor);
    const el = editor.getEditorElement();
    el.innerHTML = '<pre><code>https://example.com/page </code></pre>';
    setCaretAtEnd(el.querySelector('code'));
    editor.emit('input', { data: ' ' });
    expect(el.querySelector('a')).toBeNull();
  });

  it('is disabled when linkAutoDetect is false', () => {
    editor._config.linkAutoDetect = false;
    installTypedAutolink(editor);
    const el = editor.getEditorElement();
    el.innerHTML = '<p>https://example.com/page </p>';
    setCaretAtEnd(el.querySelector('p'));
    editor.emit('input', { data: ' ' });
    expect(el.querySelector('a')).toBeNull();
  });

  it('Enter (afterCommand:enterSplit) wraps a bare URL at the end of the PREVIOUS block', () => {
    installTypedAutolink(editor);
    const el = editor.getEditorElement();
    el.innerHTML = '<p>https://example.com/page2</p><p><br></p>';
    // Simulate the cursor having moved into the new (second) block, exactly
    // as handleEnterSplit leaves it before emitting afterCommand.
    const secondP = el.querySelectorAll('p')[1];
    editor.selection.set(secondP, 0);
    editor.emit('afterCommand', { command: 'enterSplit' });
    const a = el.querySelector('a');
    expect(a).toBeTruthy();
    expect(a.getAttribute('href')).toBe('https://example.com/page2');
    // The cursor must NOT have been moved back into the old (now-linked) block.
    const info = editor.selection.get();
    expect(el.querySelectorAll('p')[1].contains(info.startNode)).toBe(true);
  });

  it('other afterCommand payloads are ignored', () => {
    installTypedAutolink(editor);
    const el = editor.getEditorElement();
    el.innerHTML = '<p>https://example.com/page3</p><p><br></p>';
    expect(() => editor.emit('afterCommand', { command: 'bold' })).not.toThrow();
    expect(el.querySelector('a')).toBeNull();
  });
});

describe('installReadonlyNavGuard', () => {
  it('prevents click navigation while readonly (default on)', () => {
    installReadonlyNavGuard(editor);
    editor.getEditorElement().innerHTML = '<p><a href="https://x.test">x</a></p>';
    editor.setReadOnly(true);
    const a = editor.getEditorElement().querySelector('a');
    const e = new window.Event('click', { bubbles: true, cancelable: true });
    a.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  });

  it('does NOT prevent click when not readonly', () => {
    installReadonlyNavGuard(editor);
    editor.getEditorElement().innerHTML = '<p><a href="https://x.test">x</a></p>';
    editor.setReadOnly(false);
    const a = editor.getEditorElement().querySelector('a');
    const e = new window.Event('click', { bubbles: true, cancelable: true });
    a.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
  });
});

describe('installDblClickOpen', () => {
  it('does nothing by default (config off)', () => {
    const spy = vi.spyOn(window, 'open').mockImplementation(() => null);
    installDblClickOpen(editor);
    editor.getEditorElement().innerHTML = '<p><a href="https://x.test">x</a></p>';
    const a = editor.getEditorElement().querySelector('a');
    a.dispatchEvent(new window.Event('dblclick', { bubbles: true, cancelable: true }));
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('opens a safe href when linkFollowOnDblClick is true', () => {
    const spy = vi.spyOn(window, 'open').mockImplementation(() => null);
    editor._config.linkFollowOnDblClick = true;
    installDblClickOpen(editor);
    editor.getEditorElement().innerHTML = '<p><a href="https://x.test">x</a></p>';
    const a = editor.getEditorElement().querySelector('a');
    a.dispatchEvent(new window.Event('dblclick', { bubbles: true, cancelable: true }));
    expect(spy).toHaveBeenCalledWith('https://x.test', '_blank', 'noopener');
    spy.mockRestore();
  });

  it('returns a cleanup fn that detaches the handler', () => {
    const spy = vi.spyOn(window, 'open').mockImplementation(() => null);
    editor._config.linkFollowOnDblClick = true;
    const cleanup = installDblClickOpen(editor);
    cleanup();
    editor.getEditorElement().innerHTML = '<p><a href="https://x.test">x</a></p>';
    const a = editor.getEditorElement().querySelector('a');
    a.dispatchEvent(new window.Event('dblclick', { bubbles: true, cancelable: true }));
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
