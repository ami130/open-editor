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

// ─── 2.15 — getJSON() ────────────────────────────────────────────────────────

describe('2.15 — getJSON()', () => {
  let target, editor;
  beforeEach(() => { target = makeTarget(); editor = new OpenEditor(target); });
  afterEach(() => cleanup(editor, target));

  it('returns object with version and content fields', () => {
    editor.getEditorElement().innerHTML = '<p>Hello</p>';
    const json = editor.getJSON();
    expect(json).toHaveProperty('version', '1.0');
    expect(json).toHaveProperty('content');
    expect(Array.isArray(json.content)).toBe(true);
  });

  it('content array has entries with type and html', () => {
    editor.getEditorElement().innerHTML = '<p>Hello</p>';
    const json = editor.getJSON();
    expect(json.content.length).toBeGreaterThan(0);
    expect(json.content[0]).toHaveProperty('type');
    expect(json.content[0]).toHaveProperty('html');
  });

  it('type matches the block element tag', () => {
    editor.getEditorElement().innerHTML = '<h1>Title</h1><p>Para</p>';
    const json = editor.getJSON();
    const types = json.content.map((b) => b.type);
    expect(types).toContain('h1');
    expect(types).toContain('p');
  });

  it('returns version 1.0 always', () => {
    const json = editor.getJSON();
    expect(json.version).toBe('1.0');
  });

  it('returns empty content array for empty editor', () => {
    const json = editor.getJSON();
    expect(json.content).toEqual([]);
  });
});

// ─── 2.16 — setJSON() ────────────────────────────────────────────────────────

describe('2.16 — setJSON()', () => {
  let target, editor;
  beforeEach(() => { target = makeTarget(); editor = new OpenEditor(target); });
  afterEach(() => cleanup(editor, target));

  it('restores document from a getJSON() export', () => {
    editor.getEditorElement().innerHTML = '<p>Hello</p><p>World</p>';
    const json = editor.getJSON();
    editor.setHTML(''); // clear
    editor.setJSON(json);
    expect(editor.getEditorElement().innerHTML).toContain('Hello');
    expect(editor.getEditorElement().innerHTML).toContain('World');
  });

  it('handles unknown version with a warning (does not throw)', () => {
    const json = { version: '99.0', content: [{ type: 'p', html: '<p>test</p>' }] };
    expect(() => editor.setJSON(json)).not.toThrow();
    expect(editor.getEditorElement().innerHTML).toContain('test');
  });

  it('handles missing version field gracefully', () => {
    const json = { content: [{ type: 'p', html: '<p>no version</p>' }] };
    expect(() => editor.setJSON(json)).not.toThrow();
    expect(editor.getEditorElement().innerHTML).toContain('no version');
  });

  it('handles null gracefully', () => {
    expect(() => editor.setJSON(null)).not.toThrow();
  });

  it('handles missing content array gracefully', () => {
    expect(() => editor.setJSON({ version: '1.0' })).not.toThrow();
  });

  it('does nothing after destroy', () => {
    editor.destroy();
    expect(() => editor.setJSON({ version: '1.0', content: [] })).not.toThrow();
    target.parentNode && target.parentNode.removeChild(target);
  });

  it('round-trips content correctly', () => {
    editor.getEditorElement().innerHTML = '<h1>Title</h1><p>Paragraph <strong>bold</strong></p>';
    const json = editor.getJSON();
    const fresh = new OpenEditor(makeTarget());
    fresh.setJSON(json);
    expect(fresh.getEditorElement().innerHTML).toContain('Title');
    expect(fresh.getEditorElement().innerHTML).toContain('Paragraph');
    fresh.destroy();
  });
});
