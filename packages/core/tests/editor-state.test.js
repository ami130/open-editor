import { describe, it, expect } from 'vitest';
import { EditorState } from '../src/state/editor-state.js';

// ─── 2.1 — EditorState ───────────────────────────────────────────────────────

describe('2.1 — EditorState', () => {
  it('initializes with correct defaults', () => {
    const s = new EditorState();
    expect(s.html).toBe('');
    expect(s.isFocused).toBe(false);
    expect(s.isReadOnly).toBe(false);
    expect(s.isDirty).toBe(false);
  });

  it('metadata uses Object.create(null) — no prototype pollution risk', () => {
    const s = new EditorState();
    expect(Object.getPrototypeOf(s.metadata)).toBeNull();
  });

  it('metadata can store arbitrary key/value pairs', () => {
    const s = new EditorState();
    s.metadata.author = 'test';
    s.metadata.version = 42;
    expect(s.metadata.author).toBe('test');
    expect(s.metadata.version).toBe(42);
  });

  it('state fields are independently mutable', () => {
    const s = new EditorState();
    s.html = '<p>Hello</p>';
    s.isFocused = true;
    s.isReadOnly = true;
    s.isDirty = true;
    expect(s.html).toBe('<p>Hello</p>');
    expect(s.isFocused).toBe(true);
    expect(s.isReadOnly).toBe(true);
    expect(s.isDirty).toBe(true);
  });
});

// ─── 2.5 — setMeta / getMeta ─────────────────────────────────────────────────

describe('2.5 — setMeta / getMeta', () => {
  it('setMeta stores and getMeta reads back', () => {
    const s = new EditorState();
    s.setMeta('author', 'Ada');
    expect(s.getMeta('author')).toBe('Ada');
  });

  it('setMeta ignores non-string keys', () => {
    const s = new EditorState();
    s.setMeta(null, 'x');
    s.setMeta(42, 'y');
    expect(Object.keys(s.metadata).length).toBe(0);
  });

  it('setMeta invokes the notify callback with key+value', () => {
    const s = new EditorState();
    const calls = [];
    s.setNotify((k, v) => calls.push([k, v]));
    s.setMeta('title', 'Doc');
    expect(calls).toEqual([['title', 'Doc']]);
  });

  it('setMeta is chainable', () => {
    const s = new EditorState();
    expect(s.setMeta('a', 1).setMeta('b', 2)).toBe(s);
    expect(s.getMeta('a')).toBe(1);
    expect(s.getMeta('b')).toBe(2);
  });
});

// ─── 2.7 — serialize / deserialize ───────────────────────────────────────────

describe('2.7 — serialize / deserialize', () => {
  it('serialize produces JSON with html + metadata', () => {
    const s = new EditorState();
    s.html = '<p>Hi</p>';
    s.setMeta('author', 'Ada');
    const json = JSON.parse(s.serialize());
    expect(json.html).toBe('<p>Hi</p>');
    expect(json.metadata.author).toBe('Ada');
  });

  it('deserialize restores html + metadata from a JSON string', () => {
    const s = new EditorState();
    s.deserialize(JSON.stringify({ html: '<p>X</p>', metadata: { k: 'v' } }));
    expect(s.html).toBe('<p>X</p>');
    expect(s.getMeta('k')).toBe('v');
  });

  it('deserialize accepts a plain object too', () => {
    const s = new EditorState();
    s.deserialize({ html: '<p>Y</p>', metadata: { n: 1 } });
    expect(s.html).toBe('<p>Y</p>');
    expect(s.getMeta('n')).toBe(1);
  });

  it('deserialize ignores malformed input without throwing', () => {
    const s = new EditorState();
    s.html = '<p>keep</p>';
    expect(() => s.deserialize('not json')).not.toThrow();
    expect(() => s.deserialize(null)).not.toThrow();
    expect(s.html).toBe('<p>keep</p>');
  });

  it('round-trips through serialize → deserialize', () => {
    const a = new EditorState();
    a.html = '<p>round</p>';
    a.setMeta('author', 'Ada');
    const b = new EditorState();
    b.deserialize(a.serialize());
    expect(b.html).toBe('<p>round</p>');
    expect(b.getMeta('author')).toBe('Ada');
  });

  it('deserialized metadata has a null prototype (no pollution)', () => {
    const s = new EditorState();
    s.deserialize({ html: '', metadata: { a: 1 } });
    expect(Object.getPrototypeOf(s.metadata)).toBeNull();
  });
});
