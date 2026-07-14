import { describe, it, expect } from 'vitest';
import { OpenEditor } from '../src/editor.js';
import { DEFAULT_FONT_SIZES } from '../src/ui/toolbar/toolbar-config.js';

function makeEditor(html = '<p>hello world</p>') {
  const target = document.createElement('div');
  document.body.appendChild(target);
  const editor = new OpenEditor(target);
  editor.getEditorElement().innerHTML = html;
  return { editor, target };
}
function cleanup(editor, target) {
  if (editor && !editor.isDestroyed()) editor.destroy();
  if (target && target.parentNode) target.parentNode.removeChild(target);
}
function selectAll(node) {
  const r = document.createRange();
  r.selectNodeContents(node);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(r);
}
function setCursor(node, offset) {
  const r = document.createRange();
  r.setStart(node, offset);
  r.collapse(true);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(r);
}

describe('color command (# hex fix)', () => {
  it('textColor applies a hex color to selected text', () => {
    const { editor, target } = makeEditor();
    const p = editor.getEditorElement().querySelector('p');
    selectAll(p.firstChild);
    editor.commands.execute('textColor', '#ff0000');
    expect(editor.getEditorElement().querySelector('span')).not.toBeNull();
    expect(editor.getEditorElement().innerHTML).toMatch(/color: rgb\(255, 0, 0\)|color: #ff0000/);
    cleanup(editor, target);
  });
  it('backgroundColor applies a hex color to selected text', () => {
    const { editor, target } = makeEditor();
    const p = editor.getEditorElement().querySelector('p');
    selectAll(p.firstChild);
    editor.commands.execute('backgroundColor', '#00ff00');
    expect(editor.getEditorElement().querySelector('span')).not.toBeNull();
    cleanup(editor, target);
  });
  it('textColor on collapsed cursor expands to word', () => {
    const { editor, target } = makeEditor();
    const p = editor.getEditorElement().querySelector('p');
    setCursor(p.firstChild, 2);
    editor.commands.execute('textColor', '#0000ff');
    expect(editor.getEditorElement().querySelector('span')).not.toBeNull();
    cleanup(editor, target);
  });

  // Regression (real-browser bug): re-coloring already-colored text via the
  // toolbar selects the WHOLE block, so the restored range's startNode is the
  // <p>, not the inner text node. The in-place check must still find the
  // existing color span and update it — not nest a second span around it.
  it('re-coloring a selection updates the span in place (no nesting)', () => {
    const { editor, target } = makeEditor('<p>recolor me</p>');
    const ed = editor.getEditorElement();
    const p = ed.querySelector('p');
    selectAll(p);                       // whole block, mirrors bookmark restore
    editor.commands.execute('textColor', '#ff0000');
    selectAll(p.querySelector('span') || p);
    selectAll(p);
    editor.commands.execute('textColor', '#0000ff');
    const spans = ed.querySelectorAll('span[style*="color"]');
    expect(spans.length).toBe(1);                       // exactly one, not nested
    expect(spans[0].style.color).toBe('rgb(0, 0, 255)'); // updated to blue
    cleanup(editor, target);
  });

  it('re-coloring background updates the span in place (no nesting)', () => {
    const { editor, target } = makeEditor('<p>highlight</p>');
    const ed = editor.getEditorElement();
    const p = ed.querySelector('p');
    selectAll(p);
    editor.commands.execute('backgroundColor', '#ffff00');
    selectAll(p);
    editor.commands.execute('backgroundColor', '#00ffff');
    const spans = ed.querySelectorAll('span[style*="background"]');
    expect(spans.length).toBe(1);
    expect(spans[0].style.backgroundColor).toBe('rgb(0, 255, 255)');
    cleanup(editor, target);
  });
});

describe('font size range (8px–96px)', () => {
  it('config includes 8px and 96px', () => {
    expect(DEFAULT_FONT_SIZES[0]).toBe('8px');
    expect(DEFAULT_FONT_SIZES[DEFAULT_FONT_SIZES.length - 1]).toBe('96px');
  });
});

describe('custom fontSize / lineHeight input', () => {
  function openDropdown(editor, kind) {
    const toolbarEl = editor.toolbar.getElement();
    // Select by aria-label (locale key), NOT position — adding a dropdown to
    // the toolbar must not break these tests (bit us when 17.5.1 added Case).
    const label = { heading: 'Format', fontFamily: 'Font', fontSize: 'Size', lineHeight: 'Line height' }[kind];
    const trigger = toolbarEl.querySelector(`.oe-tb__dd-trigger[aria-label="${label}"]`);
    trigger.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
    trigger.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    return document.body.querySelector('.oe-tb__dd-panel:not([hidden])');
  }

  it('fontSize custom input applies a bare number as px', () => {
    const { editor, target } = makeEditor();
    const p = editor.getEditorElement().querySelector('p');
    selectAll(p.firstChild);
    const panel = openDropdown(editor, 'fontSize');
    const input = panel.querySelector('.oe-tb__dd-custom-input');
    const applyBtn = panel.querySelector('.oe-tb__dd-custom-apply');
    expect(input).not.toBeNull();
    selectAll(p.firstChild);
    input.value = '37';
    applyBtn.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
    applyBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(editor.getEditorElement().innerHTML).toMatch(/font-size: 37px/);
    cleanup(editor, target);
  });

  it('fontSize custom input accepts full length (1.5em)', () => {
    const { editor, target } = makeEditor();
    const p = editor.getEditorElement().querySelector('p');
    selectAll(p.firstChild);
    const panel = openDropdown(editor, 'fontSize');
    const input = panel.querySelector('.oe-tb__dd-custom-input');
    const applyBtn = panel.querySelector('.oe-tb__dd-custom-apply');
    selectAll(p.firstChild);
    input.value = '1.5em';
    applyBtn.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
    applyBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(editor.getEditorElement().innerHTML).toMatch(/font-size: 1\.5em/);
    cleanup(editor, target);
  });

  it('lineHeight custom input applies a unitless multiplier', () => {
    const { editor, target } = makeEditor();
    const p = editor.getEditorElement().querySelector('p');
    setCursor(p.firstChild, 0);
    const panel = openDropdown(editor, 'lineHeight');
    const input = panel.querySelector('.oe-tb__dd-custom-input');
    const applyBtn = panel.querySelector('.oe-tb__dd-custom-apply');
    expect(input).not.toBeNull();
    setCursor(p.firstChild, 0);
    input.value = '1.6';
    applyBtn.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
    applyBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(p.style.lineHeight).toBe('1.6');
    cleanup(editor, target);
  });

  it('invalid custom value is rejected (no change)', () => {
    const { editor, target } = makeEditor();
    const p = editor.getEditorElement().querySelector('p');
    selectAll(p.firstChild);
    const panel = openDropdown(editor, 'fontSize');
    const input = panel.querySelector('.oe-tb__dd-custom-input');
    const applyBtn = panel.querySelector('.oe-tb__dd-custom-apply');
    selectAll(p.firstChild);
    input.value = 'abc; color:red';
    applyBtn.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
    applyBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(editor.getEditorElement().innerHTML).not.toMatch(/font-size/);
    cleanup(editor, target);
  });

  it('heading dropdown has NO custom input', () => {
    const { editor, target } = makeEditor();
    const panel = openDropdown(editor, 'heading');
    expect(panel.querySelector('.oe-tb__dd-custom-input')).toBeNull();
    cleanup(editor, target);
  });
});
