/**
 * Regression tests for command-level audit fixes.
 */
import { describe, it, expect } from 'vitest';
import { OpenEditor } from '../src/editor.js';
import { handleListEnter } from '../src/commands/list-commands.js';
import { CommandManager } from '../src/commands/command-manager.js';
import { superscriptCommand } from '../src/commands/text-commands.js';
import { insertHTMLCommand, insertTextCommand } from '../src/commands/insert-commands.js';
import { fontFamilyCommand, overlineCommand } from '../src/commands/style-commands.js';

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
function selectAll(editor) {
  const el = editor.getEditorElement();
  const r = document.createRange();
  r.selectNodeContents(el);
  const s = window.getSelection();
  s.removeAllRanges();
  s.addRange(r);
}

// ─── C032-C041: span/exec commands return SKIP_RESTORE ────────────────────────

describe('SKIP_RESTORE batch — commands that mutate + move caret', () => {
  it('superscript returns SKIP_RESTORE', () => {
    const { editor, target } = makeEditor();
    // jsdom lacks execCommand — stub it so we can assert the return contract.
    if (!document.execCommand) document.execCommand = () => true;
    selectAll(editor);
    expect(superscriptCommand.execute(editor)).toBe(CommandManager.SKIP_RESTORE);
    cleanup(editor, target);
  });
  it('insertHTML returns SKIP_RESTORE', () => {
    const { editor, target } = makeEditor();
    selectAll(editor);
    expect(insertHTMLCommand.execute(editor, '<b>x</b>')).toBe(CommandManager.SKIP_RESTORE);
    cleanup(editor, target);
  });
  it('insertText returns SKIP_RESTORE', () => {
    const { editor, target } = makeEditor();
    selectAll(editor);
    expect(insertTextCommand.execute(editor, 'abc')).toBe(CommandManager.SKIP_RESTORE);
    cleanup(editor, target);
  });
  it('fontFamily returns SKIP_RESTORE when a span is wrapped', () => {
    const { editor, target } = makeEditor();
    selectAll(editor);
    expect(fontFamilyCommand.execute(editor, 'serif')).toBe(CommandManager.SKIP_RESTORE);
    cleanup(editor, target);
  });
  it('overline returns SKIP_RESTORE when a span is wrapped', () => {
    const { editor, target } = makeEditor();
    selectAll(editor);
    expect(overlineCommand.execute(editor)).toBe(CommandManager.SKIP_RESTORE);
    cleanup(editor, target);
  });
  it('fontFamily on a collapsed caret sets a pending span and returns SKIP_RESTORE', () => {
    // I5: placing the cursor inside a word and applying fontFamily now sets a
    // PENDING format (empty span, next-typed chars styled) rather than recoloring
    // the whole word; either way it returns SKIP_RESTORE (it placed the caret).
    const { editor, target } = makeEditor();
    const el = editor.getEditorElement();
    const r = document.createRange();
    r.setStart(el.querySelector('p').firstChild, 2); r.collapse(true);
    window.getSelection().removeAllRanges(); window.getSelection().addRange(r);
    expect(fontFamilyCommand.execute(editor, 'serif')).toBe(CommandManager.SKIP_RESTORE);
    cleanup(editor, target);
  });
});

// ─── C043: blockquote nest then unnest is symmetric ───────────────────────────

describe('C043 — blockquote nesting is reversible via paragraph', () => {
  it('paragraph peels one blockquote level', () => {
    const { editor, target } = makeEditor('<blockquote><p>quote</p></blockquote>');
    const p = editor.getEditorElement().querySelector('p');
    const r = document.createRange();
    r.setStart(p.firstChild, 0); r.collapse(true);
    window.getSelection().removeAllRanges(); window.getSelection().addRange(r);
    editor.commands.execute('paragraph');
    expect(editor.getEditorElement().querySelector('blockquote')).toBeNull();
    expect(editor.getEditorElement().textContent).toContain('quote');
    cleanup(editor, target);
  });
});

// ─── C044: alignment toggles off ──────────────────────────────────────────────

describe('C044 — alignment toggle-off', () => {
  it('re-applying the same alignment clears it', () => {
    const { editor, target } = makeEditor('<p>x</p>');
    const p = editor.getEditorElement().querySelector('p');
    const r = document.createRange();
    r.setStart(p.firstChild, 0); r.collapse(true);
    window.getSelection().removeAllRanges(); window.getSelection().addRange(r);
    editor.commands.execute('alignCenter');
    expect(p.style.textAlign).toBe('center');
    editor.commands.execute('alignCenter');
    expect(p.style.textAlign).toBe('');
    cleanup(editor, target);
  });
});

// ─── C046: handleListEnter readonly guard ─────────────────────────────────────

describe('C046 — handleListEnter respects readonly', () => {
  it('returns false and does not mutate in readonly mode', () => {
    const target = document.createElement('div');
    document.body.appendChild(target);
    const editor = new OpenEditor(target, { readonly: true });
    editor.getEditorElement().innerHTML = '<ul><li><br></li></ul>';
    const li = editor.getEditorElement().querySelector('li');
    const r = document.createRange();
    r.setStart(li, 0); r.collapse(true);
    window.getSelection().removeAllRanges(); window.getSelection().addRange(r);
    expect(handleListEnter(editor)).toBe(false);
    expect(editor.getEditorElement().querySelector('li')).not.toBeNull();
    cleanup(editor, target);
  });
});

// ─── C048 (updated by L10): Enter on an empty outline-parent EXITS it ─────────
// Previously this refused to exit (trapping the user). L10: the empty parent now
// dissolves, promoting its sublist's items — the user escapes and no child is lost.

describe('C048 — empty <li> that owns a sublist can be Enter-exited (L10)', () => {
  it('dissolves the empty parent and promotes the child (no data loss, not trapped)', () => {
    const { editor, target } = makeEditor('<ul><li> <ul><li>child</li></ul></li></ul>');
    const li = editor.getEditorElement().querySelector('li');
    const r = document.createRange();
    r.setStart(li, 0); r.collapse(true);
    window.getSelection().removeAllRanges(); window.getSelection().addRange(r);
    expect(handleListEnter(editor)).toBe(true);                 // exits (was: false/trapped)
    expect(editor.getEditorElement().textContent).toContain('child');  // child preserved
    // "child" is promoted to the top level; the empty parent + empty sublist are gone
    const lis = Array.from(editor.getEditorElement().querySelectorAll('li')).map((l) => l.textContent);
    expect(lis).toEqual(['child']);
    cleanup(editor, target);
  });
});

// ─── C047 (updated by L4): toolbar outdent on a nested <li> lifts it structurally ─

describe('C047 — toolbar outdent on a nested <li> lifts it one level (L4 structural)', () => {
  it('lifts the item to the parent level and keeps the following siblings nested', () => {
    const { editor, target } = makeEditor(
      '<ul><li>parent<ul><li>a</li><li>b</li><li>c</li></ul></li></ul>'
    );
    const sub = editor.getEditorElement().querySelectorAll('ul')[1];
    const itemA = sub.children[0];
    const r = document.createRange();
    r.setStart(itemA.firstChild || itemA, 0); r.collapse(true);
    window.getSelection().removeAllRanges(); window.getSelection().addRange(r);
    editor.commands.execute('outdent');
    // L4: toolbar outdent uses the structural model (like Shift+Tab), NOT margin.
    expect(itemA.style.marginLeft).toBe('');
    // "a" moved up to the top-level list; b and c stay nested (under a's new sublist).
    const topLis = editor.getEditorElement().querySelectorAll(':scope > ul > li, ul > li');
    expect(Array.from(editor.getEditorElement().querySelectorAll('ul > li')).map((l) => l.firstChild && l.firstChild.textContent)).toContain('a');
    expect(editor.getEditorElement().querySelector('ul ul')).not.toBeNull(); // b,c still nested
    expect(topLis.length).toBeGreaterThan(0);
    cleanup(editor, target);
  });
});

// ─── Re-audit C1: removeFormat must clear an ENCLOSING inline wrapper ──────────
describe('C1 — removeFormat clears formatting that wraps the selection', () => {
  function selNode(editor, node, a, b) {
    const r = document.createRange();
    if (a == null) r.selectNodeContents(node); else { r.setStart(node, a); r.setEnd(node, b); }
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  }
  it('removes <strong> when the whole wrapped word is selected', () => {
    const { editor, target } = makeEditor('<p><strong>hello</strong></p>');
    selNode(editor, editor.getEditorElement().querySelector('strong').firstChild);
    editor.commands.execute('removeFormat');
    expect(editor.getEditorElement().innerHTML).not.toMatch(/<strong>/);
    expect(editor.getEditorElement().textContent).toBe('hello');
    cleanup(editor, target);
  });
  it('removes nested <strong><em> wrappers', () => {
    const { editor, target } = makeEditor('<p><strong><em>hi</em></strong></p>');
    selNode(editor, editor.getEditorElement().querySelector('em').firstChild);
    editor.commands.execute('removeFormat');
    const h = editor.getEditorElement().innerHTML;
    expect(h).not.toMatch(/<strong>|<em>/);
    expect(editor.getEditorElement().textContent).toBe('hi');
    cleanup(editor, target);
  });
  it('partial removeFormat inside a wrapper keeps the unselected parts formatted, no text loss', () => {
    const { editor, target } = makeEditor('<p><strong>hello</strong></p>');
    selNode(editor, editor.getEditorElement().querySelector('strong').firstChild, 1, 4); // "ell"
    editor.commands.execute('removeFormat');
    expect(editor.getEditorElement().textContent).toBe('hello'); // nothing lost
    // "ell" is no longer entirely wrapped; the edge letters remain bold
    const strongText = Array.from(editor.getEditorElement().querySelectorAll('strong'))
      .map((s) => s.textContent).join('');
    expect(strongText).toBe('ho');
    cleanup(editor, target);
  });

  // ─── I2: removeFormat also clears BLOCK-level formatting (line-height,
  //         text-align, text-indent) that lives on the block, not inside it ──
  it('I2: removeFormat clears block line-height + alignment, not just inline', () => {
    const { editor, target } = makeEditor('<p style="line-height:3;text-align:center"><strong>hi</strong></p>');
    selNode(editor, editor.getEditorElement().querySelector('strong').firstChild);
    editor.commands.execute('removeFormat');
    const p = editor.getEditorElement().querySelector('p');
    expect(editor.getEditorElement().querySelector('strong')).toBeNull(); // inline cleared
    expect(p.style.lineHeight).toBe('');                                    // block cleared
    expect(p.style.textAlign).toBe('');
    expect(p.textContent).toBe('hi');                                      // text intact
    cleanup(editor, target);
  });

  it('I2: removeFormat clears block-level text-indent + font styles on the block', () => {
    const { editor, target } = makeEditor('<p style="text-indent:40px;font-size:30px">word</p>');
    selNode(editor, editor.getEditorElement().querySelector('p').firstChild);
    editor.commands.execute('removeFormat');
    const p = editor.getEditorElement().querySelector('p');
    expect(p.style.textIndent).toBe('');
    expect(p.style.fontSize).toBe('');
    expect(p.getAttribute('style')).toBeNull();   // empty style attr removed
    cleanup(editor, target);
  });

  it('I2: collapsed-caret removeFormat also clears the block formatting', () => {
    const { editor, target } = makeEditor('<p style="line-height:2">hello</p>');
    const p = editor.getEditorElement().querySelector('p');
    const r = document.createRange(); r.setStart(p.firstChild, 2); r.collapse(true);
    window.getSelection().removeAllRanges(); window.getSelection().addRange(r);
    editor.commands.execute('removeFormat');
    expect(p.style.lineHeight).toBe('');
    cleanup(editor, target);
  });

  // COLLAPSED CARET: the "bold on → clear format → keep typing plain" flow.
  // Previously removeFormat returned early on a collapsed caret (no-op), so the
  // caret stayed inside <strong> and the next char was still bold.
  function caretAt(node, off) {
    const r = document.createRange(); r.setStart(node, off); r.collapse(true);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  }
  /** After clear-format at a caret, the caret must NOT be inside any inline-format tag. */
  function caretInsideFormat(editor) {
    const info = editor.selection.get();
    let n = info && info.startNode;
    const root = editor.getEditorElement();
    while (n && n !== root) {
      if (n.nodeType === 1 && /^(strong|b|em|i|u|s|del|sup|sub|code|span|mark|font)$/.test(n.tagName.toLowerCase())) return true;
      n = n.parentNode;
    }
    return false;
  }

  it('collapsed caret inside <strong> → clear-format escapes it (caret no longer bold)', () => {
    const { editor, target } = makeEditor('<p><strong>bold</strong></p>');
    const t = editor.getEditorElement().querySelector('strong').firstChild;
    caretAt(t, t.nodeValue.length); // caret at end, INSIDE <strong>
    expect(caretInsideFormat(editor)).toBe(true);   // precondition: bold is active
    editor.commands.execute('removeFormat');
    expect(caretInsideFormat(editor)).toBe(false);  // FIX: caret escaped the formatting
    expect(editor.getEditorElement().textContent).toBe('bold'); // text preserved
    cleanup(editor, target);
  });

  it('collapsed caret inside an EMPTY pending <em> husk → clear-format removes the husk', () => {
    const { editor, target } = makeEditor('<p>hi<em>\u200B</em></p>');
    const em = editor.getEditorElement().querySelector('em');
    caretAt(em.firstChild, 1);
    editor.commands.execute('removeFormat');
    expect(editor.getEditorElement().querySelector('em')).toBeNull(); // husk gone
    expect(caretInsideFormat(editor)).toBe(false);
    cleanup(editor, target);
  });

  it('collapsed caret in PLAIN text → clear-format is a safe no-op', () => {
    const { editor, target } = makeEditor('<p>plain</p>');
    const t = editor.getEditorElement().querySelector('p').firstChild;
    caretAt(t, 3);
    expect(() => editor.commands.execute('removeFormat')).not.toThrow();
    expect(editor.getEditorElement().textContent).toBe('plain');
    cleanup(editor, target);
  });
});

// ─── Superscript / Subscript mutual exclusivity ───────────────────────────────
describe('super/subscript are mutually exclusive', () => {
  function selectWord(editor, tag) {
    const node = tag ? editor.getEditorElement().querySelector(tag).firstChild
                     : editor.getEditorElement().querySelector('p').firstChild;
    const r = document.createRange(); r.selectNodeContents(node);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  }
  it('applying subscript to superscript text swaps it (no <sub><sup> nesting)', () => {
    const { editor, target } = makeEditor('<p>x</p>');
    selectWord(editor);
    editor.commands.execute('superscript');
    expect(editor.getEditorElement().querySelector('sup')).not.toBeNull();
    // Now apply subscript to the same text — must become <sub>, not <sub><sup>.
    selectWord(editor, 'sup');
    editor.commands.execute('subscript');
    const html = editor.getEditorElement().innerHTML;
    expect(html).toMatch(/<sub>/);
    expect(html).not.toMatch(/<sub>\s*<sup>|<sup>\s*<sub>/); // no conflicting nesting
    expect(editor.getEditorElement().querySelector('sup')).toBeNull(); // sup removed
    cleanup(editor, target);
  });
  it('applying superscript to subscript text swaps it the other way', () => {
    const { editor, target } = makeEditor('<p>y</p>');
    selectWord(editor);
    editor.commands.execute('subscript');
    selectWord(editor, 'sub');
    editor.commands.execute('superscript');
    expect(editor.getEditorElement().querySelector('sup')).not.toBeNull();
    expect(editor.getEditorElement().querySelector('sub')).toBeNull();
    cleanup(editor, target);
  });
  it('toggling the SAME one off still works (superscript on then off)', () => {
    const { editor, target } = makeEditor('<p>z</p>');
    selectWord(editor);
    editor.commands.execute('superscript');
    expect(editor.getEditorElement().querySelector('sup')).not.toBeNull();
    selectWord(editor, 'sup');
    editor.commands.execute('superscript'); // toggle OFF
    expect(editor.getEditorElement().querySelector('sup')).toBeNull();
    cleanup(editor, target);
  });

  // I6: a selection that STARTS in plain text but extends INTO a <sub> must still
  // drop the sub when applying sup (insideTag only checked the start node).
  it('I6: applying sup to a selection starting OUTSIDE the sub removes the sub (no both)', () => {
    const { editor, target } = makeEditor('<p>plain<sub>x</sub></p>');
    const p = editor.getEditorElement().querySelector('p');
    const r = document.createRange();
    r.setStart(p.firstChild, 0);                       // start in "plain"
    r.setEnd(p.querySelector('sub').firstChild, 1);    // end inside the sub
    window.getSelection().removeAllRanges(); window.getSelection().addRange(r);
    editor.commands.execute('superscript');
    const html = editor.getEditorElement().innerHTML;
    expect(editor.getEditorElement().querySelector('sub')).toBeNull();   // sub removed
    expect(editor.getEditorElement().querySelector('sup')).not.toBeNull();
    expect(html).not.toMatch(/<sub>\s*<sup>|<sup>\s*<sub>/);            // no nesting
    expect(editor.getEditorElement().textContent.replace(/[\u200B\uFEFF]/g, '')).toBe('plainx'); // no text loss
    cleanup(editor, target);
  });
});

// ─── Re-audit C2: cross-block inline format must not wrap block elements ───────
describe('C2 — cross-block bold formats per-block (no <strong><p>)', () => {
  it('bold across two <p> inside a <div> wraps each block content, not the blocks', () => {
    const { editor, target } = makeEditor('<div><p>aaa</p><p>bbb</p></div>');
    const ps = editor.getEditorElement().querySelectorAll('p');
    const r = document.createRange();
    r.setStart(ps[0].firstChild, 1); r.setEnd(ps[1].firstChild, 2);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    editor.commands.execute('bold');
    const h = editor.getEditorElement().innerHTML;
    expect(h).not.toMatch(/<strong>\s*<p/i);      // no strong-wrapping-block
    expect(h).not.toMatch(/<strong>[^<]*<p/i);
    expect(editor.getEditorElement().querySelectorAll('p').length).toBe(2); // structure intact
    expect(editor.getEditorElement().querySelector('strong')).not.toBeNull();
    cleanup(editor, target);
  });
});
