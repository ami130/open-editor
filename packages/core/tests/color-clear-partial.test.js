/**
 * Regression tests for the H2 audit fix: removeTextColor / removeBackgroundColor
 * on a PARTIAL selection must clear the property only on the selected slice, not
 * on the whole styled span. Before the fix, the descendant/ancestor branches of
 * clearStyleProp used intersectsNode (true for any overlap), so clearing color
 * from "hello" in a "hello world" span wiped " world" too.
 */
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
// Select `count` chars of `textNode` starting at `start`.
function selectRange(textNode, start, count) {
  const r = document.createRange();
  r.setStart(textNode, start);
  r.setEnd(textNode, start + count);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(r);
}

describe('removeTextColor — partial selection (H2)', () => {
  it('clears color from only the selected leading slice', () => {
    const { editor, target } = makeEditor(
      '<p><span style="color: red">hello world</span></p>'
    );
    const span = editor.getEditorElement().querySelector('span');
    selectRange(span.firstChild, 0, 5); // "hello"
    editor.commands.execute('removeTextColor');
    const html = editor.getEditorElement().innerHTML;
    // " world" must KEEP its color; "hello" must lose it.
    expect(html).toMatch(/world/);
    expect(html).toMatch(/color:\s*red/);
    // The uncolored slice "hello" should NOT be inside a color span.
    const text = editor.getEditorElement().textContent;
    expect(text).toBe('hello world');
    // Only the " world" portion should still carry color.
    const colored = editor.getEditorElement().querySelector('[style*="color"]');
    expect(colored).not.toBeNull();
    expect(colored.textContent).toBe(' world');
    cleanup(editor, target);
  });

  it('clears color from only the selected trailing slice', () => {
    const { editor, target } = makeEditor(
      '<p><span style="color: red">hello world</span></p>'
    );
    const span = editor.getEditorElement().querySelector('span');
    selectRange(span.firstChild, 6, 5); // "world"
    editor.commands.execute('removeTextColor');
    const colored = editor.getEditorElement().querySelector('[style*="color"]');
    expect(colored).not.toBeNull();
    expect(colored.textContent).toBe('hello ');
    expect(editor.getEditorElement().textContent).toBe('hello world');
    cleanup(editor, target);
  });

  it('clears the whole span when fully selected', () => {
    const { editor, target } = makeEditor(
      '<p><span style="color: red">hello world</span></p>'
    );
    const span = editor.getEditorElement().querySelector('span');
    selectRange(span.firstChild, 0, 11); // all of "hello world"
    editor.commands.execute('removeTextColor');
    const colored = editor.getEditorElement().querySelector('[style*="color"]');
    expect(colored).toBeNull();
    expect(editor.getEditorElement().textContent).toBe('hello world');
    cleanup(editor, target);
  });

  it('clears a middle slice, keeping both ends colored', () => {
    const { editor, target } = makeEditor(
      '<p><span style="color: red">hello world</span></p>'
    );
    const span = editor.getEditorElement().querySelector('span');
    selectRange(span.firstChild, 5, 1); // the single space
    editor.commands.execute('removeTextColor');
    // Both "hello" and "world" keep color; text intact.
    expect(editor.getEditorElement().textContent).toBe('hello world');
    const spans = editor.getEditorElement().querySelectorAll('[style*="color"]');
    expect(spans.length).toBeGreaterThanOrEqual(2);
    cleanup(editor, target);
  });
});

describe('textColor — partial re-color inside a colored span (H1)', () => {
  it('splits into sibling spans instead of nesting', () => {
    const { editor, target } = makeEditor(
      '<p><span style="color: red">hello world</span></p>'
    );
    const span = editor.getEditorElement().querySelector('span');
    selectRange(span.firstChild, 0, 5); // "hello"
    editor.commands.execute('textColor', '#0000ff');
    const html = editor.getEditorElement().innerHTML;
    // No nested spans: a span must not contain another span.
    expect(html).not.toMatch(/<span[^>]*>\s*<span/);
    // Two sibling spans, "hello" blue and " world" red.
    const spans = editor.getEditorElement().querySelectorAll('span');
    expect(spans.length).toBe(2);
    expect(editor.getEditorElement().textContent).toBe('hello world');
    const blue = Array.from(spans).find((s) => /0, 0, 255|#0000ff/.test(s.getAttribute('style')));
    expect(blue).toBeTruthy();
    expect(blue.textContent).toBe('hello');
    cleanup(editor, target);
  });

  it('full re-color updates in place (no split, no nesting)', () => {
    const { editor, target } = makeEditor(
      '<p><span style="color: red">hello world</span></p>'
    );
    const span = editor.getEditorElement().querySelector('span');
    selectRange(span.firstChild, 0, 11);
    editor.commands.execute('textColor', '#0000ff');
    const spans = editor.getEditorElement().querySelectorAll('span');
    expect(spans.length).toBe(1);
    expect(editor.getEditorElement().textContent).toBe('hello world');
    cleanup(editor, target);
  });
});

describe('removeBackgroundColor — partial selection (H2)', () => {
  it('clears background from only the selected slice', () => {
    const { editor, target } = makeEditor(
      '<p><span style="background-color: yellow">hello world</span></p>'
    );
    const span = editor.getEditorElement().querySelector('span');
    selectRange(span.firstChild, 0, 5); // "hello"
    editor.commands.execute('removeBackgroundColor');
    const colored = editor.getEditorElement().querySelector('[style*="background"]');
    expect(colored).not.toBeNull();
    expect(colored.textContent).toBe(' world');
    expect(editor.getEditorElement().textContent).toBe('hello world');
    cleanup(editor, target);
  });
});
