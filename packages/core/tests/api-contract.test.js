/**
 * Phase 16 — PUBLIC API FREEZE CONTRACT.
 *
 * This file IS the freeze. It enumerates the frozen 1.0 public surface — the
 * instance methods, the namespaced methods, the semantic event names, and the
 * config keys — and asserts the real implementation matches. If a rename, a
 * removed method, or a dropped config key drifts the surface, this test fails
 * the build. Changing the frozen surface therefore requires editing this file
 * deliberately (a conscious, reviewed act), not silently.
 *
 * SCOPE: the core surface is frozen. `plugins.*` and `ui.*` are "stable from
 * 1.x" (not frozen) per the README freeze-boundary note — their presence is
 * checked, but they are documented as subject to additive change in 1.x.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { OpenEditor } from '../src/editor.js';
import { DEFAULTS } from '../src/editor-config.js';

let editor, target;
function make(cfg) {
  target = document.createElement('div');
  document.body.appendChild(target);
  editor = new OpenEditor(target, cfg);
  return editor;
}
afterEach(() => {
  if (editor && !editor.isDestroyed()) editor.destroy();
  if (target && target.parentNode) target.remove();
});

// ── The frozen instance methods (editor.*) ──
const INSTANCE_METHODS = [
  // content
  'getHTML', 'setHTML', 'getText', 'getJSON', 'setJSON', 'isEmpty', 'getWordCount', 'getCharCount',
  // state
  'focus', 'blur', 'enable', 'disable', 'setReadOnly', 'isReadOnly',
  'setTheme', 'getTheme', 'setCSSVar', 'getCSSVar', 'setDirection', 'getDirection',
  'toggleFullscreen', 'isFullscreen', 'print', 'reset', 'destroy',
  // history
  'undo', 'redo', 'canUndo', 'canRedo',
  // events
  'on', 'off', 'once', 'emit',
  // introspection
  'getContainer', 'getEditorElement', 'getVersion', 'isDestroyed',
];

// ── The frozen namespaced methods ──
const NAMESPACE_METHODS = {
  selection: ['get', 'save', 'restore', 'getHTML', 'getText', 'selectAll'],
  commands: ['execute', 'isActive', 'isEnabled', 'getAll', 'register'],
  shortcuts: ['register', 'unregister', 'getAll'],
};

// ── The frozen SEMANTIC event names (raw DOM pass-through events are NOT part
//    of the frozen contract — see README). ──
const FROZEN_EVENTS = [
  'beforeChange', 'onChange', 'beforeSetHTML', 'setHTML', 'reset', 'maxLengthExceeded',
  'focus', 'blur', 'selectionChange', 'stateChange', 'readOnlyChange',
  'directionChange', 'themeChange',
  'beforeCommand', 'afterCommand', 'undo', 'redo',
  'beforePaste', 'afterPaste',
  'beforeInit', 'init', 'afterInit', 'ready', 'beforeDestroy', 'destroy',
  'autosaveSaved', 'autosaveRestored', 'autosaveFailed', 'autosaveDraftSkipped',
  'pluginInstalled', 'pluginUninstalled',
  'error',
];

// ── The frozen config keys (top-level). ──
const FROZEN_CONFIG_KEYS = [
  'debug', 'logger', 'toolbar', 'statusBar', 'readonly', 'spellcheck', 'autofocus',
  'iframe', 'direction', 'theme', 'minHeight', 'maxHeight', 'height', 'defaultContent',
  'placeholder', 'sanitize', 'allowTags', 'allowAttributes', 'imageAllowDataUri',
  'imageDefaultWidth', 'imageAvailableClasses', 'imageOpenOnDblClick', 'imageUploadUrl', 'tableAvailableClasses',
  'tableDefaultClass', 'tableDefaultHeaderRow', 'denyTags', 'askBeforePasteHTML',
  'askBeforePasteFromWord', 'defaultActionOnPaste', 'defaultActionOnPasteFromWord',
  'pasteStripStyles', 'specialCharacters', 'emojis', 'formatPainterSticky',
  'codeBlockLanguages', 'sourceModeBeautify', 'sourceModeHighlight', 'maxLength', 'autosave', 'onChange',
  'locale', 'inlineToolbar', 'blockquoteToolbar', 'warnOnUnload', 'autoformat', 'mentions',
];

describe('16.D — frozen instance methods', () => {
  it('every frozen method exists and is callable', () => {
    make();
    for (const m of INSTANCE_METHODS) {
      expect(typeof editor[m], `editor.${m} must be a function`).toBe('function');
    }
  });
});

describe('16.D — frozen namespaces', () => {
  it('selection / commands / shortcuts expose their frozen methods', () => {
    make();
    for (const [ns, methods] of Object.entries(NAMESPACE_METHODS)) {
      expect(editor[ns], `editor.${ns} namespace must exist`).toBeTruthy();
      for (const m of methods) {
        expect(typeof editor[ns][m], `editor.${ns}.${m} must be a function`).toBe('function');
      }
    }
  });

  it('plugins / ui namespaces are present (stable-from-1.x, not frozen)', () => {
    make();
    expect(editor.plugins).toBeTruthy();
    expect(editor.ui).toBeTruthy();
    for (const m of ['install', 'uninstall', 'get', 'getAll']) {
      expect(typeof editor.plugins[m]).toBe('function');
    }
    for (const sub of ['modal', 'tooltip', 'contextMenu']) {
      expect(editor.ui[sub], `editor.ui.${sub}`).toBeTruthy();
    }
  });
});

describe('16.D — frozen config keys', () => {
  it('DEFAULTS contains exactly the frozen key set (no drift)', () => {
    expect(new Set(Object.keys(DEFAULTS))).toEqual(new Set(FROZEN_CONFIG_KEYS));
  });
});

describe('16.D — frozen return-type contracts', () => {
  it('getAll() methods return a Map', () => {
    make();
    expect(editor.commands.getAll()).toBeInstanceOf(Map);
    expect(editor.shortcuts.getAll()).toBeInstanceOf(Map);
    expect(editor.plugins.getAll()).toBeInstanceOf(Map);
  });

  it('boolean predicates return booleans', () => {
    make();
    for (const m of ['isReadOnly', 'isFullscreen', 'isDestroyed', 'canUndo', 'canRedo', 'isEmpty']) {
      expect(typeof editor[m](), `editor.${m}()`).toBe('boolean');
    }
  });

  it('string getters return strings', () => {
    make();
    for (const m of ['getHTML', 'getText', 'getTheme', 'getDirection', 'getVersion']) {
      expect(typeof editor[m](), `editor.${m}()`).toBe('string');
    }
    expect(typeof editor.getJSON()).toBe('object');
  });
});

describe('16.D — frozen events are all emittable', () => {
  it('on()/emit() round-trip for every frozen event name', () => {
    make();
    for (const name of FROZEN_EVENTS) {
      let got = false;
      const h = () => { got = true; };
      editor.on(name, h);
      editor.emit(name, {});
      editor.off(name, h);
      expect(got, `event "${name}" did not round-trip`).toBe(true);
    }
  });
});

// The README declares payload SHAPES part of the frozen contract, so freeze the
// documented keys of the events a consumer builds against. Each event is fired
// through a REAL editor action (not a synthetic emit) so this also proves wiring.
describe('16.D — frozen event PAYLOAD shapes', () => {
  function capture(name, trigger) {
    make();
    let payload;
    editor.on(name, (p) => { payload = p; });
    trigger(editor);
    return payload;
  }

  it('onChange fires {html, text} through the real debounced change path', () => {
    vi.useFakeTimers();
    try {
      make();
      let payload;
      editor.on('onChange', (p) => { payload = p; });
      editor.getEditorElement().innerHTML = '<p>hi</p>';
      editor.getEditorElement().dispatchEvent(new Event('input'));
      vi.advanceTimersByTime(400);   // flush the debounce
      expect(payload).toHaveProperty('html');
      expect(payload).toHaveProperty('text');
    } finally {
      vi.useRealTimers();
    }
  });

  it('setHTML fires {html} after applying', () => {
    const p = capture('setHTML', (e) => e.setHTML('<p>hi</p>'));
    expect(p).toHaveProperty('html');
    expect(typeof p.html).toBe('string');
  });

  it('beforeSetHTML fires {html, preventDefault}', () => {
    const p = capture('beforeSetHTML', (e) => e.setHTML('<p>hi</p>'));
    expect(p).toHaveProperty('html');
    expect(typeof p.preventDefault).toBe('function');
  });

  it('themeChange fires {theme}', () => {
    const p = capture('themeChange', (e) => e.setTheme('dark'));
    expect(p).toEqual({ theme: 'dark' });
  });

  it('readOnlyChange fires {readOnly}', () => {
    const p = capture('readOnlyChange', (e) => e.setReadOnly(true));
    expect(p).toEqual({ readOnly: true });
  });

  it('directionChange fires {direction}', () => {
    const p = capture('directionChange', (e) => e.setDirection('rtl'));
    expect(p).toEqual({ direction: 'rtl' });
  });

  it('stateChange fires {key, value}', () => {
    const p = capture('stateChange', (e) => e._state.setMeta('demo', 1));
    expect(p).toHaveProperty('key', 'demo');
    expect(p).toHaveProperty('value', 1);
  });

  it('beforeCommand fires {command, args, preventDefault}', () => {
    const p = capture('beforeCommand', (e) => e.commands.execute('bold'));
    expect(p).toHaveProperty('command');
    expect(p).toHaveProperty('args');
    expect(typeof p.preventDefault).toBe('function');
  });

  it('afterCommand fires {command, args}', () => {
    const p = capture('afterCommand', (e) => e.commands.execute('bold'));
    expect(p).toHaveProperty('command');
    expect(p).toHaveProperty('args');
  });
});

// Freeze the CANCELABILITY semantics — the README's headline 1.0 guarantee.
describe('16.D — frozen cancelable-hook semantics', () => {
  it('beforeSetHTML preventDefault() aborts the write', () => {
    make();
    editor.setHTML('<p>original</p>');
    editor.on('beforeSetHTML', (e) => e.preventDefault());
    editor.setHTML('<p>replacement</p>');
    expect(editor.getHTML()).toContain('original');
    expect(editor.getHTML()).not.toContain('replacement');
  });

  it('beforeCommand preventDefault() aborts the command', () => {
    make();
    editor.setHTML('<p>plain</p>');
    editor.on('beforeCommand', (e) => { if (e.command === 'bold') e.preventDefault(); });
    editor.commands.execute('selectAll');
    editor.commands.execute('bold');
    expect(editor.getHTML().toLowerCase()).not.toContain('<strong');
  });

  it('beforeChange preventDefault() cancels the native input', () => {
    make();
    editor.on('beforeChange', (e) => e.preventDefault());
    const ev = new InputEvent('beforeinput', { inputType: 'insertText', data: 'x', bubbles: true, cancelable: true });
    editor.getEditorElement().dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });
});

describe('16.D — post-destroy safety (frozen surface never throws)', () => {
  it('all no-arg frozen methods are safe to call after destroy', () => {
    make();
    editor.destroy();
    const safe = [
      'getHTML', 'getText', 'isEmpty', 'getWordCount', 'getCharCount', 'getJSON',
      'focus', 'blur', 'enable', 'disable', 'isReadOnly', 'getTheme', 'getDirection',
      'isFullscreen', 'undo', 'redo', 'canUndo', 'canRedo',
      'getContainer', 'getEditorElement', 'getVersion', 'isDestroyed',
    ];
    for (const m of safe) {
      expect(() => editor[m](), `editor.${m}() after destroy`).not.toThrow();
    }
    // arg-taking mutators too
    expect(() => editor.setHTML('<p>x</p>')).not.toThrow();
    expect(() => editor.setJSON({ version: '1.0', content: [] })).not.toThrow();
    expect(() => editor.setReadOnly(true)).not.toThrow();
    expect(() => editor.setTheme('dark')).not.toThrow();
    expect(() => editor.setCSSVar('--oe-primary', '#fff')).not.toThrow();
    expect(() => editor.setDirection('rtl')).not.toThrow();
    expect(() => editor.reset()).not.toThrow();
  });
});
