import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenEditor } from '../src/editor.js';
import { safeMerge } from '../src/editor-config.js';

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

// ─── Phase 5b regression — safeMerge must not strip class-instance methods ──
// Found live: a real FeatureManager (from createPremiumHost) passed as
// config.entitlements lost its `isGranted` method through safeMerge's naive
// deep-merge (it copied only FeatureManager's OWN fields onto a fresh plain
// object, discarding the prototype). The core gate's `typeof
// entitlements.isGranted === 'function'` check then silently failed and fell
// back to grant-all — with NO error, NO warning. This is exactly the "one
// license drives both the core gate and the premium gate" contract every
// earlier phase's docs claim; it was broken until caught by Phase 5b's live
// license proof.
describe('5b — safeMerge preserves class-instance entitlements (no silent grant-all)', () => {
  let target, editor;
  afterEach(() => cleanup(editor, target));

  class FakeFeatureManager {
    constructor(granted) { this._granted = new Set(granted); }
    isGranted(id) { return this._granted.has(id); }
  }

  it('safeMerge() assigns a class instance by reference, does not deep-copy it into a plain object', () => {
    const target = { entitlements: null };
    const fm = new FakeFeatureManager(['text.bold']);
    safeMerge(target, { entitlements: fm });
    expect(target.entitlements).toBe(fm); // same reference, not a stripped clone
    expect(typeof target.entitlements.isGranted).toBe('function');
    expect(target.entitlements.isGranted('text.bold')).toBe(true);
    expect(target.entitlements.isGranted('text.italic')).toBe(false);
  });

  it('a real class-instance entitlements object survives OpenEditor construction and gates correctly', () => {
    target = makeTarget();
    const fm = new FakeFeatureManager(['text.bold']);
    editor = new OpenEditor(target, { entitlements: fm });
    expect(editor.isFeatureGranted('text.bold')).toBe(true);
    // Probe with a PREMIUM id the object withholds: must NOT silently grant-all.
    // (A FREE id like text.italic is always granted under the 1a-3c one-package
    // default — "free is free" — so it can't prove the object isn't ignored.)
    expect(editor.isFeatureGranted('seo')).toBe(false);
    expect(editor.isFeatureGranted('text.italic')).toBe(true); // FREE → always granted (1a-3c)
    expect(editor.isFeatureGranted('undo')).toBe(true); // always-on core, unaffected
  });

  it('a plain-object entitlements literal (the pre-existing test pattern) still works unchanged', () => {
    target = makeTarget();
    const entitlements = { isGranted: (id) => id === 'text.bold' };
    editor = new OpenEditor(target, { entitlements });
    expect(editor.isFeatureGranted('text.bold')).toBe(true);
    expect(editor.isFeatureGranted('seo')).toBe(false);        // withheld premium → denied
    expect(editor.isFeatureGranted('text.italic')).toBe(true); // FREE → always granted (1a-3c)
  });

  // Audit gap (Phase-5 re-audit, M4a): entitlements omitted entirely vs. passed
  // as `undefined` vs. passed as `null` must all fall back to grant-all
  // identically — this equivalence held only "by accident" via
  // feature-gate.js's `cfg.entitlements || null` normalization, and was never
  // directly asserted.
  it('entitlements omitted / undefined / null are all equivalent (grant-all fallback)', () => {
    const omitted = safeMerge({ entitlements: null }, {});
    const explicitUndefined = safeMerge({ entitlements: null }, { entitlements: undefined });
    const explicitNull = safeMerge({ entitlements: null }, { entitlements: null });
    // All three must produce a config createFeatureGate treats identically —
    // i.e. none of them is a truthy object with isGranted.
    for (const cfg of [omitted, explicitUndefined, explicitNull]) {
      expect(!!(cfg.entitlements && typeof cfg.entitlements.isGranted === 'function')).toBe(false);
    }

    // And end-to-end: all three grant everything (the documented default).
    target = makeTarget();
    editor = new OpenEditor(target, {});
    expect(editor.isFeatureGranted('text.bold')).toBe(true);
    editor.destroy();

    target = makeTarget();
    editor = new OpenEditor(target, { entitlements: undefined });
    expect(editor.isFeatureGranted('text.bold')).toBe(true);
    editor.destroy();

    target = makeTarget();
    editor = new OpenEditor(target, { entitlements: null });
    expect(editor.isFeatureGranted('text.bold')).toBe(true);
  });

  // Audit gap (Phase-5 re-audit, M4b): the whole point of isPlainObject()
  // gating recursion is that PLAIN objects still deep-merge (siblings
  // preserved) — only class instances are assigned by reference. No config
  // key in DEFAULTS currently has a populated nested-object default to prove
  // this through OpenEditor end-to-end, so this asserts safeMerge's general
  // contract directly: merging a partial plain object into an existing plain
  // object must PRESERVE the untouched sibling keys, not clobber them.
  it('safeMerge still deep-merges a legitimate nested PLAIN object, preserving untouched siblings', () => {
    const target = { autosave: { enabled: true, intervalMs: 5000, debounceMs: 500 } };
    safeMerge(target, { autosave: { intervalMs: 9000 } });
    expect(target.autosave).toEqual({ enabled: true, intervalMs: 9000, debounceMs: 500 });

    // Contrast: a class instance passed for the SAME kind of key is NOT
    // merged into the existing plain object — it replaces it wholesale by
    // reference, exactly like the entitlements case above.
    class Config { constructor(v) { this.intervalMs = v; } }
    const target2 = { autosave: { enabled: true, intervalMs: 5000, debounceMs: 500 } };
    const cfg = new Config(9000);
    safeMerge(target2, { autosave: cfg });
    expect(target2.autosave).toBe(cfg); // replaced wholesale, not merged
    expect(target2.autosave.debounceMs).toBeUndefined(); // siblings NOT preserved for a class instance
  });
});

// ─── poweredBy attribution footer (its own strip BELOW the editable) ─────────
describe('poweredBy attribution footer', () => {
  let editor, target;
  afterEach(() => cleanup(editor, target));

  const strip = (ed) => ed.getContainer().querySelector('.oe-powered-by');

  it('renders a "Powered by Open Editor" strip by default', () => {
    target = makeTarget();
    editor = new OpenEditor(target);
    expect(strip(editor)).toBeTruthy();
    expect(strip(editor).textContent).toBe('Powered by Open Editor');
  });

  it('the strip lives BELOW the editable (a wrapper child, not inside the editable)', () => {
    target = makeTarget();
    editor = new OpenEditor(target);
    const el = strip(editor);
    // Never inside the editable — otherwise it would overlap typed text and
    // pollute getHTML(). It must be a sibling of the editable in the wrapper.
    expect(editor.getEditorElement().contains(el)).toBe(false);
    expect(el.parentNode.classList.contains('oe-wrapper')).toBe(true);
    // It sits DIRECTLY AFTER the editable in flow (an absolutely-positioned
    // type-around affordance may also be a wrapper child, but it is out of flow).
    expect(editor.getEditorElement().nextElementSibling).toBe(el);
  });

  it('poweredBy:false renders no strip (user opt-out)', () => {
    target = makeTarget();
    editor = new OpenEditor(target, { poweredBy: false });
    expect(strip(editor)).toBeNull();
  });

  it('a custom string is used verbatim', () => {
    target = makeTarget();
    editor = new OpenEditor(target, { poweredBy: 'Made with MyEditor' });
    expect(strip(editor).textContent).toBe('Made with MyEditor');
  });

  it('the footer is NEVER part of the saved content (getHTML has no attribution)', () => {
    target = makeTarget();
    editor = new OpenEditor(target, { poweredBy: true });
    editor.setHTML('<p>hello</p>');
    const html = editor.getHTML();
    expect(html).not.toContain('Powered by');
    expect(html).not.toContain('oe-powered-by');
  });
});
