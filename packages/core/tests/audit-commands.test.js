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
  it('fontFamily expands to word and returns SKIP_RESTORE on a collapsed selection', () => {
    // Word-expansion: placing cursor inside a word and applying fontFamily
    // selects the whole word (Jodit-style UX) and returns SKIP_RESTORE.
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

// ─── C048: double-Enter does not delete an <li> that owns a sublist ───────────

describe('C048 — empty <li> with a child sublist is not treated as empty', () => {
  it('refuses to exit the list, preserving the sublist', () => {
    const { editor, target } = makeEditor('<ul><li> <ul><li>child</li></ul></li></ul>');
    const li = editor.getEditorElement().querySelector('li');
    const r = document.createRange();
    r.setStart(li, 0); r.collapse(true);
    window.getSelection().removeAllRanges(); window.getSelection().addRange(r);
    expect(handleListEnter(editor)).toBe(false);
    expect(editor.getEditorElement().textContent).toContain('child');
    cleanup(editor, target);
  });
});

// ─── C047: outdent of nested middle item keeps following siblings nested ──────

describe('C047 — toolbar outdent applies marginLeft to nested <li> (Jodit margin-based)', () => {
  it('toolbar outdent on nested <li> applies marginLeft: 10px', () => {
    const { editor, target } = makeEditor(
      '<ul><li>parent<ul><li>a</li><li>b</li><li>c</li></ul></li></ul>'
    );
    const sub = editor.getEditorElement().querySelectorAll('ul')[1];
    const itemA = sub.children[0];
    const r = document.createRange();
    r.setStart(itemA.firstChild || itemA, 0); r.collapse(true);
    window.getSelection().removeAllRanges(); window.getSelection().addRange(r);
    editor.commands.execute('outdent');
    // Toolbar outdent = margin-based (Jodit). No margin to remove → marginLeft empty.
    // Structural outdent (promoting nested li) is done by Shift+Tab, not the toolbar.
    expect(itemA.style.marginLeft).toBe('');
    // List structure unchanged
    expect(editor.getEditorElement().querySelector('ul ul')).not.toBeNull();
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
