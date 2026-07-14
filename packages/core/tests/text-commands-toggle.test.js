/**
 * Text-command tests — Part A: command registration, bold/italic/underline/
 * inlineCode toggle (isActive + execute), selectAll, insertHTML, insertText,
 * and beforeCommand/afterCommand events.
 * Split from text-commands.test.js to stay within the 300-line limit.
 */
import { describe, it, expect, vi } from 'vitest';
import { OpenEditor } from '../src/editor.js';

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
function setRange(startNode, so, endNode, eo) {
  const range = document.createRange();
  range.setStart(startNode, so);
  range.setEnd(endNode, eo);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(range);
}

describe('editor.commands integration', () => {
  it('editor.commands is a CommandManager after construction', () => {
    const target = makeTarget();
    const editor = new OpenEditor(target);
    expect(editor.commands).not.toBeNull();
    expect(typeof editor.commands.execute).toBe('function');
    cleanup(editor, target);
  });

  it('editor.commands is null after destroy()', () => {
    const target = makeTarget();
    const editor = new OpenEditor(target);
    editor.destroy();
    expect(editor.commands).toBeNull();
    target.parentNode && target.parentNode.removeChild(target);
  });

  it('all built-in command names are registered', () => {
    const target = makeTarget();
    const editor = new OpenEditor(target);
    const expected = [
      'bold', 'italic', 'underline', 'strikethrough',
      'superscript', 'subscript', 'inlineCode',
      'removeFormat', 'selectAll', 'cut', 'copyAsPlainText',
      'insertHTML', 'insertText', 'insertHorizontalRule', 'insertNonBreakingSpace',
      'fontFamily', 'lineHeight', 'letterSpacing', 'textIndent',
      'textTransform', 'fontWeight', 'overline', 'dottedUnderline',
      'paragraph', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'blockquote', 'pre',
      'alignLeft', 'alignCenter', 'alignRight', 'alignJustify',
      'writingMode',
      'ul', 'ol', 'indent', 'outdent',
      'listStyleType', 'setListStart', 'definitionList',
    ];
    const all = editor.commands.getAll();
    for (const name of expected) {
      expect(all.has(name), `missing command: ${name}`).toBe(true);
    }
    cleanup(editor, target);
  });
});

describe('bold command', () => {
  it('isActive returns false when cursor is not in bold text', () => {
    const { editor, target } = makeEditorWith('<p>hello</p>');
    const textNode = editor.getEditorElement().querySelector('p').firstChild;
    setCursor(textNode, 2);
    expect(editor.commands.isActive('bold')).toBe(false);
    cleanup(editor, target);
  });

  it('isActive returns true when cursor is inside <strong>', () => {
    const { editor, target } = makeEditorWith('<p><strong>bold</strong></p>');
    const textNode = editor.getEditorElement().querySelector('strong').firstChild;
    setCursor(textNode, 1);
    expect(editor.commands.isActive('bold')).toBe(true);
    cleanup(editor, target);
  });

  it('execute does not throw', () => {
    const { editor, target } = makeEditorWith('<p>hello</p>');
    const textNode = editor.getEditorElement().querySelector('p').firstChild;
    setRange(textNode, 0, textNode, 5);
    expect(() => editor.commands.execute('bold')).not.toThrow();
    cleanup(editor, target);
  });
});

describe('italic command', () => {
  it('isActive returns true when cursor is inside <em>', () => {
    const { editor, target } = makeEditorWith('<p><em>italic</em></p>');
    const textNode = editor.getEditorElement().querySelector('em').firstChild;
    setCursor(textNode, 1);
    expect(editor.commands.isActive('italic')).toBe(true);
    cleanup(editor, target);
  });

  it('isActive returns false outside <em>', () => {
    const { editor, target } = makeEditorWith('<p>plain</p>');
    setCursor(editor.getEditorElement().querySelector('p').firstChild, 1);
    expect(editor.commands.isActive('italic')).toBe(false);
    cleanup(editor, target);
  });
});

describe('underline command', () => {
  it('isActive returns true inside <u>', () => {
    const { editor, target } = makeEditorWith('<p><u>under</u></p>');
    setCursor(editor.getEditorElement().querySelector('u').firstChild, 0);
    expect(editor.commands.isActive('underline')).toBe(true);
    cleanup(editor, target);
  });
});

describe('inlineCode command', () => {
  it('isActive returns true when cursor is inside <code>', () => {
    const { editor, target } = makeEditorWith('<p><code>fn()</code></p>');
    setCursor(editor.getEditorElement().querySelector('code').firstChild, 1);
    expect(editor.commands.isActive('inlineCode')).toBe(true);
    cleanup(editor, target);
  });

  it('isActive returns false outside <code>', () => {
    const { editor, target } = makeEditorWith('<p>plain</p>');
    setCursor(editor.getEditorElement().querySelector('p').firstChild, 0);
    expect(editor.commands.isActive('inlineCode')).toBe(false);
    cleanup(editor, target);
  });

  it('execute wraps selection in <code>', () => {
    const { editor, target } = makeEditorWith('<p>hello</p>');
    const textNode = editor.getEditorElement().querySelector('p').firstChild;
    setRange(textNode, 0, textNode, 5);
    editor.commands.execute('inlineCode');
    expect(editor.getEditorElement().querySelector('code')).not.toBeNull();
    expect(editor.getEditorElement().querySelector('code').textContent).toBe('hello');
    cleanup(editor, target);
  });

  it('execute unwraps existing <code> — collapsed cursor (toggle off)', () => {
    const { editor, target } = makeEditorWith('<p><code>fn()</code></p>');
    const code = editor.getEditorElement().querySelector('code');
    setCursor(code.firstChild, 1);
    editor.commands.execute('inlineCode');
    expect(editor.getEditorElement().querySelector('code')).toBeNull();
    expect(editor.getEditorElement().querySelector('p').textContent).toBe('fn()');
    cleanup(editor, target);
  });

  it('execute unwraps existing <code> — full selection (toggle off)', () => {
    const { editor, target } = makeEditorWith('<p><code>fn()</code></p>');
    const code = editor.getEditorElement().querySelector('code');
    setRange(code.firstChild, 0, code.firstChild, 4);
    editor.commands.execute('inlineCode');
    expect(editor.getEditorElement().querySelector('code')).toBeNull();
    expect(editor.getEditorElement().querySelector('p').textContent).toBe('fn()');
    cleanup(editor, target);
  });

  it('pending-format: collapsed cursor outside code inserts empty <code>', () => {
    const { editor, target } = makeEditorWith('<p>hello</p>');
    setCursor(editor.getEditorElement().querySelector('p').firstChild, 5);
    editor.commands.execute('inlineCode');
    expect(editor.getEditorElement().querySelector('code')).not.toBeNull();
    cleanup(editor, target);
  });

  it('pending-format: getHTML() strips the ZWSP from empty <code>', () => {
    const { editor, target } = makeEditorWith('<p>hello</p>');
    setCursor(editor.getEditorElement().querySelector('p').firstChild, 5);
    editor.commands.execute('inlineCode');
    expect(editor.getHTML()).not.toContain('​');
    cleanup(editor, target);
  });
});

describe('selectAll command', () => {
  it('selects all editor content', () => {
    const { editor, target } = makeEditorWith('<p>hello world</p>');
    editor.commands.execute('selectAll');
    const sel = window.getSelection();
    expect(sel.toString()).toContain('hello world');
    window.getSelection().removeAllRanges();
    cleanup(editor, target);
  });
});

describe('insertHTML command', () => {
  it('inserts HTML at cursor', () => {
    const { editor, target } = makeEditorWith('<p>hello</p>');
    const textNode = editor.getEditorElement().querySelector('p').firstChild;
    setCursor(textNode, 5);
    editor.commands.execute('insertHTML', '<strong>!</strong>');
    expect(editor.getEditorElement().querySelector('strong')).not.toBeNull();
    cleanup(editor, target);
  });
});

describe('insertText command', () => {
  it('inserts plain text at cursor', () => {
    const { editor, target } = makeEditorWith('<p>hi</p>');
    const textNode = editor.getEditorElement().querySelector('p').firstChild;
    setCursor(textNode, 2);
    editor.commands.execute('insertText', ' world');
    expect(editor.getEditorElement().textContent).toContain('hi world');
    cleanup(editor, target);
  });
});

describe('beforeCommand / afterCommand events', () => {
  it('fires beforeCommand with command name', () => {
    const { editor, target } = makeEditorWith('<p>hello</p>');
    const fn = vi.fn();
    editor.on('beforeCommand', fn);
    editor.commands.execute('selectAll');
    expect(fn).toHaveBeenCalledWith(expect.objectContaining({ command: 'selectAll' }));
    window.getSelection().removeAllRanges();
    cleanup(editor, target);
  });

  it('fires afterCommand with command name', () => {
    const { editor, target } = makeEditorWith('<p>hello</p>');
    const fn = vi.fn();
    editor.on('afterCommand', fn);
    editor.commands.execute('selectAll');
    expect(fn).toHaveBeenCalledWith(expect.objectContaining({ command: 'selectAll' }));
    window.getSelection().removeAllRanges();
    cleanup(editor, target);
  });

  it('prevents execution when beforeCommand calls preventDefault()', () => {
    const { editor, target } = makeEditorWith('<p>hello</p>');
    editor.on('beforeCommand', (e) => e.preventDefault());
    const result = editor.commands.execute('selectAll');
    expect(result).toBe(false);
    cleanup(editor, target);
  });
});

// Partial-selection unwrap regressions live in text-commands-partial-toggle.test.js
// (split out for the 300-line limit).

// Regression: dottedUnderline re-applied must update in place, not nest spans.
describe('dottedUnderline no-nest regression', () => {
  it('applying dottedUnderline twice does not nest spans', () => {
    const { editor, target } = makeEditorWith('<p>dotted</p>');
    const p = editor.getEditorElement().querySelector('p');
    setRange(p.firstChild, 0, p.firstChild, 6);
    editor.commands.execute('dottedUnderline');
    setRange(p.querySelector('span') || p.firstChild, 0,
             p.querySelector('span') || p.firstChild,
             (p.querySelector('span') || p.firstChild).childNodes.length || 6);
    // Re-select the whole paragraph and apply again
    const r = document.createRange();
    r.selectNodeContents(p);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(r);
    editor.commands.execute('dottedUnderline');
    // Must not nest: only one span
    expect(editor.getEditorElement().querySelectorAll('span').length).toBe(1);
    cleanup(editor, target);
  });
});
