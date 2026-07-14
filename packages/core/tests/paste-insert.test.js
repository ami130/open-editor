/**
 * paste-insert.test.js — Phase 12.15: context-aware paste insertion.
 * Verifies block-level content splits the host block instead of nesting, and
 * that table cells / list items are NOT split open.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { OpenEditor } from '../src/editor.js';
import { hasTopLevelBlock, insertPasteContent } from '../src/paste/paste-insert.js';

describe('hasTopLevelBlock', () => {
  it('detects a top-level block element', () => {
    expect(hasTopLevelBlock('<p>a</p>', document)).toBe(true);
    expect(hasTopLevelBlock('<ul><li>x</li></ul>', document)).toBe(true);
    expect(hasTopLevelBlock('<h2>t</h2>', document)).toBe(true);
  });
  it('returns false for inline-only content', () => {
    expect(hasTopLevelBlock('<strong>a</strong> b', document)).toBe(false);
    expect(hasTopLevelBlock('plain text', document)).toBe(false);
    expect(hasTopLevelBlock('', document)).toBe(false);
  });
});

// ── Insertion through a real editor ──────────────────────────────────────────
let editor, target;
beforeEach(() => {
  target = document.createElement('div');
  document.body.appendChild(target);
  editor = new OpenEditor(target, { askBeforePasteHTML: false, askBeforePasteFromWord: false });
});
afterEach(() => { if (editor && !editor.isDestroyed()) editor.destroy(); if (target && target.parentNode) target.remove(); });

function caretInside(node, offset) {
  const r = document.createRange();
  r.setStart(node, offset); r.collapse(true);
  const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
}
function pasteEvent(html, plain) {
  const e = new window.Event('paste', { bubbles: true, cancelable: true });
  e.clipboardData = { getData: (t) => (t === 'text/html' ? (html || '') : (plain || '')) };
  return e;
}

describe('block-level paste splits the host paragraph (no <p>-in-<p>)', () => {
  it('pasting two paragraphs mid-<p> splits it into before/pasted/after', () => {
    const el = editor.getEditorElement();
    el.innerHTML = '<p>ABCDEF</p>';
    const text = el.querySelector('p').firstChild;
    caretInside(text, 3); // between ABC and DEF
    el.dispatchEvent(pasteEvent('<p>one</p><p>two</p>', 'one\n\ntwo'));
    const html = el.innerHTML;
    // No nested <p>, all four pieces present as siblings.
    expect(html).not.toMatch(/<p>[^<]*<p>/);
    expect(html).toMatch(/ABC/);
    expect(html).toMatch(/one/);
    expect(html).toMatch(/two/);
    expect(html).toMatch(/DEF/);
    // At least 3 top-level paragraphs (before, pasted x2 or merged, after).
    expect((html.match(/<p>/g) || []).length).toBeGreaterThanOrEqual(3);
  });

  it('pasting at the very start of a <p> does not leave an empty before-block', () => {
    const el = editor.getEditorElement();
    el.innerHTML = '<p>tail</p>';
    caretInside(el.querySelector('p').firstChild, 0);
    el.dispatchEvent(pasteEvent('<p>head</p>', 'head'));
    const html = el.innerHTML;
    expect(html).toMatch(/head/);
    expect(html).toMatch(/tail/);
    expect(html).not.toMatch(/<p><\/p>/); // no empty leading paragraph
  });

  it('inline-only paste still works (no split needed)', () => {
    const el = editor.getEditorElement();
    el.innerHTML = '<p>abXcd</p>';
    caretInside(el.querySelector('p').firstChild, 2);
    el.dispatchEvent(pasteEvent('<strong>Y</strong>', 'Y'));
    expect(el.innerHTML).toMatch(/<strong>Y<\/strong>/);
    expect(el.querySelectorAll('p').length).toBe(1); // still one paragraph
  });
});

describe('paste pipeline events (12.14)', () => {
  it('fires beforePaste (cancelable) then afterPaste on a normal paste', () => {
    const el = editor.getEditorElement();
    el.innerHTML = '<p>x</p>';
    caretInside(el.querySelector('p').firstChild, 1);
    const seen = [];
    editor.on('beforePaste', () => seen.push('before'));
    editor.on('afterPaste', () => seen.push('after'));
    el.dispatchEvent(pasteEvent('<strong>b</strong>', 'b'));
    expect(seen).toContain('before');
    expect(seen).toContain('after');
    expect(seen.indexOf('before')).toBeLessThan(seen.indexOf('after'));
  });

  it('a beforePaste listener that preventDefaults cancels insertion', () => {
    const el = editor.getEditorElement();
    el.innerHTML = '<p>keep</p>';
    caretInside(el.querySelector('p').firstChild, 4);
    editor.on('beforePaste', (e) => e.preventDefault());
    el.dispatchEvent(pasteEvent('<strong>nope</strong>', 'nope'));
    expect(el.innerHTML).toBe('<p>keep</p>'); // nothing inserted
  });
});

describe('table cells and list items are not split open (12.15)', () => {
  it('block paste inside a <td> stays inside the cell', () => {
    const el = editor.getEditorElement();
    el.innerHTML = '<table class="oe-table"><tbody><tr><td>cell</td></tr></tbody></table>';
    const td = el.querySelector('td');
    caretInside(td.firstChild, 4); // end of "cell"
    el.dispatchEvent(pasteEvent('<p>more</p>', 'more'));
    // Still exactly one row/one cell — the table was not broken apart.
    expect(el.querySelectorAll('tr').length).toBe(1);
    expect(el.querySelectorAll('td').length).toBe(1);
    expect(el.querySelector('td').textContent).toMatch(/more/);
  });

  it('block paste inside a <li> stays inside the list item', () => {
    const el = editor.getEditorElement();
    el.innerHTML = '<ul><li>item</li></ul>';
    const liText = el.querySelector('li').firstChild;
    caretInside(liText, 4);
    el.dispatchEvent(pasteEvent('<p>x</p>', 'x'));
    // The <ul> keeps a single top-level <li>; content merged in, list intact.
    expect(el.querySelectorAll('ul > li').length).toBe(1);
    expect(el.querySelector('li').textContent).toMatch(/x/);
  });
});

// ── HIGH-1: block paste must REPLACE a non-collapsed selection ────────────────
describe('block paste over a selection (HIGH-1 regression)', () => {
  function selectRange(sN, sO, eN, eO) {
    const r = document.createRange();
    r.setStart(sN, sO); r.setEnd(eN, eO);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  }

  it('replaces the selected text within a single block (no duplication)', () => {
    const el = editor.getEditorElement();
    el.innerHTML = '<p>hello world</p>';
    const t = el.querySelector('p').firstChild;
    selectRange(t, 2, t, 7); // "llo w"
    insertPasteContent(editor, '<h2>HEAD</h2>');
    expect(editor.getHTML()).toBe('<p>he</p><h2>HEAD</h2><p>orld</p>');
  });

  it('replaces a multi-block selection, keeping only the untouched tail', () => {
    const el = editor.getEditorElement();
    el.innerHTML = '<p>AAA</p><p>BBB</p>';
    const ps = el.querySelectorAll('p');
    selectRange(ps[0].firstChild, 1, ps[1].firstChild, 2); // "AA…BB"
    insertPasteContent(editor, '<h2>H</h2>');
    expect(editor.getHTML()).toBe('<p>A</p><h2>H</h2><p>B</p>');
  });

  it('select-all + block paste fully replaces the content', () => {
    const el = editor.getEditorElement();
    el.innerHTML = '<p>replace me</p>';
    const t = el.querySelector('p').firstChild;
    selectRange(t, 0, t, 10);
    insertPasteContent(editor, '<h2>NEW</h2>');
    expect(editor.getHTML()).toBe('<h2>NEW</h2>');
  });

  it('collapsed caret still splits without deleting (control)', () => {
    const el = editor.getEditorElement();
    el.innerHTML = '<p>hello</p>';
    const t = el.querySelector('p').firstChild;
    caretInside(t, 2);
    insertPasteContent(editor, '<h2>HEAD</h2>');
    expect(editor.getHTML()).toBe('<p>he</p><h2>HEAD</h2><p>llo</p>');
  });
});

// ── MEDIUM-1: block paste into a cell/list item flattens to inline ────────────
describe('block paste into <td>/<li> flattens (MEDIUM-1 regression)', () => {
  it('does not inject <p> inside a table cell', () => {
    const el = editor.getEditorElement();
    el.innerHTML = '<table><tbody><tr><td>cell</td></tr></tbody></table>';
    const td = el.querySelector('td');
    caretInside(td.firstChild, 2);
    insertPasteContent(editor, '<p>X</p><p>Y</p>');
    // No <p> inside the cell; blocks flattened, joined by <br>.
    expect(el.querySelector('td p')).toBeNull();
    expect(el.querySelector('td br')).not.toBeNull();
    expect(el.querySelector('td').textContent).toBe('ceXYll');
  });

  it('does not inject <p> inside a list item', () => {
    const el = editor.getEditorElement();
    el.innerHTML = '<ul><li>item</li></ul>';
    const li = el.querySelector('li');
    caretInside(li.firstChild, 4);
    insertPasteContent(editor, '<p>A</p><p>B</p>');
    expect(el.querySelector('li p')).toBeNull();
    expect(el.querySelectorAll('ul > li').length).toBe(1);
    expect(el.querySelector('li').textContent).toBe('itemAB');
  });

  it('pasting a <table> into a cell does not run adjacent source cells together', () => {
    const el = editor.getEditorElement();
    el.innerHTML = '<table><tbody><tr><td>x</td></tr></tbody></table>';
    const td = el.querySelector('td');
    caretInside(td.firstChild, 1); // end of "x"
    // A pasted table has its OWN td/td cells nested inside — these must not be
    // silently concatenated with no separator (was "AB", must stay "A B").
    insertPasteContent(editor, '<table><tbody><tr><td>A</td><td>B</td></tr></tbody></table>');
    expect(el.querySelectorAll('table').length).toBe(1); // no nested <table>
    expect(el.querySelector('td').textContent).toContain('A B');
  });

  it('pasting a table WITH A NESTED TABLE does not duplicate or run text together', () => {
    const el = editor.getEditorElement();
    el.innerHTML = '<table><tbody><tr><td>x</td></tr></tbody></table>';
    const td = el.querySelector('td');
    caretInside(td.firstChild, 1);
    insertPasteContent(
      editor,
      '<table><tbody><tr><td>outer1<table><tbody><tr><td>inner</td></tr></tbody></table></td><td>outer2</td></tr></tbody></table>'
    );
    const text = el.querySelector('td').textContent;
    // "inner" must appear exactly once (was duplicated by querySelectorAll
    // matching the nested table's own row/cells too), and outer1/inner/outer2
    // must be space-separated, not run together.
    expect((text.match(/inner/g) || []).length).toBe(1);
    expect(text).toContain('outer1 inner outer2');
  });
});
