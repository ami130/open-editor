/**
 * Toolbar system tests — Part A: rendering, command execution, state sync,
 * selection preservation, keyboard nav, color picker, fullscreen, status bar,
 * inline toolbar, i18n, icons, teardown, and performance smoke test.
 * Split from toolbar.test.js (Phase 7) to stay within the 300-line limit.
 */
import { describe, it, expect, vi } from 'vitest';
import { OpenEditor } from '../src/editor.js';
import { resolveLocale, EN_LOCALE } from '../src/ui/toolbar/locale.js';
import { iconSVG } from '../src/ui/toolbar/icons.js';

function makeEditor(config = {}) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  const editor = new OpenEditor(target, config);
  return { editor, target };
}
function cleanup(editor, target) {
  if (editor && !editor.isDestroyed()) editor.destroy();
  if (target && target.parentNode) target.parentNode.removeChild(target);
}
function setSelectionAll(editor) {
  const el = editor.getEditorElement();
  const r = document.createRange();
  r.selectNodeContents(el);
  const s = window.getSelection();
  s.removeAllRanges(); s.addRange(r);
}

describe('Toolbar — rendering (7.1, 7.5, 7.11)', () => {
  it('renders a role=toolbar with buttons by default', () => {
    const { editor, target } = makeEditor();
    const tb = target.querySelector('.oe-toolbar');
    expect(tb).toBeTruthy();
    expect(tb.getAttribute('role')).toBe('toolbar');
    expect(tb.querySelectorAll('.oe-tb__btn').length).toBeGreaterThan(5);
    cleanup(editor, target);
  });

  it('toolbar:false renders NO toolbar (bare contenteditable)', () => {
    const { editor, target } = makeEditor({ toolbar: false });
    expect(target.querySelector('.oe-toolbar')).toBeNull();
    expect(editor.toolbar).toBeNull();
    cleanup(editor, target);
  });

  it('buttons have aria-label and group separators exist', () => {
    const { editor, target } = makeEditor();
    const bold = target.querySelector('.oe-tb__btn[data-name="bold"]');
    expect(bold.getAttribute('aria-label')).toBe('Bold');
    expect(target.querySelectorAll('.oe-toolbar__sep').length).toBeGreaterThan(0);
    cleanup(editor, target);
  });
});

describe('Toolbar — command execution + state sync (7.12)', () => {
  it('clicking bold executes the bold command', () => {
    const { editor, target } = makeEditor();
    const spy = vi.spyOn(editor.commands, 'execute');
    setSelectionAll(editor);
    target.querySelector('.oe-tb__btn[data-name="bold"]').click();
    expect(spy).toHaveBeenCalledWith('bold');
    cleanup(editor, target);
  });

  it('button reflects active state via aria-pressed when synced', () => {
    const { editor, target } = makeEditor();
    const btn = target.querySelector('.oe-tb__btn[data-name="bold"]');
    vi.spyOn(editor.commands, 'isActive').mockImplementation((n) => n === 'bold');
    editor.toolbar._syncNow();
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(btn.classList.contains('oe-tb__btn--active')).toBe(true);
    cleanup(editor, target);
  });

  it('disabled command sets button disabled', () => {
    const { editor, target } = makeEditor();
    const btn = target.querySelector('.oe-tb__btn[data-name="undo"]');
    vi.spyOn(editor.commands, 'isEnabled').mockImplementation(() => false);
    editor.toolbar._syncNow();
    expect(btn.disabled).toBe(true);
    cleanup(editor, target);
  });
});

describe('Toolbar — selection preservation (7.13)', () => {
  it('saves selection on mousedown and restores before executing', () => {
    const { editor, target } = makeEditor();
    setSelectionAll(editor);
    const saveSpy = vi.spyOn(editor.selection, 'save');
    const restoreSpy = vi.spyOn(editor.selection, 'restore');
    const btn = target.querySelector('.oe-tb__btn[data-name="bold"]');
    btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(saveSpy).toHaveBeenCalled();
    btn.click();
    expect(restoreSpy).toHaveBeenCalled();
    cleanup(editor, target);
  });
});

describe('Toolbar — keyboard nav (7.4)', () => {
  it('first focusable has tabindex 0, others -1', () => {
    const { editor, target } = makeEditor();
    const btns = target.querySelectorAll('.oe-tb__btn, .oe-tb__dd-trigger');
    expect(btns[0].getAttribute('tabindex')).toBe('0');
    cleanup(editor, target);
  });

  it('ArrowRight moves the tabbable slot forward', () => {
    const { editor, target } = makeEditor();
    const focusables = editor.toolbar._focusables.filter((b) => !b.disabled);
    focusables[0].focus();
    editor.toolbar._el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(focusables[1].getAttribute('tabindex')).toBe('0');
    cleanup(editor, target);
  });
});

describe('Toolbar — dropdowns (7.6)', () => {
  it('heading dropdown opens and lists options', () => {
    const { editor, target } = makeEditor();
    const trigger = target.querySelector('.oe-tb__dd-trigger[aria-label="Format"]');
    trigger.click();
    const panel = Array.from(document.querySelectorAll('.oe-tb__dd-panel'))
      .find((p) => !p.hidden);
    expect(panel).toBeTruthy();
    expect(panel.querySelectorAll('.oe-tb__dd-option').length).toBeGreaterThan(3);
    cleanup(editor, target);
  });

  it('heading option executes its command', () => {
    const { editor, target } = makeEditor();
    const spy = vi.spyOn(editor.commands, 'execute');
    target.querySelector('.oe-tb__dd-trigger[aria-label="Format"]').click();
    const opt = Array.from(document.querySelectorAll('.oe-tb__dd-option'))
      .find((el) => !el.closest('[hidden]'));
    if (opt) opt.click();
    expect(spy).toHaveBeenCalled();
    cleanup(editor, target);
  });
});

describe('Toolbar — color picker (7.10)', () => {
  it('swatch click executes textColor with a color', () => {
    const { editor, target } = makeEditor();
    const spy = vi.spyOn(editor.commands, 'execute');
    setSelectionAll(editor);
    const colorTrigger = target.querySelector('.oe-tb__color .oe-tb__btn');
    colorTrigger.click();
    const swatch = Array.from(document.querySelectorAll('.oe-tb__swatch'))
      .find((el) => !el.closest('[hidden]'));
    if (swatch) swatch.click();
    expect(spy).toHaveBeenCalledWith('textColor', expect.any(String));
    cleanup(editor, target);
  });
});

describe('Editor — fullscreen + print (7.16/7.17)', () => {
  it('toggleFullscreen adds and removes the fullscreen class + events', () => {
    const { editor, target } = makeEditor();
    const enter = vi.fn(); const exit = vi.fn();
    editor.on('fullscreenEnter', enter); editor.on('fullscreenExit', exit);
    editor.toggleFullscreen();
    expect(editor.isFullscreen()).toBe(true);
    expect(enter).toHaveBeenCalled();
    editor.toggleFullscreen();
    expect(editor.isFullscreen()).toBe(false);
    expect(exit).toHaveBeenCalled();
    cleanup(editor, target);
  });

  it('print does not throw when window.open is blocked (returns null)', () => {
    const { editor, target } = makeEditor();
    const orig = window.open;
    window.open = () => null;
    expect(() => editor.print()).not.toThrow();
    window.open = orig;
    cleanup(editor, target);
  });
});

describe('Status bar (7.20)', () => {
  it('renders and shows word/char counts', () => {
    const { editor, target } = makeEditor();
    editor.getEditorElement().innerHTML = '<p>hello world foo</p>';
    editor.statusBar._render();
    const bar = target.querySelector('.oe-statusbar');
    expect(bar).toBeTruthy();
    expect(bar.textContent).toContain('3 words');
    cleanup(editor, target);
  });

  it('statusBar:false renders no status bar', () => {
    const { editor, target } = makeEditor({ statusBar: false });
    expect(target.querySelector('.oe-statusbar')).toBeNull();
    expect(editor.statusBar).toBeNull();
    cleanup(editor, target);
  });

  it('16.7.9 — shows a selection-scoped count when the selection is non-collapsed', () => {
    const { editor, target } = makeEditor();
    editor.getEditorElement().innerHTML = '<p>hello world foo bar baz</p>';
    setSelectionAll(editor);
    editor.statusBar._render();
    const bar = target.querySelector('.oe-statusbar');
    // All 5 words selected → "5 words, N chars selected".
    expect(bar.textContent).toContain('5 words');
    expect(bar.textContent).toContain('selected');
    cleanup(editor, target);
  });

  it('16.7.9 — reverts to the whole-document count when the selection collapses', () => {
    const { editor, target } = makeEditor();
    const el = editor.getEditorElement();
    el.innerHTML = '<p>hello world foo</p>';
    // Collapse the caret inside the paragraph (no selected range).
    const r = document.createRange();
    r.setStart(el.firstChild.firstChild, 0);
    r.collapse(true);
    const s = window.getSelection();
    s.removeAllRanges(); s.addRange(r);
    editor.statusBar._render();
    const bar = target.querySelector('.oe-statusbar');
    expect(bar.textContent).toContain('3 words');
    expect(bar.textContent).not.toContain('selected');
    cleanup(editor, target);
  });
});

describe('Inline bubble toolbar (7.19)', () => {
  it('is created only when inlineToolbar:true', () => {
    const a = makeEditor();
    expect(a.editor.inlineToolbar).toBeNull();
    cleanup(a.editor, a.target);
    const b = makeEditor({ inlineToolbar: true });
    expect(b.editor.inlineToolbar).toBeTruthy();
    expect(b.target.querySelector('.oe-bubble')).toBeTruthy();
    cleanup(b.editor, b.target);
  });
});

describe('i18n (7.23/7.24)', () => {
  it('resolveLocale returns en bundle by default', () => {
    expect(resolveLocale('en').bold).toBe('Bold');
  });
  it('custom object overrides specific strings, keeps the rest', () => {
    const loc = resolveLocale({ bold: 'Gras' });
    expect(loc.bold).toBe('Gras');
    expect(loc.italic).toBe(EN_LOCALE.italic);
  });
  it('custom locale label appears on the button', () => {
    const { editor, target } = makeEditor({ toolbar: { locale: { bold: 'Gras' } } });
    expect(target.querySelector('.oe-tb__btn[data-name="bold"]').getAttribute('aria-label')).toBe('Gras');
    cleanup(editor, target);
  });
});

describe('icons', () => {
  it('iconSVG wraps known icons and returns a fallback glyph for unknown', () => {
    expect(iconSVG('bold')).toContain('<svg');
    const fallback = iconSVG('nope');
    expect(fallback).toContain('<svg');
    expect(fallback).toContain('<rect');
  });
});

describe('Teardown', () => {
  it('destroy removes toolbar, status bar, and listeners', () => {
    const { editor, target } = makeEditor({ inlineToolbar: true });
    editor.destroy();
    expect(target.querySelector('.oe-toolbar')).toBeNull();
    expect(target.querySelector('.oe-statusbar')).toBeNull();
    expect(target.querySelector('.oe-bubble')).toBeNull();
    if (target.parentNode) target.parentNode.removeChild(target);
  });
});

describe('Toolbar.addButton — duplicate-name guard (LOW)', () => {
  it('ignores a second addButton with an already-present name', () => {
    const { editor, target } = makeEditor();
    const before = editor.toolbar._controls.length;
    const descriptor = { name: 'myPluginBtn', type: 'button', icon: 'bold', tooltip: 'X', onClick: () => {} };
    editor.toolbar.addButton(descriptor);
    editor.toolbar.addButton(descriptor); // duplicate — must be skipped
    const matches = editor.toolbar._controls.filter((c) => c.item && c.item.name === 'myPluginBtn');
    expect(matches.length).toBe(1);
    expect(editor.toolbar._controls.length).toBe(before + 1);
    cleanup(editor, target);
  });

  it('removeButton removes the added button, and re-adding then works', () => {
    const { editor, target } = makeEditor();
    editor.toolbar.addButton({ name: 'tmpBtn', type: 'button', icon: 'bold', tooltip: 'X', onClick: () => {} });
    editor.toolbar.removeButton('tmpBtn');
    expect(editor.toolbar._controls.some((c) => c.item && c.item.name === 'tmpBtn')).toBe(false);
    // Re-adding after removal must work (the guard only blocks LIVE duplicates).
    editor.toolbar.addButton({ name: 'tmpBtn', type: 'button', icon: 'bold', tooltip: 'X', onClick: () => {} });
    expect(editor.toolbar._controls.filter((c) => c.item && c.item.name === 'tmpBtn').length).toBe(1);
    cleanup(editor, target);
  });
});

describe('Performance budget (7.25) — smoke check', () => {
  it('toolbar state-sync completes on a large document without throwing', () => {
    const { editor, target } = makeEditor();
    editor.getEditorElement().innerHTML = '<p>' + 'word '.repeat(2000) + '</p>';
    expect(() => editor.toolbar._syncNow()).not.toThrow();
    cleanup(editor, target);
  });

  it('getHTML on a large document completes and returns a string', () => {
    const { editor, target } = makeEditor({ toolbar: false, statusBar: false });
    editor.getEditorElement().innerHTML = '<p>' + 'word '.repeat(5000) + '</p>';
    expect(typeof editor.getHTML()).toBe('string');
    cleanup(editor, target);
  });
});
