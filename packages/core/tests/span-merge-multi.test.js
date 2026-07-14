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
function setRange(startNode, so, endNode, eo) {
  const r = document.createRange();
  r.setStart(startNode, so);
  r.setEnd(endNode, eo);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(r);
}

function selectAll(node) {
  const r = document.createRange(); r.selectNodeContents(node);
  window.getSelection().removeAllRanges(); window.getSelection().addRange(r);
}

// ─── Shape 3B: range covers span from parent block level (bookmark-restore) ───

describe('Shape 3B — range at block level covers single formatting span', () => {
  it('bgColor on color span with strong/em inside — no nesting, one span', () => {
    const { editor, target } = makeEditor(
      '<p><span style="color:red;">he<strong>llo w</strong><em>orl</em>d</span></p>'
    );
    const ed = editor.getEditorElement();
    // selectAll(p) simulates bookmark restore: startContainer=P offset=0, endContainer=P offset=1
    selectAll(ed.querySelector('p'));
    editor.commands.execute('backgroundColor', '#ffff00');
    const spans = ed.querySelectorAll('span');
    expect(spans.length).toBe(1);
    expect(spans[0].style.color).toMatch(/red/);
    expect(spans[0].style.backgroundColor).toMatch(/255, 255, 0|#ffff00/);
    cleanup(editor, target);
  });

  it('textColor on bgColor span with em inside — no nesting', () => {
    const { editor, target } = makeEditor(
      '<p><span style="background-color:yellow;">foo<em>bar</em>baz</span></p>'
    );
    const ed = editor.getEditorElement();
    selectAll(ed.querySelector('p'));
    editor.commands.execute('textColor', '#0000ff');
    const spans = ed.querySelectorAll('span');
    expect(spans.length).toBe(1);
    expect(spans[0].style.backgroundColor).toMatch(/yellow|255, 255, 0/);
    expect(spans[0].style.color).toMatch(/0, 0, 255|#0000ff/);
    cleanup(editor, target);
  });

  it('applying fontSize on color span from block-level range — no nesting', () => {
    const { editor, target } = makeEditor(
      '<p><span style="color:green;">plain text</span></p>'
    );
    const ed = editor.getEditorElement();
    selectAll(ed.querySelector('p'));
    editor.commands.execute('fontSize', '20px');
    const spans = ed.querySelectorAll('span');
    expect(spans.length).toBe(1);
    expect(spans[0].style.color).toMatch(/green/);
    expect(spans[0].style.fontSize).toBe('20px');
    cleanup(editor, target);
  });
});

// ─── Shape 4: multi-span partial selection ────────────────────────────────────

describe('Shape 4 — applying a property across multiple existing spans', () => {
  it('bgColor on selection spanning two color spans merges onto each, no outer wrap', () => {
    const { editor, target } = makeEditor(
      '<p><span style="color:red;">hello </span><span style="color:blue;">world</span></p>'
    );
    const ed = editor.getEditorElement();
    const spans = ed.querySelectorAll('span');
    // Select from inside first span to end of second span
    setRange(spans[0].firstChild, 0, spans[1].firstChild, 5);
    editor.commands.execute('backgroundColor', '#ffff00');
    const result = ed.querySelectorAll('span');
    // Should still be exactly 2 spans — no new outer wrapper
    expect(result.length).toBe(2);
    expect(result[0].style.color).toMatch(/red|255, 0, 0/);
    expect(result[0].style.backgroundColor).toMatch(/255, 255, 0|#ffff00/);
    expect(result[1].style.color).toMatch(/blue|0, 0, 255/);
    expect(result[1].style.backgroundColor).toMatch(/255, 255, 0|#ffff00/);
    cleanup(editor, target);
  });

  it('textColor on selection spanning two bgColor spans merges onto each', () => {
    const { editor, target } = makeEditor(
      '<p><span style="background-color:yellow;">foo</span><span style="background-color:cyan;">bar</span></p>'
    );
    const ed = editor.getEditorElement();
    const spans = ed.querySelectorAll('span');
    setRange(spans[0].firstChild, 0, spans[1].firstChild, 3);
    editor.commands.execute('textColor', '#ff0000');
    const result = ed.querySelectorAll('span');
    expect(result.length).toBe(2);
    expect(result[0].style.color).toMatch(/255, 0, 0|#ff0000/);
    expect(result[1].style.color).toMatch(/255, 0, 0|#ff0000/);
    cleanup(editor, target);
  });

  it('applying fontSize across two color spans merges fontSize onto each', () => {
    const { editor, target } = makeEditor(
      '<p><span style="color:red;">aaa</span><span style="color:green;">bbb</span></p>'
    );
    const ed = editor.getEditorElement();
    const spans = ed.querySelectorAll('span');
    setRange(spans[0].firstChild, 0, spans[1].firstChild, 3);
    editor.commands.execute('fontSize', '24px');
    const result = ed.querySelectorAll('span');
    expect(result.length).toBe(2);
    expect(result[0].style.fontSize).toBe('24px');
    expect(result[1].style.fontSize).toBe('24px');
    cleanup(editor, target);
  });
});
