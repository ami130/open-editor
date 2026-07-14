/**
 * Phase 15 theme API (15.5 setTheme, 15.6 setCSSVar, 15.10 auto, 15.11 flash guard).
 * Token CSS correctness (light pixel-identity, dark/minimal appearance) is proven
 * by the e2e snapshot suite; these unit tests lock the API contract + attribute
 * wiring + injection-safety guards.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { OpenEditor } from '../src/editor.js';
import { THEME_TOKENS_CSS, THEME_TOKENS_DARK } from '../src/utils/theme-css.js';

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

describe('theme config + flash guard (15.11)', () => {
  it('defaults to light with no data-oe-theme attribute', () => {
    make();
    expect(editor.getTheme()).toBe('light');
    expect(editor._wrapper.getAttribute('data-oe-theme')).toBeNull();
    expect(editor.getEditorElement().getAttribute('data-oe-theme')).toBeNull();
  });

  it('config theme:"dark" stamps the attribute on wrapper AND editable at build time', () => {
    make({ theme: 'dark' });
    expect(editor.getTheme()).toBe('dark');
    // flash guard: both carry the attribute before any runtime call
    expect(editor._wrapper.getAttribute('data-oe-theme')).toBe('dark');
    expect(editor.getEditorElement().getAttribute('data-oe-theme')).toBe('dark');
  });

  it('an unknown config theme falls back to light', () => {
    make({ theme: 'neon' });
    expect(editor.getTheme()).toBe('light');
    expect(editor._wrapper.getAttribute('data-oe-theme')).toBeNull();
  });
});

describe('setTheme / getTheme (15.5)', () => {
  it('switches theme, sets attr on wrapper+editable, emits themeChange once', () => {
    make();
    let evt = null, count = 0;
    editor.on('themeChange', (d) => { evt = d; count++; });
    editor.setTheme('dark');
    expect(editor.getTheme()).toBe('dark');
    expect(editor._wrapper.getAttribute('data-oe-theme')).toBe('dark');
    expect(editor.getEditorElement().getAttribute('data-oe-theme')).toBe('dark');
    expect(evt).toEqual({ theme: 'dark' });
    expect(count).toBe(1);
  });

  it('setTheme("light") removes the attribute (default cascade)', () => {
    make({ theme: 'dark' });
    editor.setTheme('light');
    expect(editor.getTheme()).toBe('light');
    expect(editor._wrapper.getAttribute('data-oe-theme')).toBeNull();
  });

  it('re-setting the same theme does not emit', () => {
    make({ theme: 'dark' });
    let count = 0;
    editor.on('themeChange', () => { count++; });
    editor.setTheme('dark');
    expect(count).toBe(0);
  });

  it('supports minimal and auto', () => {
    make();
    editor.setTheme('minimal');
    expect(editor._wrapper.getAttribute('data-oe-theme')).toBe('minimal');
    editor.setTheme('auto');
    expect(editor._wrapper.getAttribute('data-oe-theme')).toBe('auto');
  });
});

describe('setCSSVar / getCSSVar (15.6)', () => {
  it('sets a variable on the wrapper (with and without -- prefix)', () => {
    make();
    editor.setCSSVar('--oe-primary', '#ff0000');
    expect(editor._wrapper.style.getPropertyValue('--oe-primary')).toBe('#ff0000');
    editor.setCSSVar('oe-bg', '#123456');
    expect(editor._wrapper.style.getPropertyValue('--oe-bg')).toBe('#123456');
  });

  it('rejects an injection attempt in the value', () => {
    make();
    editor.setCSSVar('--x', 'red; background:url(evil)');
    expect(editor._wrapper.style.getPropertyValue('--x')).toBe('');
  });

  it('rejects a malformed property name', () => {
    make();
    editor.setCSSVar('--bad name{', 'red');
    expect(editor._wrapper.getAttribute('style') || '').not.toContain('bad name');
  });

  it('rejects url(), expression() and javascript: value vectors', () => {
    make();
    editor.setCSSVar('--a', 'url(https://evil.example/x.png)');
    editor.setCSSVar('--b', 'URL(data:text/css,evil)');
    editor.setCSSVar('--c', 'expression(alert(1))');
    editor.setCSSVar('--d', 'javascript:alert(1)');
    for (const p of ['--a', '--b', '--c', '--d']) {
      expect(editor._wrapper.style.getPropertyValue(p)).toBe('');
    }
  });

  it('rejects a value containing a newline (smuggled second declaration)', () => {
    make();
    editor.setCSSVar('--e', 'red\n--oe-bg: black');
    expect(editor._wrapper.style.getPropertyValue('--e')).toBe('');
  });

  it('accepts legitimate multi-token values (rgb(), gradients-free colors)', () => {
    make();
    editor.setCSSVar('--f', 'rgb(10, 20, 30)');
    expect(editor._wrapper.style.getPropertyValue('--f')).toBe('rgb(10, 20, 30)');
  });
});

describe('token CSS structure (15.1/15.3/15.4/15.10)', () => {
  it('defines light on :root/.oe-wrapper and themes on data-oe-theme', () => {
    expect(THEME_TOKENS_CSS).toContain(':root, .oe-wrapper');
    expect(THEME_TOKENS_CSS).toContain('[data-oe-theme="dark"]');
    expect(THEME_TOKENS_CSS).toContain('[data-oe-theme="minimal"]');
    // 15.10 auto follows OS via prefers-color-scheme
    expect(THEME_TOKENS_CSS).toContain('prefers-color-scheme: dark');
    expect(THEME_TOKENS_CSS).toContain('[data-oe-theme="auto"]');
  });

  it('dark overrides the semantic surface tokens', () => {
    expect(THEME_TOKENS_DARK).toContain('--oe-bg:');
    expect(THEME_TOKENS_DARK).toContain('--oe-fg:');
    expect(THEME_TOKENS_DARK).toContain('--oe-chrome-fg:'); // chrome text flips too
  });
});
