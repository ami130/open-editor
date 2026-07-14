import { describe, it, expect } from 'vitest';
import { OpenEditor } from '../src/editor.js';

function makeEditor(html) {
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

// ─── Span merge: color + bgColor on same text ──────────────────────────────

describe('span merge — color and bgColor land on one span', () => {
  it('applying bgColor after textColor merges onto the existing span', () => {
    const { editor, target } = makeEditor('<p>hello</p>');
    const ed = editor.getEditorElement();
    const p = ed.querySelector('p');
    selectAll(p.firstChild);
    editor.commands.execute('textColor', '#ff0000');
    // Now one span with color exists; select all its text and apply bgColor
    const span = ed.querySelector('span');
    selectAll(span.firstChild);
    editor.commands.execute('backgroundColor', '#ffff00');
    const spans = ed.querySelectorAll('span');
    expect(spans.length).toBe(1);
    expect(spans[0].style.color).toMatch(/255, 0, 0|#ff0000/);
    expect(spans[0].style.backgroundColor).toMatch(/255, 255, 0|#ffff00/);
    cleanup(editor, target);
  });

  it('applying textColor after bgColor merges onto the existing span', () => {
    const { editor, target } = makeEditor('<p>world</p>');
    const ed = editor.getEditorElement();
    const p = ed.querySelector('p');
    selectAll(p.firstChild);
    editor.commands.execute('backgroundColor', '#00ff00');
    const span = ed.querySelector('span');
    selectAll(span.firstChild);
    editor.commands.execute('textColor', '#0000ff');
    const spans = ed.querySelectorAll('span');
    expect(spans.length).toBe(1);
    expect(spans[0].style.backgroundColor).toMatch(/0, 255, 0|#00ff00/);
    expect(spans[0].style.color).toMatch(/0, 0, 255|#0000ff/);
    cleanup(editor, target);
  });

  it('applying fontSize onto a color span merges — no new wrapper', () => {
    const { editor, target } = makeEditor('<p>test</p>');
    const ed = editor.getEditorElement();
    const p = ed.querySelector('p');
    selectAll(p.firstChild);
    editor.commands.execute('textColor', '#ff0000');
    const span = ed.querySelector('span');
    selectAll(span.firstChild);
    editor.commands.execute('fontSize', '20px');
    const spans = ed.querySelectorAll('span');
    expect(spans.length).toBe(1);
    expect(spans[0].style.color).toMatch(/255, 0, 0|#ff0000/);
    expect(spans[0].style.fontSize).toBe('20px');
    cleanup(editor, target);
  });
});

// ─── Orphan span cleanup after clear ──────────────────────────────────────

describe('orphan span cleanup after removeTextColor', () => {
  it('removes the empty span when color was the only property', () => {
    const { editor, target } = makeEditor('<p>hello</p>');
    const ed = editor.getEditorElement();
    const p = ed.querySelector('p');
    selectAll(p.firstChild);
    editor.commands.execute('textColor', '#ff0000');
    expect(ed.querySelector('span')).not.toBeNull();
    // Put cursor inside the span and clear
    const span = ed.querySelector('span');
    setCursor(span.firstChild, 0);
    editor.commands.execute('removeTextColor');
    expect(ed.querySelector('span')).toBeNull();
    expect(p.textContent).toBe('hello');
    cleanup(editor, target);
  });

  it('keeps the span when another property still exists after clear', () => {
    const { editor, target } = makeEditor('<p>hello</p>');
    const ed = editor.getEditorElement();
    const p = ed.querySelector('p');
    selectAll(p.firstChild);
    editor.commands.execute('textColor', '#ff0000');
    const span = ed.querySelector('span');
    selectAll(span.firstChild);
    editor.commands.execute('backgroundColor', '#ffff00');
    // One span with both properties — clear only color
    setCursor(ed.querySelector('span').firstChild, 0);
    editor.commands.execute('removeTextColor');
    const spans = ed.querySelectorAll('span');
    expect(spans.length).toBe(1);
    expect(spans[0].style.color).toBe('');
    expect(spans[0].style.backgroundColor).toMatch(/255, 255, 0|#ffff00/);
    cleanup(editor, target);
  });
});

// ─── Partial selection inside an existing colored span ────────────────────────

describe('partial selection inside existing colored span', () => {
  it('applies new color only to selected word, not the whole span', () => {
    // Reproduces: select "brother" inside <span style="color:red;">hello brother and sister</span>
    // then apply yellow — should wrap only "brother", not repaint the whole span.
    const { editor, target } = makeEditor(
      '<p><span style="color:red;">hello brother and sister</span></p>'
    );
    const ed = editor.getEditorElement();
    const span = ed.querySelector('span');
    const text = span.firstChild; // "hello brother and sister"
    // Select only "brother" (offset 6..13)
    const r = document.createRange();
    r.setStart(text, 6);
    r.setEnd(text, 13);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(r);
    editor.commands.execute('textColor', '#ffff00');
    // The original span must NOT be yellow — only the inner "brother" span is
    const spans = ed.querySelectorAll('span');
    const brotherSpan = Array.from(spans).find((s) => s.textContent === 'brother');
    expect(brotherSpan).not.toBeNull();
    expect(brotherSpan.style.color).toMatch(/255, 255, 0|ffff00/);
    // The outer span must still be red (not overwritten to yellow)
    expect(span.style.color).toMatch(/red|255, 0, 0/);
    cleanup(editor, target);
  });

  it('full-span selection still updates the span in place', () => {
    const { editor, target } = makeEditor(
      '<p><span style="color:red;">hello</span></p>'
    );
    const ed = editor.getEditorElement();
    const span = ed.querySelector('span');
    selectAll(span.firstChild);
    editor.commands.execute('textColor', '#0000ff');
    const spans = ed.querySelectorAll('span');
    expect(spans.length).toBe(1);
    expect(spans[0].style.color).toMatch(/0, 0, 255|#0000ff/);
    cleanup(editor, target);
  });
});
