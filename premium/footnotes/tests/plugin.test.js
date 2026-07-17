/**
 * footnotes plugin — driven against a REAL OpenEditor instance (not a stub),
 * because the whole point is correct integration with the command/undo/
 * selection/sanitizer systems. Verifies gating, insertion, one-undo-step,
 * round-trip survival, and read-only blocking.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createFootnotesPlugin, FEATURE_ID } from '../src/index.js';
import { OpenEditor } from '../../../packages/core/src/editor.js';

const ALLOW = { manager: { gate: () => ({ allowed: true, reason: 'granted' }) }, upgradeNotice: false };
const DENY  = { manager: { gate: () => ({ allowed: false, reason: 'no-license' }) }, upgradeNotice: false };

let target, editor;
beforeEach(() => {
  target = document.createElement('div');
  document.body.appendChild(target);
  editor = new OpenEditor(target, {});
});
afterEach(() => {
  try { editor.destroy(); } catch { /* ignore */ }
  target.remove();
  document.querySelectorAll('.oe-wrapper').forEach((n) => n.remove());
});

/** Put the caret at the end of the editable so insertAtCursor has a target. */
function caretAtEnd() {
  const el = editor.getEditorElement();
  el.focus();
  const r = document.createRange();
  r.selectNodeContents(el);
  r.collapse(false);
  const sel = (editor._iframeDoc || document).getSelection();
  sel.removeAllRanges(); sel.addRange(r);
}

describe('footnotes — feature id', () => {
  it('requires footnotes', () => expect(FEATURE_ID).toBe('footnotes'));
});

describe('footnotes — granted', () => {
  it('installs, contributes the button, exposes editor.insertFootnote', () => {
    editor.plugins.install(createFootnotesPlugin(ALLOW));
    expect(editor.plugins.isInstalled('footnotes')).toBe(true);
    expect(typeof editor.insertFootnote).toBe('function');
    const btn = editor.plugins.get('footnotes').getToolbarButtons()[0];
    expect(btn).toMatchObject({ name: 'insertFootnote' });
    expect(btn.readOnlyExempt).toBeFalsy(); // mutating → disabled in read-only
  });

  it('inserting a footnote adds a ref marker + a notes-section entry', () => {
    editor.setHTML('<p>Hello world</p>');
    editor.plugins.install(createFootnotesPlugin(ALLOW));
    caretAtEnd();
    editor.insertFootnote();
    const html = editor.getHTML();
    expect(html).toContain('data-oe-footnote-ref="1"');
    expect(html).toContain('data-oe-footnotes');
    expect(html).toContain('id="fn-1"');
    expect(editor.getFootnoteCount()).toBe(1);
  });

  it('FN-1 — inserting a footnote places the caret INSIDE the new note (so it can be typed)', () => {
    editor.setHTML('<p>Body</p>');
    editor.plugins.install(createFootnotesPlugin(ALLOW));
    caretAtEnd();
    editor.insertFootnote();
    // The caret should now be within the notes-section <li id="fn-1">.
    const doc = editor._iframeDoc || document;
    const sel = doc.getSelection();
    expect(sel.rangeCount).toBeGreaterThan(0);
    const container = sel.getRangeAt(0).startContainer;
    const li = container.nodeType === 1 ? container.closest('li#fn-1')
      : container.parentElement && container.parentElement.closest('li#fn-1');
    expect(li).not.toBeNull();
    // Typing now lands in the note body.
    editor.selection.insertAtCursor('My footnote text');
    expect(editor.getEditorElement().querySelector('li#fn-1').textContent).toContain('My footnote text');
  });

  it('FN-2 — deleting a marker renumbers and drops its orphaned note', async () => {
    editor.plugins.install(createFootnotesPlugin(ALLOW));
    // Two footnotes; then remove the FIRST marker from the DOM (as a delete would).
    editor.setHTML(
      '<p>A<sup class="oe-footnote-ref" contenteditable="false" data-oe-footnote-ref="1" id="fnref-1">1</sup>'
      + ' B<sup class="oe-footnote-ref" contenteditable="false" data-oe-footnote-ref="2" id="fnref-2">2</sup></p>'
      + '<ol class="oe-footnotes" data-oe-footnotes>'
      + '<li id="fn-1" data-oe-footnote="1">note A</li>'
      + '<li id="fn-2" data-oe-footnote="2">note B</li></ol>');
    expect(editor.getFootnoteCount()).toBe(2);
    const el = editor.getEditorElement();
    el.querySelector('#fnref-1').remove(); // simulate deleting the first marker
    editor.emit('input', {}); // the edit fires input → onInput → resync
    await new Promise((r) => setTimeout(r, 260)); // wait past the 200ms debounce
    expect(editor.getFootnoteCount()).toBe(1);
    const notes = [...el.querySelectorAll('ol.oe-footnotes > li')];
    expect(notes.length).toBe(1);
    expect(notes[0].textContent).toBe('note B'); // the surviving note, renumbered to 1
    expect(notes[0].id).toBe('fn-1');
  });

  it('a second footnote numbers 2 and the section has two items', () => {
    editor.setHTML('<p>A B</p>');
    editor.plugins.install(createFootnotesPlugin(ALLOW));
    caretAtEnd(); editor.insertFootnote();
    caretAtEnd(); editor.insertFootnote();
    expect(editor.getFootnoteCount()).toBe(2);
    expect(editor.getEditorElement().querySelectorAll('ol.oe-footnotes > li').length).toBe(2);
  });

  it('footnote markup SURVIVES a getHTML()/setHTML() round-trip', () => {
    editor.setHTML('<p>X</p>');
    editor.plugins.install(createFootnotesPlugin(ALLOW));
    caretAtEnd(); editor.insertFootnote();
    const saved = editor.getHTML();
    // Reload the saved HTML into a fresh editor with the plugin.
    editor.setHTML(saved);
    const reloaded = editor.getHTML();
    expect(reloaded).toContain('data-oe-footnote-ref="1"');
    expect(reloaded).toContain('data-oe-footnotes');
    expect(editor.getFootnoteCount()).toBe(1);
  });

  it('insert is ONE undo step: undo removes both the marker and the note', () => {
    editor.setHTML('<p>Hello</p>');
    editor.plugins.install(createFootnotesPlugin(ALLOW));
    caretAtEnd(); editor.insertFootnote();
    expect(editor.getFootnoteCount()).toBe(1);
    editor.undo();
    expect(editor.getEditorElement().querySelector('sup.oe-footnote-ref')).toBeNull();
    expect(editor.getEditorElement().querySelector('ol.oe-footnotes')).toBeNull();
  });

  it('read-only blocks the insert command (mutation disabled)', () => {
    editor.setHTML('<p>locked</p>');
    editor.plugins.install(createFootnotesPlugin(ALLOW));
    editor.disable ? editor.disable() : editor.setReadOnly && editor.setReadOnly(true);
    caretAtEnd();
    editor.commands.execute('insertFootnote');
    expect(editor.getFootnoteCount()).toBe(0); // nothing inserted while locked
  });

  it('destroy unregisters the command + removes the handles', () => {
    const plugin = createFootnotesPlugin(ALLOW);
    editor.plugins.install(plugin);
    editor.plugins.uninstall('footnotes');
    expect(editor.insertFootnote).toBeUndefined();
    expect(editor.getFootnoteCount).toBeUndefined();
  });
});

describe('footnotes — denied (graceful degrade)', () => {
  it('no-op stub: no insertFootnote handle, no button', () => {
    editor.plugins.install(createFootnotesPlugin(DENY));
    expect(editor.plugins.isInstalled('footnotes')).toBe(true);
    expect(editor.insertFootnote).toBeUndefined();
  });
});
