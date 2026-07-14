/**
 * code-block.test.js — Phase 13.7: insert code block, Tab-inserts-spaces, and
 * the CRITICAL check that Tab OUTSIDE a code block is left to list/table handling.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestEditor } from '../src/testing/test-harness.js';
import { insertCodeBlock, tabInCode, shiftTabInCode, inCodeBlock } from '../src/plugins/code-block/code-block-dom.js';
import { createCodeBlockPlugin, codeBlockPlugin } from '../src/plugins/code-block/code-block-plugin.js';

let editor;
beforeEach(() => { editor = createTestEditor(); });
afterEach(() => {
  if (!editor.isDestroyed()) editor.destroy();
  if (editor._target && editor._target.parentNode) editor._target.remove();
});

function caretIn(node, off) {
  const r = document.createRange(); r.setStart(node, off); r.collapse(true);
  const s = editor.selection.getWindow().getSelection(); s.removeAllRanges(); s.addRange(r);
}
const key = (k, opts = {}) => ({ key: k, shiftKey: !!opts.shift, preventDefault() {} });
function pasteEvent(html, plain) {
  const e = new window.Event('paste', { bubbles: true, cancelable: true });
  e.clipboardData = { getData: (t) => (t === 'text/html' ? (html || '') : (plain || '')) };
  return e;
}
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('paste inside a code block (audit#3)', () => {
  it('rich HTML pasted in <pre> inserts escaped plain text — no dialog, no <p>/<table>', async () => {
    editor.getEditorElement().innerHTML = '<pre><code>x</code></pre>';
    caretIn(editor.getEditorElement().querySelector('code').firstChild, 1);
    editor.getEditorElement().dispatchEvent(pasteEvent('<p>a</p><table><tr><td>b</td></tr></table>', 'a b'));
    await flush();
    expect(document.querySelector('.oe-modal')).toBeNull();           // no ask-on-paste dialog
    expect(editor.getEditorElement().querySelectorAll('pre').length).toBe(1);
    expect(editor.getEditorElement().querySelector('pre p, pre table')).toBeNull(); // no injected block markup
    expect(editor.getEditorElement().querySelector('code').textContent).toContain('a');
  });
  it('code characters are escaped, not parsed as tags', async () => {
    editor.getEditorElement().innerHTML = '<pre><code>x</code></pre>';
    caretIn(editor.getEditorElement().querySelector('code').firstChild, 1);
    editor.getEditorElement().dispatchEvent(pasteEvent('', 'if (a < b) x++;'));
    await flush();
    expect(editor.getEditorElement().querySelector('code').textContent).toContain('a < b');
  });
});

describe('code-block-dom', () => {
  it('insertCodeBlock inserts a <pre><code> with a language class', () => {
    editor.getEditorElement().innerHTML = '<p>x</p>';
    caretIn(editor.getEditorElement().querySelector('p').firstChild, 1);
    insertCodeBlock(editor, 'javascript');
    const code = editor.getEditorElement().querySelector('pre > code');
    expect(code).not.toBeNull();
    expect(code.className).toBe('language-javascript');
  });

  it('insertCodeBlock with no language omits the class', () => {
    editor.getEditorElement().innerHTML = '<p>x</p>';
    caretIn(editor.getEditorElement().querySelector('p').firstChild, 1);
    insertCodeBlock(editor, '');
    const code = editor.getEditorElement().querySelector('pre > code');
    expect(code).not.toBeNull();
    expect(code.className).toBe('');
  });

  it('tabInCode inserts two spaces at the caret', () => {
    editor.getEditorElement().innerHTML = '<pre><code>ab</code></pre>';
    const code = editor.getEditorElement().querySelector('code').firstChild;
    caretIn(code, 1); // between a and b
    tabInCode(editor);
    expect(editor.getEditorElement().querySelector('code').textContent).toBe('a  b');
  });

  it('shiftTabInCode removes up to two leading spaces before the caret', () => {
    editor.getEditorElement().innerHTML = '<pre><code>  ab</code></pre>';
    const code = editor.getEditorElement().querySelector('code').firstChild;
    caretIn(code, 2); // after the two spaces
    shiftTabInCode(editor);
    expect(editor.getEditorElement().querySelector('code').textContent).toBe('ab');
  });

  it('shiftTabInCode removes only one space when only one precedes', () => {
    editor.getEditorElement().innerHTML = '<pre><code> ab</code></pre>';
    const code = editor.getEditorElement().querySelector('code').firstChild;
    caretIn(code, 1);
    shiftTabInCode(editor);
    expect(editor.getEditorElement().querySelector('code').textContent).toBe('ab');
  });

  it('inCodeBlock detects a <pre> ancestor', () => {
    editor.getEditorElement().innerHTML = '<pre><code>x</code></pre><p>y</p>';
    const root = editor.getEditorElement();
    expect(inCodeBlock(root.querySelector('code').firstChild, root)).toBe(true);
    expect(inCodeBlock(root.querySelector('p').firstChild, root)).toBe(false);
  });
});

describe('code-block plugin — Tab handling & interaction (4.5/11 safety)', () => {
  it('exposes contract + singleton', () => {
    const p = createCodeBlockPlugin();
    expect(p.name).toBe('codeBlock');
    expect(codeBlockPlugin.name).toBe('codeBlock');
  });

  it('Tab INSIDE a code block is consumed and inserts spaces', () => {
    const p = createCodeBlockPlugin(); p.install(editor);
    editor.getEditorElement().innerHTML = '<pre><code>x</code></pre>';
    caretIn(editor.getEditorElement().querySelector('code').firstChild, 1);
    expect(p.onKeyDown(key('Tab'))).toBe(true); // consumed
    expect(editor.getEditorElement().querySelector('code').textContent).toBe('x  ');
  });

  it('Shift+Tab inside a code block outdents (consumed)', () => {
    const p = createCodeBlockPlugin(); p.install(editor);
    editor.getEditorElement().innerHTML = '<pre><code>  x</code></pre>';
    caretIn(editor.getEditorElement().querySelector('code').firstChild, 2);
    expect(p.onKeyDown(key('Tab', { shift: true }))).toBe(true);
    expect(editor.getEditorElement().querySelector('code').textContent).toBe('x');
  });

  it('CRITICAL: Tab OUTSIDE a code block is NOT consumed (list/table Tab still works)', () => {
    const p = createCodeBlockPlugin(); p.install(editor);
    editor.getEditorElement().innerHTML = '<ul><li>item</li></ul>';
    caretIn(editor.getEditorElement().querySelector('li').firstChild, 0);
    expect(p.onKeyDown(key('Tab'))).toBe(false); // NOT consumed → list-indent Tab runs
  });

  it('CRITICAL: Tab in a plain paragraph is NOT consumed', () => {
    const p = createCodeBlockPlugin(); p.install(editor);
    editor.getEditorElement().innerHTML = '<p>text</p>';
    caretIn(editor.getEditorElement().querySelector('p').firstChild, 2);
    expect(p.onKeyDown(key('Tab'))).toBe(false);
  });

  it('Enter INSIDE code inserts a newline and does NOT split the <pre> (audit regression)', () => {
    const p = createCodeBlockPlugin(); p.install(editor);
    editor.getEditorElement().innerHTML = '<pre><code>hello</code></pre>';
    caretIn(editor.getEditorElement().querySelector('code').firstChild, 3);
    expect(p.onKeyDown(key('Enter'))).toBe(true); // consumed
    expect(editor.getEditorElement().querySelectorAll('pre').length).toBe(1); // not split
    const text = editor.getEditorElement().querySelector('code').textContent;
    expect(text).toContain('\n');
    expect(text).toContain('hel');
    expect(text).toContain('lo');
  });

  it('Enter OUTSIDE code is NOT consumed (block-editing split still runs)', () => {
    const p = createCodeBlockPlugin(); p.install(editor);
    editor.getEditorElement().innerHTML = '<p>text</p>';
    caretIn(editor.getEditorElement().querySelector('p').firstChild, 2);
    expect(p.onKeyDown(key('Enter'))).toBe(false);
  });

  it('other non-handled keys are never consumed', () => {
    const p = createCodeBlockPlugin(); p.install(editor);
    editor.getEditorElement().innerHTML = '<pre><code>x</code></pre>';
    caretIn(editor.getEditorElement().querySelector('code').firstChild, 1);
    expect(p.onKeyDown(key('a'))).toBe(false);
  });

  it('isActive reflects being inside a code block', () => {
    const p = createCodeBlockPlugin(); p.install(editor);
    const b = p.getToolbarButtons()[0];
    editor.getEditorElement().innerHTML = '<pre><code>x</code></pre>';
    caretIn(editor.getEditorElement().querySelector('code').firstChild, 1);
    expect(b.isActive(editor)).toBe(true);
    editor.getEditorElement().innerHTML = '<p>y</p>';
    caretIn(editor.getEditorElement().querySelector('p').firstChild, 1);
    expect(b.isActive(editor)).toBe(false);
  });

  it('installs/uninstalls cleanly', () => {
    editor.plugins.install(createCodeBlockPlugin());
    expect(editor.plugins._installed.has('codeBlock')).toBe(true);
    expect(() => editor.plugins.uninstall('codeBlock')).not.toThrow();
  });

  it('a code block survives getHTML sanitization with its language class', () => {
    const p = createCodeBlockPlugin(); p.install(editor);
    editor.getEditorElement().innerHTML = '<p>x</p>';
    caretIn(editor.getEditorElement().querySelector('p').firstChild, 1);
    insertCodeBlock(editor, 'python');
    const html = editor.getHTML();
    expect(html).toMatch(/<pre>/);
    expect(html).toMatch(/language-python/);
  });
});
