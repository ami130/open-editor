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

// ─── 1.7 IME composition ─────────────────────────────────────────────────────

describe('1.7 — IME composition events', () => {
  let target, editor;
  beforeEach(() => { target = makeTarget(); editor = new OpenEditor(target); });
  afterEach(() => cleanup(editor, target));

  it('emits compositionstart', () => {
    const fn = vi.fn();
    editor.on('compositionstart', fn);
    editor.getEditorElement().dispatchEvent(new CompositionEvent('compositionstart'));
    expect(fn).toHaveBeenCalledOnce();
  });

  it('emits compositionupdate', () => {
    const fn = vi.fn();
    editor.on('compositionupdate', fn);
    editor.getEditorElement().dispatchEvent(new CompositionEvent('compositionupdate'));
    expect(fn).toHaveBeenCalledOnce();
  });

  it('emits compositionend', () => {
    const fn = vi.fn();
    editor.on('compositionend', fn);
    editor.getEditorElement().dispatchEvent(new CompositionEvent('compositionend'));
    expect(fn).toHaveBeenCalledOnce();
  });

  it('sets _isComposing true on compositionstart', () => {
    editor.getEditorElement().dispatchEvent(new CompositionEvent('compositionstart'));
    expect(editor._isComposing).toBe(true);
  });

  it('sets _isComposing false on compositionend', () => {
    editor.getEditorElement().dispatchEvent(new CompositionEvent('compositionstart'));
    editor.getEditorElement().dispatchEvent(new CompositionEvent('compositionend'));
    expect(editor._isComposing).toBe(false);
  });
});

// ─── 1.8 Placeholder ─────────────────────────────────────────────────────────

describe('1.8 — placeholder', () => {
  let target, editor;
  afterEach(() => cleanup(editor, target));

  it('sets data-placeholder attribute on editor element', () => {
    target = makeTarget();
    editor = new OpenEditor(target, { placeholder: 'Write here…' });
    expect(editor.getEditorElement().getAttribute('data-placeholder')).toBe('Write here…');
  });

  it('uses default placeholder when none supplied', () => {
    target = makeTarget();
    editor = new OpenEditor(target);
    expect(editor.getEditorElement().getAttribute('data-placeholder')).toBe('Start typing…');
  });
});

// ─── 1.9 autofocus ───────────────────────────────────────────────────────────

describe('1.9 — autofocus', () => {
  let target, editor;
  afterEach(() => cleanup(editor, target));

  it('calls focus() on editor element when autofocus:true', () => {
    target = makeTarget();
    const focusSpy = vi.spyOn(HTMLElement.prototype, 'focus');
    editor = new OpenEditor(target, { autofocus: true });
    expect(focusSpy).toHaveBeenCalled();
    focusSpy.mockRestore();
  });
});

// ─── 1.13 Height config ──────────────────────────────────────────────────────

describe('1.13 — minHeight / maxHeight / height config', () => {
  let target, editor;
  afterEach(() => cleanup(editor, target));

  it('applies minHeight to wrapper', () => {
    target = makeTarget();
    editor = new OpenEditor(target, { minHeight: 300 });
    expect(editor._wrapper.style.minHeight).toBe('300px');
  });

  it('applies maxHeight to wrapper', () => {
    target = makeTarget();
    editor = new OpenEditor(target, { maxHeight: 500 });
    expect(editor._wrapper.style.maxHeight).toBe('500px');
  });

  it('height sets both minHeight and maxHeight', () => {
    target = makeTarget();
    editor = new OpenEditor(target, { height: 400 });
    expect(editor._config.minHeight).toBe(400);
    expect(editor._config.maxHeight).toBe(400);
    expect(editor._wrapper.style.minHeight).toBe('400px');
    expect(editor._wrapper.style.maxHeight).toBe('400px');
  });
});

// ─── 1.14 defaultContent ─────────────────────────────────────────────────────

describe('1.14 — defaultContent', () => {
  let target, editor;
  afterEach(() => cleanup(editor, target));

  it('sets initial HTML content at construction time', () => {
    target = makeTarget();
    editor = new OpenEditor(target, { defaultContent: '<p>Hello</p>' });
    expect(editor.getEditorElement().innerHTML).toBe('<p>Hello</p>');
  });
});

// ─── 1.15 readonly config ────────────────────────────────────────────────────

describe('1.15 — readonly config', () => {
  let target, editor;
  afterEach(() => cleanup(editor, target));

  it('contenteditable is false when readonly:true', () => {
    target = makeTarget();
    editor = new OpenEditor(target, { readonly: true });
    expect(editor.getEditorElement().contentEditable).toBe('false');
  });

  it('isReadOnly() returns true', () => {
    target = makeTarget();
    editor = new OpenEditor(target, { readonly: true });
    expect(editor.isReadOnly()).toBe(true);
  });

  it('setReadOnly(true/false) toggles contenteditable', () => {
    target = makeTarget();
    editor = new OpenEditor(target);
    editor.setReadOnly(true);
    expect(editor.getEditorElement().contentEditable).toBe('false');
    editor.setReadOnly(false);
    expect(editor.getEditorElement().contentEditable).toBe('true');
  });

  it('readonly:true sets _state.isReadOnly to true at construction', () => {
    target = makeTarget();
    editor = new OpenEditor(target, { readonly: true });
    expect(editor._state.isReadOnly).toBe(true);
  });

  it('setReadOnly(true) syncs _state.isReadOnly to true', () => {
    target = makeTarget();
    editor = new OpenEditor(target);
    expect(editor._state.isReadOnly).toBe(false);
    editor.setReadOnly(true);
    expect(editor._state.isReadOnly).toBe(true);
  });

  it('setReadOnly(false) syncs _state.isReadOnly to false', () => {
    target = makeTarget();
    editor = new OpenEditor(target, { readonly: true });
    editor.setReadOnly(false);
    expect(editor._state.isReadOnly).toBe(false);
  });
});

// ─── 1.16 spellcheck ─────────────────────────────────────────────────────────

describe('1.16 — spellcheck config', () => {
  let target, editor;
  afterEach(() => cleanup(editor, target));

  it('spellcheck is false by default', () => {
    target = makeTarget();
    editor = new OpenEditor(target);
    expect(editor.getEditorElement().getAttribute('spellcheck')).toBe('false');
  });

  it('spellcheck:true sets attribute to true', () => {
    target = makeTarget();
    editor = new OpenEditor(target, { spellcheck: true });
    expect(editor.getEditorElement().getAttribute('spellcheck')).toBe('true');
  });
});

// ─── 1.17 / 1.18 toolbar/statusBar false ─────────────────────────────────────

describe('1.17 / 1.18 — toolbar:false and statusBar:false', () => {
  let target, editor;
  afterEach(() => cleanup(editor, target));

  it('stores toolbar:false in config', () => {
    target = makeTarget();
    editor = new OpenEditor(target, { toolbar: false });
    expect(editor._config.toolbar).toBe(false);
  });

  it('stores statusBar:false in config', () => {
    target = makeTarget();
    editor = new OpenEditor(target, { statusBar: false });
    expect(editor._config.statusBar).toBe(false);
  });

  it('toolbar:false — no toolbar DOM element created', () => {
    target = makeTarget();
    editor = new OpenEditor(target, { toolbar: false });
    expect(target.querySelector('.oe-toolbar')).toBeNull();
  });
});

// ─── 16.C — unknown config-key validation (warn, never throw) ─────────────────

describe('16.C — unknown config keys warn without throwing', () => {
  let target, editor;
  afterEach(() => cleanup(editor, target));

  function withLogger() {
    const warn = vi.fn();
    return { logger: { warn, info() {}, error() {}, debug() {} }, warn };
  }

  it('warns on an unknown config key', () => {
    const { logger, warn } = withLogger();
    target = makeTarget();
    editor = new OpenEditor(target, { logger, notARealOption: true });
    expect(warn.mock.calls.some((c) => String(c[0]).includes('notARealOption'))).toBe(true);
  });

  it('suggests the closest key for a case-typo (readOnly → readonly)', () => {
    const { logger, warn } = withLogger();
    target = makeTarget();
    editor = new OpenEditor(target, { logger, readOnly: true });
    const msg = warn.mock.calls.map((c) => String(c[0])).join(' ');
    expect(msg).toContain('readOnly');
    expect(msg).toContain('readonly'); // the suggestion
  });

  it('does NOT warn for known keys', () => {
    const { logger, warn } = withLogger();
    target = makeTarget();
    editor = new OpenEditor(target, { logger, readonly: true, theme: 'dark', maxLength: 10 });
    const unknownWarns = warn.mock.calls.filter((c) => String(c[0]).includes('unknown config option'));
    expect(unknownWarns.length).toBe(0);
  });

  it('never throws on a garbage config (still constructs)', () => {
    const { logger } = withLogger();
    target = makeTarget();
    expect(() => { editor = new OpenEditor(target, { logger, xyz: 1, foo: 'bar' }); }).not.toThrow();
    expect(editor.isDestroyed()).toBe(false);
  });
});

// ─── 16.5.3 — beforeunload dirty guard (opt-in) ───────────────────────────────

describe('16.5.3 — beforeunload dirty guard', () => {
  let target, editor;
  afterEach(() => cleanup(editor, target));

  // Invoke the handler directly with a mock event — isolation-proof (no shared
  // window state) and asserts the exact prompt-triggering behaviour.
  function invoke(ed) {
    const e = { defaultPrevented: false, returnValue: undefined,
      preventDefault() { this.defaultPrevented = true; } };
    ed._onBeforeUnload(e);
    return e;
  }

  it('default off: no beforeunload listener is registered', () => {
    target = makeTarget();
    editor = new OpenEditor(target); // warnOnUnload defaults false
    expect(editor._boundHandlers.beforeunload).toBeUndefined();
  });

  it('warnOnUnload:true registers a window beforeunload listener', () => {
    target = makeTarget();
    editor = new OpenEditor(target, { warnOnUnload: true });
    const bound = editor._boundHandlers.beforeunload;
    expect(Array.isArray(bound) && bound.length).toBe(1);
    expect(bound[0].target).toBe(window);
  });

  it('handler prompts (preventDefault) only when dirty', () => {
    target = makeTarget();
    editor = new OpenEditor(target, { warnOnUnload: true });
    editor._state.isDirty = false;
    expect(invoke(editor).defaultPrevented).toBe(false);
    editor._state.isDirty = true;
    const e = invoke(editor);
    expect(e.defaultPrevented).toBe(true);
    expect(e.returnValue).toBe('');
  });

  it('destroy() removes the beforeunload listener from window', () => {
    target = makeTarget();
    editor = new OpenEditor(target, { warnOnUnload: true });
    const spy = vi.spyOn(window, 'removeEventListener');
    editor.destroy();
    expect(spy.mock.calls.some((c) => c[0] === 'beforeunload')).toBe(true);
    spy.mockRestore();
    target.parentNode && target.parentNode.removeChild(target);
  });
});
