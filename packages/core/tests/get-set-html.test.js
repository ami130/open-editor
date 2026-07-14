import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

// ─── 2.2 — getHTML() ─────────────────────────────────────────────────────────

describe('2.2 — getHTML()', () => {
  let target, editor;
  beforeEach(() => { target = makeTarget(); editor = new OpenEditor(target); });
  afterEach(() => cleanup(editor, target));

  it('returns empty string when editor is empty', () => {
    expect(editor.getHTML()).toBe('');
  });

  it('returns innerHTML of contenteditable (not outer wrapper)', () => {
    editor.getEditorElement().innerHTML = '<p>Hello</p>';
    expect(editor.getHTML()).toContain('Hello');
    expect(editor.getHTML()).not.toContain('oe-editor');
    expect(editor.getHTML()).not.toContain('oe-wrapper');
  });

  it('does not mutate live DOM when normalizing', () => {
    editor.getEditorElement().innerHTML = '<p>Hello</p>';
    editor.getHTML();
    editor.getHTML();
    expect(editor.getEditorElement().innerHTML).toBe('<p>Hello</p>');
  });
});

// ─── 2.19 — &nbsp; normalization in getHTML() ────────────────────────────────

describe('2.19 — nbsp normalization in getHTML()', () => {
  let target, editor;
  beforeEach(() => { target = makeTarget(); editor = new OpenEditor(target); });
  afterEach(() => cleanup(editor, target));

  it('replaces non-breaking space with regular space in output', () => {
    const NBSP = '\u00a0';
    editor.getEditorElement().innerHTML = '<p>Hello' + NBSP + 'World</p>';
    const html = editor.getHTML();
    // After normalization the U+00A0 should be replaced by a regular space
    expect(html).not.toContain(NBSP);
    expect(html).toContain('Hello');
    expect(html).toContain('World');
  });

  it('preserves non-breaking space inside <pre>', () => {
    const NBSP = '\u00a0';
    editor.getEditorElement().innerHTML = '<pre>code' + NBSP + 'here</pre>';
    const html = editor.getHTML();
    // jsdom serializes U+00A0 back as &nbsp; — either form is acceptable, just must not be stripped
    const hasNbsp = html.includes(NBSP) || html.includes('&nbsp;');
    expect(hasNbsp).toBe(true);
  });
});

// ─── 2.20 — Empty paragraph normalization ────────────────────────────────────

describe('2.20 — empty paragraph normalization in getHTML()', () => {
  let target, editor;
  beforeEach(() => { target = makeTarget(); editor = new OpenEditor(target); });
  afterEach(() => cleanup(editor, target));

  it('outputs <p><br></p> for an empty paragraph', () => {
    editor.getEditorElement().innerHTML = '<p></p>';
    const html = editor.getHTML();
    expect(html).toBe('<p><br></p>');
  });

  it('does not add <br> to non-empty paragraphs', () => {
    editor.getEditorElement().innerHTML = '<p>text</p>';
    const html = editor.getHTML();
    expect(html).toBe('<p>text</p>');
  });
});

// ─── 2.21 — <b>/<i> semantic normalization ───────────────────────────────────

describe('2.21 — <b> and <i> to semantic tags in getHTML()', () => {
  let target, editor;
  beforeEach(() => { target = makeTarget(); editor = new OpenEditor(target); });
  afterEach(() => cleanup(editor, target));

  it('converts <b> to <strong>', () => {
    editor.getEditorElement().innerHTML = '<p><b>bold</b></p>';
    const html = editor.getHTML();
    expect(html).toContain('<strong>bold</strong>');
    expect(html).not.toContain('<b>');
  });

  it('converts <i> to <em>', () => {
    editor.getEditorElement().innerHTML = '<p><i>italic</i></p>';
    const html = editor.getHTML();
    expect(html).toContain('<em>italic</em>');
    expect(html).not.toContain('<i>');
  });

  it('preserves class/style when converting <b> to <strong>', () => {
    editor.getEditorElement().innerHTML = '<p><b class="x">text</b></p>';
    const html = editor.getHTML();
    expect(html).toContain('<strong class="x">text</strong>');
  });
});

// ─── 2.22 — getHTML() contract ───────────────────────────────────────────────

describe('2.22 — getHTML() contract', () => {
  let target, editor;
  beforeEach(() => { target = makeTarget(); editor = new OpenEditor(target); });
  afterEach(() => cleanup(editor, target));

  it('always returns <strong> not <b>', () => {
    editor.getEditorElement().innerHTML = '<b>test</b>';
    expect(editor.getHTML()).not.toContain('<b>');
    expect(editor.getHTML()).toContain('<strong>');
  });

  it('always returns <em> not <i>', () => {
    editor.getEditorElement().innerHTML = '<i>test</i>';
    expect(editor.getHTML()).not.toContain('<i>');
    expect(editor.getHTML()).toContain('<em>');
  });

  it('uses HTML5 void element style: <br> not <br/>', () => {
    editor.getEditorElement().innerHTML = '<p></p>';
    const html = editor.getHTML();
    expect(html).toContain('<br>');
    expect(html).not.toContain('<br/>');
    expect(html).not.toContain('<br />');
  });

  it('returns innerHTML of contenteditable, not outer HTML', () => {
    editor.getEditorElement().innerHTML = '<p>inner</p>';
    const html = editor.getHTML();
    expect(html.startsWith('<p>')).toBe(true);
  });
});

// ─── 2.3 — setHTML() ─────────────────────────────────────────────────────────

describe('2.3 — setHTML()', () => {
  let target, editor;
  beforeEach(() => { target = makeTarget(); editor = new OpenEditor(target); });
  afterEach(() => cleanup(editor, target));

  it('sets HTML content in the editor', () => {
    editor.setHTML('<p>Hello world</p>');
    expect(editor.getEditorElement().innerHTML).toContain('Hello world');
  });

  it('sanitizes dangerous content before inserting', () => {
    editor.setHTML('<p onclick="evil()">text</p><script>alert(1)</script>');
    const html = editor.getEditorElement().innerHTML;
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('alert(1)');
    expect(html).toContain('text');
  });

  it('handles empty string', () => {
    editor.setHTML('<p>existing</p>');
    editor.setHTML('');
    expect(editor.getEditorElement().innerHTML).toBe('');
  });

  it('handles null gracefully', () => {
    expect(() => editor.setHTML(null)).not.toThrow();
  });

  it('does nothing when called after destroy', () => {
    editor.destroy();
    expect(() => editor.setHTML('<p>test</p>')).not.toThrow();
  });

  it('resets isDirty to false', () => {
    editor._state.isDirty = true;
    editor.setHTML('<p>fresh</p>');
    expect(editor._state.isDirty).toBe(false);
  });

  it('emits setHTML event', () => {
    const fn = vi.fn();
    editor.on('setHTML', fn);
    editor.setHTML('<p>content</p>');
    expect(fn).toHaveBeenCalledOnce();
  });
});

// ─── 2.26 — sanitize:false ───────────────────────────────────────────────────

describe('2.26 — sanitize:false config escape hatch', () => {
  let target, editor;
  afterEach(() => cleanup(editor, target));

  it('passes HTML through without sanitization when sanitize:false', () => {
    target = makeTarget();
    editor = new OpenEditor(target, { sanitize: false });
    // With sanitize:false the onclick survives — this is intentional for server-sanitized pipelines
    editor.setHTML('<p onclick="handler()">text</p>');
    expect(editor.getEditorElement().innerHTML).toContain('onclick');
  });
});

// ─── 2.27 — Scroll position preserved ────────────────────────────────────────

describe('2.27 — scroll position preserved across setHTML()', () => {
  let target, editor;
  beforeEach(() => { target = makeTarget(); editor = new OpenEditor(target); });
  afterEach(() => cleanup(editor, target));

  it('preserves scrollTop across setHTML calls', () => {
    editor.getEditorElement().scrollTop = 100;
    editor.setHTML('<p>new content</p>');
    // jsdom keeps scrollTop at 100 since DOM didn't scroll
    expect(editor.getEditorElement().scrollTop).toBe(100);
  });
});
