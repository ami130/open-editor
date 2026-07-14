/**
 * format-painter.test.js — Phase 13.9: capture/apply logic + plugin state machine.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestEditor } from '../src/testing/test-harness.js';
import { captureFormat, applyFormat, hasFormat, PAINTABLE } from '../src/plugins/format-painter/format-capture.js';
import { createFormatPainterPlugin, formatPainterPlugin } from '../src/plugins/format-painter/format-painter-plugin.js';

let editor;
beforeEach(() => { editor = createTestEditor(); });
afterEach(() => {
  if (!editor.isDestroyed()) editor.destroy();
  if (editor._target && editor._target.parentNode) editor._target.remove();
});

function selectText(node, start, end) {
  const r = document.createRange(); r.setStart(node, start); r.setEnd(node, end);
  const s = editor.selection.getWindow().getSelection(); s.removeAllRanges(); s.addRange(r);
}
function selectAcross(startNode, startOff, endNode, endOff) {
  const r = document.createRange(); r.setStart(startNode, startOff); r.setEnd(endNode, endOff);
  const s = editor.selection.getWindow().getSelection(); s.removeAllRanges(); s.addRange(r);
}
function caretIn(node, off) {
  const r = document.createRange(); r.setStart(node, off); r.collapse(true);
  const s = editor.selection.getWindow().getSelection(); s.removeAllRanges(); s.addRange(r);
}

describe('captureFormat', () => {
  it('captures the inline tags active at the caret', () => {
    editor.getEditorElement().innerHTML = '<p><strong><em>hi</em></strong></p>';
    const em = editor.getEditorElement().querySelector('em').firstChild;
    caretIn(em, 1);
    const cap = captureFormat(editor);
    expect(cap.tags).toContain('strong');
    expect(cap.tags).toContain('em');
    expect(cap.tags).not.toContain('u');
  });
  it('captures nothing in plain text', () => {
    editor.getEditorElement().innerHTML = '<p>plain</p>';
    caretIn(editor.getEditorElement().querySelector('p').firstChild, 2);
    expect(captureFormat(editor).tags).toEqual([]);
    expect(hasFormat(captureFormat(editor))).toBe(false);
  });
});

describe('applyFormat', () => {
  it('adds captured formatting to the target selection', () => {
    editor.getEditorElement().innerHTML = '<p>target</p>';
    selectText(editor.getEditorElement().querySelector('p').firstChild, 0, 6);
    const applied = applyFormat(editor, { tags: ['strong', 'em'] });
    expect(applied).toBe(2);
    const html = editor.getHTML();
    expect(html).toMatch(/<strong>/);
    expect(html).toMatch(/<em>/);
  });

  it('does NOT toggle off a format the target already has (critical)', () => {
    // target is already bold; painting bold must NOT remove it
    editor.getEditorElement().innerHTML = '<p><strong>bold</strong></p>';
    const strongText = editor.getEditorElement().querySelector('strong').firstChild;
    selectText(strongText, 0, 4);
    const applied = applyFormat(editor, { tags: ['strong'] });
    expect(applied).toBe(0);                    // nothing applied (already present)
    expect(editor.getHTML()).toMatch(/<strong>bold<\/strong>/); // still bold
  });

  it('adds only the MISSING formats when target is partially formatted', () => {
    editor.getEditorElement().innerHTML = '<p><em>x</em></p>';
    const emText = editor.getEditorElement().querySelector('em').firstChild;
    selectText(emText, 0, 1);
    // source had bold+italic; target already italic → only bold is added
    const applied = applyFormat(editor, { tags: ['strong', 'em'] });
    expect(applied).toBe(1);
    expect(editor.getHTML()).toMatch(/<strong>/);
  });

  it('returns 0 for empty capture or missing commands', () => {
    expect(applyFormat(editor, { tags: [] })).toBe(0);
    expect(applyFormat(editor, null)).toBe(0);
  });

  // Adversarial-verifier regressions: boundary-crossing selections must not
  // nest wrappers (CRITICAL) or silently no-op (HIGH).
  it('plain→formatted selection does NOT produce nested wrappers (CRITICAL regression)', () => {
    editor.getEditorElement().innerHTML = '<p>BBB<strong>AAA</strong></p>';
    const p = editor.getEditorElement().querySelector('p');
    selectAcross(p.firstChild, 1, p.querySelector('strong').firstChild, 2);
    applyFormat(editor, { tags: ['strong'] });
    // no <strong> directly inside another <strong>
    expect(editor.getEditorElement().innerHTML).not.toMatch(/<strong>[^<]*<strong>/);
  });

  it('formatted→plain selection DOES bold the plain part (HIGH regression)', () => {
    editor.getEditorElement().innerHTML = '<p><strong>AAA</strong>BBB</p>';
    const p = editor.getEditorElement().querySelector('p');
    selectAcross(p.querySelector('strong').firstChild, 1, p.lastChild, 2);
    applyFormat(editor, { tags: ['strong'] });
    const strongText = Array.from(editor.getEditorElement().querySelectorAll('strong'))
      .map((s) => s.textContent).join('');
    expect(strongText).toContain('BB'); // the previously-plain part is now bold
  });

  it('partial selection wraps ONLY the selected characters (audit#4 regression)', () => {
    editor.getEditorElement().innerHTML = '<p>hello world</p>';
    const t = editor.getEditorElement().querySelector('p').firstChild;
    selectText(t, 2, 7); // "llo w"
    applyFormat(editor, { tags: ['strong'] });
    expect(editor.getEditorElement().querySelector('strong').textContent).toBe('llo w');
    expect(editor.getEditorElement().querySelector('p').textContent).toBe('hello world'); // no loss
  });

  it('multiple tags all apply on a plain selection (range-stale regression)', () => {
    editor.getEditorElement().innerHTML = '<p>hello</p>';
    const t = editor.getEditorElement().querySelector('p').firstChild;
    selectText(t, 0, 5);
    const n = applyFormat(editor, { tags: ['strong', 'em'] });
    expect(n).toBe(2);
    expect(editor.getEditorElement().querySelector('strong')).not.toBeNull();
    expect(editor.getEditorElement().querySelector('em')).not.toBeNull();
  });

  it('PAINTABLE maps each tag to a registered command', () => {
    for (const { command } of PAINTABLE) {
      expect(editor.commands.has ? editor.commands.has(command) : true).toBeTruthy();
    }
  });
});

describe('format painter plugin state machine', () => {
  it('exposes the contract + singleton', () => {
    const p = createFormatPainterPlugin();
    expect(p.name).toBe('formatPainter');
    expect(formatPainterPlugin.name).toBe('formatPainter');
  });

  it('arming requires a source format; clicking on plain text stays idle', () => {
    const p = createFormatPainterPlugin(); p.install(editor);
    editor.getEditorElement().innerHTML = '<p>plain</p>';
    caretIn(editor.getEditorElement().querySelector('p').firstChild, 2);
    p._onClick();
    expect(p._armed).toBe(false); // nothing to paint
  });

  it('single-use: arm at a formatted caret, paint next selection, then disarm', () => {
    const p = createFormatPainterPlugin(); p.install(editor);
    editor.getEditorElement().innerHTML = '<p><strong>src</strong> tgt</p>';
    const strongText = editor.getEditorElement().querySelector('strong').firstChild;
    caretIn(strongText, 1);
    p._onClick();
    expect(p._armed).toBe(true);
    // select "tgt" (the text node after </strong>)
    const p_ = editor.getEditorElement().querySelector('p');
    const tgtNode = p_.childNodes[p_.childNodes.length - 1]; // " tgt"
    selectText(tgtNode, 1, 4);
    p._maybeApply();
    expect(editor.getHTML()).toMatch(/<strong>[^<]*tgt/);
    expect(p._armed).toBe(false); // single-use disarmed
  });

  it('sticky mode stays armed after applying', () => {
    editor._config.formatPainterSticky = true;
    const p = createFormatPainterPlugin(); p.install(editor);
    editor.getEditorElement().innerHTML = '<p><em>s</em> a b</p>';
    caretIn(editor.getEditorElement().querySelector('em').firstChild, 1);
    p._onClick();
    expect(p._armed).toBe(true);
    const p_ = editor.getEditorElement().querySelector('p');
    const tail = p_.childNodes[p_.childNodes.length - 1];
    selectText(tail, 1, 2);
    p._maybeApply();
    expect(p._armed).toBe(true); // sticky → still armed
  });

  it('a second click disarms (toggle)', () => {
    const p = createFormatPainterPlugin(); p.install(editor);
    editor.getEditorElement().innerHTML = '<p><strong>s</strong></p>';
    caretIn(editor.getEditorElement().querySelector('strong').firstChild, 1);
    p._onClick(); expect(p._armed).toBe(true);
    p._onClick(); expect(p._armed).toBe(false);
  });

  it('Escape disarms while armed', () => {
    const p = createFormatPainterPlugin(); p.install(editor);
    editor.getEditorElement().innerHTML = '<p><strong>s</strong></p>';
    caretIn(editor.getEditorElement().querySelector('strong').firstChild, 1);
    p._onClick(); expect(p._armed).toBe(true);
    expect(p.onKeyDown({ key: 'Escape' })).toBe(true);
    expect(p._armed).toBe(false);
  });

  it('collapsed target selection does not apply (nothing to paint onto)', () => {
    const p = createFormatPainterPlugin(); p.install(editor);
    editor.getEditorElement().innerHTML = '<p><strong>s</strong>x</p>';
    caretIn(editor.getEditorElement().querySelector('strong').firstChild, 1);
    p._onClick();
    const p_ = editor.getEditorElement().querySelector('p');
    caretIn(p_.lastChild, 1); // collapsed
    p._maybeApply();
    expect(p._armed).toBe(true); // still armed (didn't consume on a caret)
  });

  it('installs/uninstalls cleanly', () => {
    editor.plugins.install(createFormatPainterPlugin());
    expect(editor.plugins._installed.has('formatPainter')).toBe(true);
    expect(() => editor.plugins.uninstall('formatPainter')).not.toThrow();
  });
});
