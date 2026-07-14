import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { OpenEditor } from '../src/editor.js';

function makeTarget() {
  const el = document.createElement('div');
  el.id = 'editor-' + Math.random().toString(36).slice(2);
  document.body.appendChild(el);
  return el;
}

function cleanup(editor, target) {
  if (editor && !editor.isDestroyed()) editor.destroy();
  if (target && target.parentNode) target.parentNode.removeChild(target);
}

// ─── 2.4 — getText() ─────────────────────────────────────────────────────────

describe('2.4 — getText()', () => {
  let target, editor;
  beforeEach(() => { target = makeTarget(); editor = new OpenEditor(target); });
  afterEach(() => cleanup(editor, target));

  it('returns empty string for empty editor', () => {
    expect(editor.getText()).toBe('');
  });

  it('strips all HTML tags', () => {
    editor.getEditorElement().innerHTML = '<p>Hello <strong>world</strong></p>';
    expect(editor.getText()).toBe('Hello world');
  });

  it('strips nested tags', () => {
    editor.getEditorElement().innerHTML = '<h1>Title</h1><p>Para with <em>emphasis</em></p>';
    const text = editor.getText();
    expect(text).toContain('Title');
    expect(text).toContain('Para with');
    expect(text).toContain('emphasis');
    expect(text).not.toContain('<');
    expect(text).not.toContain('>');
  });

  it('returns trimmed string', () => {
    editor.getEditorElement().innerHTML = '<p>  spaced  </p>';
    // getText trims the overall result
    expect(editor.getText().startsWith(' ')).toBe(false);
  });

  it('returns empty string when editor is destroyed', () => {
    editor.destroy();
    expect(editor.getText()).toBe('');
    target.parentNode && target.parentNode.removeChild(target);
  });
});

// ─── 2.5 — isEmpty() ─────────────────────────────────────────────────────────

describe('2.5 — isEmpty()', () => {
  let target, editor;
  beforeEach(() => { target = makeTarget(); editor = new OpenEditor(target); });
  afterEach(() => cleanup(editor, target));

  it('returns true for completely empty editor', () => {
    expect(editor.isEmpty()).toBe(true);
  });

  it('returns true for editor with only <br>', () => {
    editor.getEditorElement().innerHTML = '<br>';
    expect(editor.isEmpty()).toBe(true);
  });

  it('returns true for <p></p> (empty paragraph)', () => {
    editor.getEditorElement().innerHTML = '<p></p>';
    expect(editor.isEmpty()).toBe(true);
  });

  it('returns true for <p><br></p> (canonical empty form)', () => {
    editor.getEditorElement().innerHTML = '<p><br></p>';
    expect(editor.isEmpty()).toBe(true);
  });

  it('returns false when editor has text', () => {
    editor.getEditorElement().innerHTML = '<p>Hello</p>';
    expect(editor.isEmpty()).toBe(false);
  });

  it('returns false when editor has an image', () => {
    editor.getEditorElement().innerHTML = '<p><img src="x.png" alt="x"></p>';
    expect(editor.isEmpty()).toBe(false);
  });

  it('returns true when editor has only whitespace text', () => {
    editor.getEditorElement().innerHTML = '<p>   </p>';
    expect(editor.isEmpty()).toBe(true);
  });

  it('returns true when destroyed', () => {
    editor.destroy();
    expect(editor.isEmpty()).toBe(true);
    target.parentNode && target.parentNode.removeChild(target);
  });
});
