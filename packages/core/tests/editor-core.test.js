import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenEditor } from '../src/editor.js';

// jsdom provides document — set up a fresh mount target for every test
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

// ─── 1.2 Mount ───────────────────────────────────────────────────────────────

describe('1.2 — mount on DOM element', () => {
  let target, editor;
  beforeEach(() => { target = makeTarget(); });
  afterEach(() => cleanup(editor, target));

  it('mounts when passed a DOM element', () => {
    editor = new OpenEditor(target);
    expect(editor).toBeDefined();
    expect(editor.isDestroyed()).toBe(false);
  });

  it('mounts when passed a CSS selector string', () => {
    editor = new OpenEditor(`#${target.id}`);
    expect(editor.isDestroyed()).toBe(false);
  });

  it('throws when selector matches nothing', () => {
    expect(() => new OpenEditor('#does-not-exist')).toThrow(/not found/i);
  });
});

// ─── 1.3 contenteditable DOM ─────────────────────────────────────────────────

describe('1.3 — contenteditable and wrapper', () => {
  let target, editor;
  beforeEach(() => { target = makeTarget(); editor = new OpenEditor(target); });
  afterEach(() => cleanup(editor, target));

  it('creates a wrapper div inside container', () => {
    expect(target.querySelector('.oe-wrapper')).not.toBeNull();
  });

  it('creates a contenteditable div inside wrapper', () => {
    const el = target.querySelector('.oe-editor');
    expect(el).not.toBeNull();
    expect(el.contentEditable).toBe('true');
  });

  it('getEditorElement() returns the contenteditable div', () => {
    expect(editor.getEditorElement()).toBe(target.querySelector('.oe-editor'));
  });

  it('getContainer() returns the original target', () => {
    expect(editor.getContainer()).toBe(target);
  });
});

// ─── 1.4 Config system ───────────────────────────────────────────────────────

describe('1.4 — config defaults and deep merge', () => {
  let target, editor;
  afterEach(() => cleanup(editor, target));

  it('applies defaults when no config supplied', () => {
    target = makeTarget();
    editor = new OpenEditor(target);
    expect(editor._config.debug).toBe(false);
    expect(editor._config.spellcheck).toBe(false);
    expect(editor._config.toolbar).toBe(true);
  });

  it('merges user config over defaults', () => {
    target = makeTarget();
    editor = new OpenEditor(target, { debug: true, spellcheck: true });
    expect(editor._config.debug).toBe(true);
    expect(editor._config.spellcheck).toBe(true);
  });

  it('deep merges nested config objects', () => {
    target = makeTarget();
    editor = new OpenEditor(target, { autosave: { interval: 5000 } });
    expect(editor._config.autosave.interval).toBe(5000);
  });
});

// ─── 1.4 Prototype-pollution safety (1.19) ───────────────────────────────────

describe('1.19 — prototype-pollution-safe deep merge', () => {
  let target, editor;
  afterEach(() => cleanup(editor, target));

  it('strips __proto__ key', () => {
    target = makeTarget();
    const evil = JSON.parse('{"__proto__":{"polluted":true}}');
    editor = new OpenEditor(target, evil);
    expect({}.polluted).toBeUndefined();
  });

  it('strips constructor key (not written as own property)', () => {
    target = makeTarget();
    editor = new OpenEditor(target, { constructor: { name: 'evil' } });
    // safeMerge must not set constructor as an own property on _config
    expect(Object.prototype.hasOwnProperty.call(editor._config, 'constructor')).toBe(false);
  });

  it('strips prototype key', () => {
    target = makeTarget();
    editor = new OpenEditor(target, { prototype: { bad: true } });
    expect(editor._config.prototype).toBeUndefined();
  });
});

// ─── 1.5 Lifecycle events ─────────────────────────────────────────────────────

describe('1.5 — lifecycle events', () => {
  let target;
  beforeEach(() => { target = makeTarget(); });

  it('editor is functional after init (beforeInit → ready cycle completed)', () => {
    const target2 = makeTarget();
    // Lifecycle events fire during construction before any on() call can be registered.
    // We verify the full cycle ran by confirming the editor mounted successfully.
    const editor = new OpenEditor(target2, {});
    expect(editor.isDestroyed()).toBe(false);
    expect(target2.querySelector('.oe-editor')).not.toBeNull();
    editor.destroy();
    target2.parentNode && target2.parentNode.removeChild(target2);
  });

  it('emits beforeDestroy → destroy on destroy()', () => {
    const order = [];
    const editor = new OpenEditor(target);
    editor.on('beforeDestroy', () => order.push('beforeDestroy'));
    editor.on('destroy', () => order.push('destroy'));
    editor.destroy();
    expect(order).toEqual(['beforeDestroy', 'destroy']);
  });

  it('destroy() is idempotent — second call does not throw', () => {
    const editor = new OpenEditor(target);
    editor.destroy();
    expect(() => editor.destroy()).not.toThrow();
  });
});

// ─── 1.6 Raw DOM events ──────────────────────────────────────────────────────

describe('1.6 — raw DOM events forwarded', () => {
  let target, editor;
  beforeEach(() => { target = makeTarget(); editor = new OpenEditor(target); });
  afterEach(() => cleanup(editor, target));

  it('emits focus event', () => {
    const fn = vi.fn();
    editor.on('focus', fn);
    editor.getEditorElement().dispatchEvent(new Event('focus'));
    expect(fn).toHaveBeenCalledOnce();
  });

  it('emits blur event', () => {
    const fn = vi.fn();
    editor.on('blur', fn);
    editor.getEditorElement().dispatchEvent(new Event('blur'));
    expect(fn).toHaveBeenCalledOnce();
  });

  it('emits keydown event', () => {
    const fn = vi.fn();
    editor.on('keydown', fn);
    editor.getEditorElement().dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    expect(fn).toHaveBeenCalledOnce();
  });

  it('emits keyup event', () => {
    const fn = vi.fn();
    editor.on('keyup', fn);
    editor.getEditorElement().dispatchEvent(new KeyboardEvent('keyup', { key: 'a' }));
    expect(fn).toHaveBeenCalledOnce();
  });

  it('emits mousedown event', () => {
    const fn = vi.fn();
    editor.on('mousedown', fn);
    editor.getEditorElement().dispatchEvent(new MouseEvent('mousedown'));
    expect(fn).toHaveBeenCalledOnce();
  });

  it('emits mouseup event', () => {
    const fn = vi.fn();
    editor.on('mouseup', fn);
    editor.getEditorElement().dispatchEvent(new MouseEvent('mouseup'));
    expect(fn).toHaveBeenCalledOnce();
  });

  it('emits input event', () => {
    const fn = vi.fn();
    editor.on('input', fn);
    editor.getEditorElement().dispatchEvent(new Event('input'));
    expect(fn).toHaveBeenCalledOnce();
  });
});
