/**
 * 17.5.8 — style presets: block + inline application, toggle, one-at-a-time,
 * conditional toolbar, sanitizer round-trip.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { OpenEditor } from '../src/editor.js';

const STYLES = [
  { label: 'Callout', element: 'p', classes: ['callout'] },
  { label: 'Fancy Title', element: 'h2', classes: ['fancy'] },
  { label: 'Highlight', classes: ['hl'] },
];

let editor, target;
function make(config = {}) {
  target = document.createElement('div');
  document.body.appendChild(target);
  editor = new OpenEditor(target, config);
  return editor;
}
function caretIn(node, offset = 0) {
  const r = document.createRange();
  r.setStart(node, offset); r.collapse(true);
  const s = window.getSelection();
  s.removeAllRanges(); s.addRange(r);
}
afterEach(() => {
  if (editor && !editor.isDestroyed()) editor.destroy();
  if (target && target.parentNode) target.remove();
  editor = target = null;
});

describe('17.5.8 — style presets', () => {
  it('no styles configured → no dropdown; configured → dropdown appears', () => {
    make();
    expect(target.querySelector('.oe-tb__dd-trigger[aria-label="Styles"]')).toBeNull();
    editor.destroy(); target.remove();
    make({ styles: STYLES });
    expect(target.querySelector('.oe-tb__dd-trigger[aria-label="Styles"]')).toBeTruthy();
  });

  it('block preset converts the block and applies classes; reapply toggles off', () => {
    make({ styles: STYLES });
    editor.setHTML('<p>text</p>');
    caretIn(editor.getEditorElement().querySelector('p').firstChild, 2);
    editor.commands.execute('applyStyle', 1); // Fancy Title (h2.fancy)
    expect(editor.getHTML()).toContain('<h2 class="fancy">');
    caretIn(editor.getEditorElement().querySelector('h2').firstChild, 2);
    editor.commands.execute('applyStyle', 1); // toggle classes off
    expect(editor.getHTML()).not.toContain('fancy');
  });

  it('switching block presets replaces the previous preset classes', () => {
    make({ styles: STYLES });
    editor.setHTML('<p>text</p>');
    caretIn(editor.getEditorElement().querySelector('p').firstChild, 1);
    editor.commands.execute('applyStyle', 0); // p.callout
    expect(editor.getHTML()).toContain('class="callout"');
    caretIn(editor.getEditorElement().querySelector('p').firstChild, 1);
    editor.commands.execute('applyStyle', 1); // h2.fancy — callout must go
    const html = editor.getHTML();
    expect(html).toContain('fancy');
    expect(html).not.toContain('callout');
  });

  it('inline preset wraps the selection in a classed span; round-trips; toggles off', () => {
    make({ styles: STYLES });
    editor.setHTML('<p>pick me please</p>');
    const node = editor.getEditorElement().querySelector('p').firstChild;
    const r = document.createRange();
    r.setStart(node, 5); r.setEnd(node, 7); // "me"
    const s = window.getSelection();
    s.removeAllRanges(); s.addRange(r);
    editor.commands.execute('applyStyle', 2); // span.hl
    expect(editor.getHTML()).toContain('<span class="hl">me</span>');
    editor.setHTML(editor.getHTML()); // sanitizer round-trip keeps it
    expect(editor.getHTML()).toContain('<span class="hl">me</span>');
    // toggle off from inside the span
    const span = editor.getEditorElement().querySelector('span.hl');
    caretIn(span.firstChild, 1);
    editor.commands.execute('applyStyle', 2);
    expect(editor.getHTML()).not.toContain('oe-span');
    expect(editor.getHTML()).not.toContain('class="hl"');
    expect(editor.getText()).toContain('pick me please');
  });
});
