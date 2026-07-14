/**
 * 14.11 — RTL text direction. Config `direction: 'rtl'` and the runtime
 * setDirection()/getDirection() API set dir on the editable (text flow) and the
 * wrapper (so the toolbar mirrors via [dir="rtl"] CSS).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { OpenEditor } from '../src/editor.js';

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

describe('RTL direction (14.11)', () => {
  it('defaults to ltr on the editable and wrapper', () => {
    make();
    expect(editor.getDirection()).toBe('ltr');
    expect(editor.getEditorElement().getAttribute('dir')).toBe('ltr');
    expect(editor._wrapper.getAttribute('dir')).toBe('ltr');
  });

  it('config { direction: "rtl" } sets dir="rtl" on editable and wrapper', () => {
    make({ direction: 'rtl' });
    expect(editor.getDirection()).toBe('rtl');
    expect(editor.getEditorElement().getAttribute('dir')).toBe('rtl');
    expect(editor._wrapper.getAttribute('dir')).toBe('rtl');
  });

  it('an unknown direction value is treated as ltr (defensive)', () => {
    make({ direction: 'sideways' });
    expect(editor.getDirection()).toBe('ltr');
    expect(editor.getEditorElement().getAttribute('dir')).toBe('ltr');
  });

  it('setDirection("rtl") flips at runtime and emits directionChange once', () => {
    make();
    let evt = null, count = 0;
    editor.on('directionChange', (d) => { evt = d; count++; });
    editor.setDirection('rtl');
    expect(editor.getDirection()).toBe('rtl');
    expect(editor.getEditorElement().getAttribute('dir')).toBe('rtl');
    expect(editor._wrapper.getAttribute('dir')).toBe('rtl');
    expect(evt).toEqual({ direction: 'rtl' });
    expect(count).toBe(1);
  });

  it('setDirection to the SAME value does not re-emit', () => {
    make({ direction: 'rtl' });
    let count = 0;
    editor.on('directionChange', () => { count++; });
    editor.setDirection('rtl');
    expect(count).toBe(0);
  });

  it('setDirection back to ltr restores dir="ltr"', () => {
    make({ direction: 'rtl' });
    editor.setDirection('ltr');
    expect(editor.getDirection()).toBe('ltr');
    expect(editor.getEditorElement().getAttribute('dir')).toBe('ltr');
  });

  it('RTL editing keeps content intact (no structural corruption)', () => {
    make({ direction: 'rtl' });
    editor.getEditorElement().innerHTML = '<p>مرحبا world</p>';
    expect(editor.getHTML()).toBe('<p>مرحبا world</p>');
    expect(editor.getEditorElement().querySelectorAll('p').length).toBe(1);
  });
});

describe('authored bidi content survives sanitization (14.12 / F6)', () => {
  it('keeps dir on block, inline, and table tags', () => {
    make();
    editor.setHTML('<p dir="rtl">a</p><div dir="ltr">b</div><span dir="rtl">c</span>');
    const html = editor.getHTML();
    expect(html).toContain('<p dir="rtl">');
    expect(html).toContain('<div dir="ltr">');
    expect(html).toContain('<span dir="rtl">');
  });

  it('keeps <bdi> and <bdo> elements (they were previously stripped)', () => {
    make();
    editor.setHTML('<p>order: <bdi>user-1</bdi> and <bdo dir="rtl">rev</bdo></p>');
    const html = editor.getHTML();
    expect(html).toContain('<bdi>');
    expect(html).toContain('<bdo dir="rtl">');
  });

  it('still strips event handlers from dir-bearing elements (no XSS regression)', () => {
    make();
    editor.setHTML('<p dir="rtl" onclick="alert(1)">x</p>');
    const html = editor.getHTML();
    expect(html).toContain('dir="rtl"');
    expect(html).not.toContain('onclick');
  });
});
