import { describe, it, expect } from 'vitest';
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

// ─── lineHeight (T6) ─────────────────────────────────────────────────────────

describe('lineHeight command (T6)', () => {
  it('sets line-height on the parent block', () => {
    const { editor, target } = makeEditorWith('<p>text</p>');
    const p = editor.getEditorElement().querySelector('p');
    setCursor(p.firstChild, 0);
    editor.commands.execute('lineHeight', '2');
    expect(p.style.lineHeight).toBe('2');
    cleanup(editor, target);
  });

  it('no-op when value is empty string', () => {
    const { editor, target } = makeEditorWith('<p>text</p>');
    const p = editor.getEditorElement().querySelector('p');
    setCursor(p.firstChild, 0);
    editor.commands.execute('lineHeight', '');
    expect(p.style.lineHeight).toBe('');
    cleanup(editor, target);
  });
});

// ─── letterSpacing (T6) ───────────────────────────────────────────────────────

describe('letterSpacing command (T6)', () => {
  it('wraps selection in a span with letter-spacing', () => {
    const { editor, target } = makeEditorWith('<p>hello</p>');
    const textNode = editor.getEditorElement().querySelector('p').firstChild;
    setRange(textNode, 0, textNode, 5);
    editor.commands.execute('letterSpacing', '2px');
    const span = editor.getEditorElement().querySelector('span');
    expect(span).not.toBeNull();
    expect(span.style.letterSpacing).toBe('2px');
    cleanup(editor, target);
  });
});

// ─── textTransform (T6) ───────────────────────────────────────────────────────

describe('textTransform command (T6)', () => {
  it('wraps selection in a span with text-transform: uppercase', () => {
    const { editor, target } = makeEditorWith('<p>hello</p>');
    const textNode = editor.getEditorElement().querySelector('p').firstChild;
    setRange(textNode, 0, textNode, 5);
    editor.commands.execute('textTransform', 'uppercase');
    const span = editor.getEditorElement().querySelector('span');
    expect(span).not.toBeNull();
    expect(span.style.textTransform).toBe('uppercase');
    cleanup(editor, target);
  });

  it('rejects invalid textTransform values', () => {
    const { editor, target } = makeEditorWith('<p>hello</p>');
    const textNode = editor.getEditorElement().querySelector('p').firstChild;
    setRange(textNode, 0, textNode, 5);
    editor.commands.execute('textTransform', 'blink');
    expect(editor.getEditorElement().querySelector('span')).toBeNull();
    cleanup(editor, target);
  });
});

// ─── fontWeight (T6) ──────────────────────────────────────────────────────────

describe('fontWeight command (T6)', () => {
  it('wraps selection in a span with font-weight: 700', () => {
    const { editor, target } = makeEditorWith('<p>hello</p>');
    const textNode = editor.getEditorElement().querySelector('p').firstChild;
    setRange(textNode, 0, textNode, 5);
    editor.commands.execute('fontWeight', '700');
    const span = editor.getEditorElement().querySelector('span');
    expect(span).not.toBeNull();
    expect(span.style.fontWeight).toBe('700');
    cleanup(editor, target);
  });
});

// ─── wrapInSpan collapsed cursor is no-op (T7) ───────────────────────────────

describe('wrapInSpan no-op on collapsed selection (T7)', () => {
  it('letterSpacing does not insert a span on a collapsed cursor', () => {
    const { editor, target } = makeEditorWith('<p>hello</p>');
    const p = editor.getEditorElement().querySelector('p');
    setCursor(p.firstChild, 2);
    editor.commands.execute('letterSpacing', '2px');
    expect(editor.getEditorElement().querySelector('span')).toBeNull();
    cleanup(editor, target);
  });

  it('textTransform does not insert a span on a collapsed cursor', () => {
    const { editor, target } = makeEditorWith('<p>hello</p>');
    const p = editor.getEditorElement().querySelector('p');
    setCursor(p.firstChild, 2);
    editor.commands.execute('textTransform', 'uppercase');
    expect(editor.getEditorElement().querySelector('span')).toBeNull();
    cleanup(editor, target);
  });

  it('overline does not insert a span on a collapsed cursor', () => {
    const { editor, target } = makeEditorWith('<p>hello</p>');
    const p = editor.getEditorElement().querySelector('p');
    setCursor(p.firstChild, 2);
    editor.commands.execute('overline');
    expect(editor.getEditorElement().querySelector('span')).toBeNull();
    cleanup(editor, target);
  });
});

// ─── overline isActive (M2 fix) ───────────────────────────────────────────────

describe('overline isActive', () => {
  it('returns true when cursor is inside a span with text-decoration: overline', () => {
    const { editor, target } = makeEditorWith(
      '<p><span style="text-decoration: overline">over</span></p>'
    );
    const span = editor.getEditorElement().querySelector('span');
    setCursor(span.firstChild, 1);
    expect(editor.commands.isActive('overline')).toBe(true);
    cleanup(editor, target);
  });

  it('returns false when no overline in ancestry', () => {
    const { editor, target } = makeEditorWith('<p>plain</p>');
    setCursor(editor.getEditorElement().querySelector('p').firstChild, 1);
    expect(editor.commands.isActive('overline')).toBe(false);
    cleanup(editor, target);
  });
});
