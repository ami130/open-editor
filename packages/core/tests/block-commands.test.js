import { describe, it, expect } from 'vitest';
import { OpenEditor } from '../src/editor.js';

function makeTarget() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

function cleanup(editor, target) {
  if (editor && !editor.isDestroyed()) editor.destroy();
  if (target && target.parentNode) target.parentNode.removeChild(target);
}

function makeEditorWith(html) {
  const target = makeTarget();
  const editor = new OpenEditor(target);
  editor.getEditorElement().innerHTML = html;
  return { editor, target };
}

function setCursor(node, offset = 0) {
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(range);
}

// ─── isActive for block commands ─────────────────────────────────────────────

describe('paragraph command', () => {
  it('isActive returns true when cursor is in <p>', () => {
    const { editor, target } = makeEditorWith('<p>hello</p>');
    setCursor(editor.getEditorElement().querySelector('p').firstChild, 0);
    expect(editor.commands.isActive('paragraph')).toBe(true);
    cleanup(editor, target);
  });

  it('isActive returns false when cursor is in <h1>', () => {
    const { editor, target } = makeEditorWith('<h1>title</h1>');
    setCursor(editor.getEditorElement().querySelector('h1').firstChild, 0);
    expect(editor.commands.isActive('paragraph')).toBe(false);
    cleanup(editor, target);
  });
});

describe('heading commands isActive', () => {
  it('h1 isActive true inside <h1>', () => {
    const { editor, target } = makeEditorWith('<h1>title</h1>');
    setCursor(editor.getEditorElement().querySelector('h1').firstChild, 0);
    expect(editor.commands.isActive('h1')).toBe(true);
    cleanup(editor, target);
  });

  it('h2 isActive false inside <h1>', () => {
    const { editor, target } = makeEditorWith('<h1>title</h1>');
    setCursor(editor.getEditorElement().querySelector('h1').firstChild, 0);
    expect(editor.commands.isActive('h2')).toBe(false);
    cleanup(editor, target);
  });

  it('h1–h6 commands are all registered', () => {
    const { editor, target } = makeEditorWith('<p>x</p>');
    for (const name of ['h1','h2','h3','h4','h5','h6']) {
      expect(editor.commands.getAll().has(name), `missing: ${name}`).toBe(true);
    }
    cleanup(editor, target);
  });
});

describe('blockquote command', () => {
  it('isActive returns false outside blockquote', () => {
    const { editor, target } = makeEditorWith('<p>text</p>');
    setCursor(editor.getEditorElement().querySelector('p').firstChild, 0);
    expect(editor.commands.isActive('blockquote')).toBe(false);
    cleanup(editor, target);
  });

  it('isActive returns true inside <blockquote>', () => {
    const { editor, target } = makeEditorWith('<blockquote><p>quote</p></blockquote>');
    const p = editor.getEditorElement().querySelector('p');
    setCursor(p.firstChild, 0);
    expect(editor.commands.isActive('blockquote')).toBe(true);
    cleanup(editor, target);
  });

  it('execute does not throw', () => {
    const { editor, target } = makeEditorWith('<p>text</p>');
    setCursor(editor.getEditorElement().querySelector('p').firstChild, 0);
    expect(() => editor.commands.execute('blockquote')).not.toThrow();
    cleanup(editor, target);
  });

  it('re-applying blockquote when already inside one toggles it off (unwraps)', () => {
    const { editor, target } = makeEditorWith('<blockquote><p>quote</p></blockquote>');
    const p = editor.getEditorElement().querySelector('p');
    setCursor(p.firstChild, 0);
    editor.commands.execute('blockquote');
    // Should have unwrapped — no blockquote should remain
    const nested = editor.getEditorElement().querySelector('blockquote blockquote');
    expect(nested).toBeNull();
    cleanup(editor, target);
  });
});

describe('pre command', () => {
  it('isActive true inside <pre>', () => {
    const { editor, target } = makeEditorWith('<pre>code</pre>');
    setCursor(editor.getEditorElement().querySelector('pre').firstChild, 0);
    expect(editor.commands.isActive('pre')).toBe(true);
    cleanup(editor, target);
  });
});

// ─── alignment commands ───────────────────────────────────────────────────────

describe('alignment commands', () => {
  it('alignCenter sets text-align:center on the block', () => {
    const { editor, target } = makeEditorWith('<p>hello</p>');
    const p = editor.getEditorElement().querySelector('p');
    setCursor(p.firstChild, 0);
    editor.commands.execute('alignCenter');
    expect(p.style.textAlign).toBe('center');
    cleanup(editor, target);
  });

  it('alignLeft sets text-align:left on the block', () => {
    const { editor, target } = makeEditorWith('<p>hello</p>');
    const p = editor.getEditorElement().querySelector('p');
    setCursor(p.firstChild, 0);
    editor.commands.execute('alignLeft');
    expect(p.style.textAlign).toBe('left');
    cleanup(editor, target);
  });

  it('alignRight sets text-align:right on the block', () => {
    const { editor, target } = makeEditorWith('<p>hello</p>');
    const p = editor.getEditorElement().querySelector('p');
    setCursor(p.firstChild, 0);
    editor.commands.execute('alignRight');
    expect(p.style.textAlign).toBe('right');
    cleanup(editor, target);
  });

  it('alignJustify sets text-align:justify on the block', () => {
    const { editor, target } = makeEditorWith('<p>hello</p>');
    const p = editor.getEditorElement().querySelector('p');
    setCursor(p.firstChild, 0);
    editor.commands.execute('alignJustify');
    expect(p.style.textAlign).toBe('justify');
    cleanup(editor, target);
  });

  it('alignCenter isActive true after applying', () => {
    const { editor, target } = makeEditorWith('<p>hello</p>');
    const p = editor.getEditorElement().querySelector('p');
    setCursor(p.firstChild, 0);
    editor.commands.execute('alignCenter');
    expect(editor.commands.isActive('alignCenter')).toBe(true);
    cleanup(editor, target);
  });

  it('alignCenter isActive false when not applied', () => {
    const { editor, target } = makeEditorWith('<p>hello</p>');
    const p = editor.getEditorElement().querySelector('p');
    setCursor(p.firstChild, 0);
    expect(editor.commands.isActive('alignCenter')).toBe(false);
    cleanup(editor, target);
  });
});

// ─── writing-mode (4.24) ─────────────────────────────────────────────────────

describe('writingMode command', () => {
  it('sets writing-mode style on the block', () => {
    const { editor, target } = makeEditorWith('<p>text</p>');
    const p = editor.getEditorElement().querySelector('p');
    setCursor(p.firstChild, 0);
    editor.commands.execute('writingMode', 'vertical-rl');
    expect(p.style.writingMode).toBe('vertical-rl');
    cleanup(editor, target);
  });

  it('ignores unknown writing-mode values', () => {
    const { editor, target } = makeEditorWith('<p>text</p>');
    const p = editor.getEditorElement().querySelector('p');
    setCursor(p.firstChild, 0);
    editor.commands.execute('writingMode', 'sideways-left');
    expect(p.style.writingMode).toBe('');
    cleanup(editor, target);
  });

  it('isActive false for horizontal-tb', () => {
    const { editor, target } = makeEditorWith('<p>text</p>');
    const p = editor.getEditorElement().querySelector('p');
    setCursor(p.firstChild, 0);
    editor.commands.execute('writingMode', 'horizontal-tb');
    expect(editor.commands.isActive('writingMode')).toBe(false);
    cleanup(editor, target);
  });
});

// Regression: block commands must not corrupt lists or emit invalid HTML when
// the cursor is inside a list item (H-5, M-2). Verified identical in Chromium.
describe('block commands inside list items', () => {
  it('heading on a plain <li> leaves the list intact (no stray block)', () => {
    const { editor, target } = makeEditorWith('<ul><li>item</li></ul>');
    setCursor(editor.getEditorElement().querySelector('li').firstChild, 1);
    editor.commands.execute('h2');
    expect(editor.getEditorElement().innerHTML).toBe('<ul><li>item</li></ul>');
    cleanup(editor, target);
  });

  it('heading on a <li> inside a blockquote leaves both intact', () => {
    const { editor, target } = makeEditorWith('<blockquote><ul><li>item</li></ul></blockquote>');
    setCursor(editor.getEditorElement().querySelector('li').firstChild, 1);
    editor.commands.execute('h2');
    expect(editor.getEditorElement().innerHTML).toBe('<blockquote><ul><li>item</li></ul></blockquote>');
    cleanup(editor, target);
  });

  it('blockquote on a <li> wraps the item contents (valid HTML)', () => {
    const { editor, target } = makeEditorWith('<ul><li>item</li></ul>');
    setCursor(editor.getEditorElement().querySelector('li').firstChild, 1);
    editor.commands.execute('blockquote');
    expect(editor.getEditorElement().innerHTML).toBe('<ul><li><blockquote>item</blockquote></li></ul>');
    cleanup(editor, target);
  });

  it('paragraph unwraps a blockquote inside a <li> back to plain item', () => {
    const { editor, target } = makeEditorWith('<ul><li><blockquote>item</blockquote></li></ul>');
    const bq = editor.getEditorElement().querySelector('blockquote');
    setCursor(bq.firstChild, 1);
    editor.commands.execute('paragraph');
    expect(editor.getEditorElement().innerHTML).toBe('<ul><li>item</li></ul>');
    cleanup(editor, target);
  });
});
