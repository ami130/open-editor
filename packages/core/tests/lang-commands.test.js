/**
 * 17.5.10 — text-part language: wrap, auto-RTL, toggle-off, round-trip,
 * conditional dropdown, code validation.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { OpenEditor } from '../src/editor.js';

let editor, target;
function make(config = {}) {
  target = document.createElement('div');
  document.body.appendChild(target);
  editor = new OpenEditor(target, config);
  return editor;
}
function selectRange(node, a, b) {
  const r = document.createRange();
  r.setStart(node, a); r.setEnd(node, b);
  const s = window.getSelection();
  s.removeAllRanges(); s.addRange(r);
}
afterEach(() => {
  if (editor && !editor.isDestroyed()) editor.destroy();
  if (target && target.parentNode) target.remove();
  editor = target = null;
});

describe('17.5.10 — textPartLanguage', () => {
  it('wraps the selection with lang; RTL codes get dir=rtl; round-trips', () => {
    make();
    editor.setHTML('<p>hello مرحبا world</p>');
    const node = editor.getEditorElement().querySelector('p').firstChild;
    selectRange(node, 6, 11); // مرحبا
    editor.commands.execute('textPartLanguage', 'ar');
    expect(editor.getHTML()).toContain('<span lang="ar" dir="rtl">مرحبا</span>');
    editor.setHTML(editor.getHTML());
    expect(editor.getHTML()).toContain('lang="ar"');
  });

  it('LTR codes get no dir; toggle-off unwraps from inside', () => {
    make();
    editor.setHTML('<p>bonjour</p>');
    const node = editor.getEditorElement().querySelector('p').firstChild;
    selectRange(node, 0, 7);
    editor.commands.execute('textPartLanguage', 'fr');
    expect(editor.getHTML()).toContain('<span lang="fr">bonjour</span>');
    expect(editor.getHTML()).not.toContain('dir=');
    const span = editor.getEditorElement().querySelector('span[lang]');
    selectRange(span.firstChild, 2, 2);
    editor.commands.execute('textPartLanguage', 'fr');
    expect(editor.getHTML()).not.toContain('lang=');
    expect(editor.getText()).toContain('bonjour');
  });

  it('rejects malformed codes; dropdown renders only when configured', () => {
    make();
    editor.setHTML('<p>x</p>');
    const node = editor.getEditorElement().querySelector('p').firstChild;
    selectRange(node, 0, 1);
    editor.commands.execute('textPartLanguage', '"><img>');
    expect(editor.getHTML()).not.toContain('lang=');
    expect(target.querySelector('.oe-tb__dd-trigger[aria-label="Language"]')).toBeNull();
    editor.destroy(); target.remove();
    make({ textPartLanguages: [{ code: 'ar', label: 'العربية' }] });
    expect(target.querySelector('.oe-tb__dd-trigger[aria-label="Language"]')).toBeTruthy();
  });
});
