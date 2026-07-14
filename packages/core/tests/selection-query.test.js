import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SelectionManager } from '../src/selection/selection-manager.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeEditor() {
  const el = document.createElement('div');
  el.className = 'oe-editor';
  el.contentEditable = 'true';
  document.body.appendChild(el);
  return el;
}

function cleanup(el) {
  if (el && el.parentNode) el.parentNode.removeChild(el);
}

function setEditorHTML(el, html) {
  el.innerHTML = html;
}

// Place cursor at (node, offset) via Selection API
function setCursor(node, offset) {
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

// Select from (startNode, startOffset) to (endNode, endOffset)
function setRange(startNode, startOffset, endNode, endOffset) {
  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

// ─── 3.1 + 3.2 — get() ───────────────────────────────────────────────────────

// ─── 3.5 — getSelectedHTML() ─────────────────────────────────────────────────

describe('3.5 — getSelectedHTML()', () => {
  let el, sm;
  beforeEach(() => {
    el = makeEditor();
    sm = new SelectionManager(el);
  });
  afterEach(() => {
    window.getSelection().removeAllRanges();
    cleanup(el);
  });

  it('returns empty string when selection is collapsed', () => {
    setEditorHTML(el, '<p>hello</p>');
    setCursor(el.querySelector('p').firstChild, 2);
    expect(sm.getSelectedHTML()).toBe('');
  });

  it('returns empty string when nothing is selected', () => {
    window.getSelection().removeAllRanges();
    expect(sm.getSelectedHTML()).toBe('');
  });

  it('returns HTML of selected text', () => {
    setEditorHTML(el, '<p>hello</p>');
    const textNode = el.querySelector('p').firstChild;
    setRange(textNode, 0, textNode, 5);
    expect(sm.getSelectedHTML()).toBe('hello');
  });

  it('returns HTML including tags when selection spans elements', () => {
    setEditorHTML(el, '<p><strong>bold</strong></p>');
    const strong = el.querySelector('strong');
    setRange(strong, 0, strong, 1);
    const html = sm.getSelectedHTML();
    expect(html.toLowerCase()).toContain('bold');
  });

  it('returns empty string when _editorEl is null', () => {
    sm.update(null, null);
    expect(sm.getSelectedHTML()).toBe('');
  });
});

// ─── 3.6 — getSelectedText() ─────────────────────────────────────────────────

describe('3.6 — getSelectedText()', () => {
  let el, sm;
  beforeEach(() => {
    el = makeEditor();
    sm = new SelectionManager(el);
  });
  afterEach(() => {
    window.getSelection().removeAllRanges();
    cleanup(el);
  });

  it('returns empty string when collapsed', () => {
    setEditorHTML(el, '<p>hello</p>');
    setCursor(el.querySelector('p').firstChild, 2);
    expect(sm.getSelectedText()).toBe('');
  });

  it('returns empty string when nothing selected', () => {
    window.getSelection().removeAllRanges();
    expect(sm.getSelectedText()).toBe('');
  });

  it('returns plain text of selection', () => {
    setEditorHTML(el, '<p>hello world</p>');
    const textNode = el.querySelector('p').firstChild;
    setRange(textNode, 6, textNode, 11);
    expect(sm.getSelectedText()).toBe('world');
  });

  it('returns empty string when _editorEl is null', () => {
    sm.update(null, null);
    expect(sm.getSelectedText()).toBe('');
  });
});

// ─── 16.A2 — documented public aliases getHTML() / getText() ──────────────────

describe('16.A2 — selection.getHTML() / getText() aliases', () => {
  let el, sm;
  beforeEach(() => { el = makeEditor(); sm = new SelectionManager(el); });
  afterEach(() => { window.getSelection().removeAllRanges(); cleanup(el); });

  it('getHTML() returns the same as getSelectedHTML()', () => {
    setEditorHTML(el, '<p>hello world</p>');
    const t = el.querySelector('p').firstChild;
    setRange(t, 0, t, 5);
    expect(sm.getHTML()).toBe(sm.getSelectedHTML());
    expect(sm.getHTML()).toBe('hello');
  });

  it('getText() returns the same as getSelectedText()', () => {
    setEditorHTML(el, '<p>hello world</p>');
    const t = el.querySelector('p').firstChild;
    setRange(t, 6, t, 11);
    expect(sm.getText()).toBe(sm.getSelectedText());
    expect(sm.getText()).toBe('world');
  });

  it('both aliases return empty string when collapsed', () => {
    setEditorHTML(el, '<p>hello</p>');
    setCursor(el.querySelector('p').firstChild, 2);
    expect(sm.getHTML()).toBe('');
    expect(sm.getText()).toBe('');
  });
});
