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

describe('3.2 — SelectionManager.get()', () => {
  let el, sm;
  beforeEach(() => {
    el = makeEditor();
    sm = new SelectionManager(el);
  });
  afterEach(() => {
    window.getSelection().removeAllRanges();
    cleanup(el);
  });

  it('returns null when there is no selection (rangeCount === 0)', () => {
    window.getSelection().removeAllRanges();
    expect(sm.get()).toBeNull();
  });

  it('returns null when _editorEl is null (destroyed)', () => {
    sm.update(null, null);
    expect(sm.get()).toBeNull();
  });

  it('returns null when selection is outside the editor', () => {
    const outside = document.createElement('p');
    outside.textContent = 'outside';
    document.body.appendChild(outside);
    setCursor(outside.firstChild, 0);
    expect(sm.get()).toBeNull();
    document.body.removeChild(outside);
  });

  it('returns { range, startNode, endNode, collapsed } for collapsed cursor', () => {
    setEditorHTML(el, '<p>hello</p>');
    const textNode = el.querySelector('p').firstChild;
    setCursor(textNode, 2);
    const info = sm.get();
    expect(info).not.toBeNull();
    expect(info.collapsed).toBe(true);
    expect(info.startNode).toBe(textNode);
    expect(info.endNode).toBe(textNode);
    expect(info.range).toBeDefined();
  });

  it('returns collapsed:false for a non-collapsed selection', () => {
    setEditorHTML(el, '<p>hello</p>');
    const textNode = el.querySelector('p').firstChild;
    setRange(textNode, 0, textNode, 3);
    const info = sm.get();
    expect(info.collapsed).toBe(false);
  });

  it('returns a cloned range (not live)', () => {
    setEditorHTML(el, '<p>hello</p>');
    const textNode = el.querySelector('p').firstChild;
    setCursor(textNode, 1);
    const info = sm.get();
    // Move native selection — cloned range must not change
    setCursor(textNode, 4);
    expect(info.range.startOffset).toBe(1);
  });
});

// ─── 3.3 + 3.4 — save() / restore() ─────────────────────────────────────────

describe('3.3 + 3.4 — save() / restore()', () => {
  let el, sm;
  beforeEach(() => {
    el = makeEditor();
    sm = new SelectionManager(el);
  });
  afterEach(() => {
    window.getSelection().removeAllRanges();
    cleanup(el);
  });

  it('save() returns null when there is no selection', () => {
    window.getSelection().removeAllRanges();
    expect(sm.save()).toBeNull();
  });

  it('save() returns a bookmark object with all required fields', () => {
    setEditorHTML(el, '<p>hello</p>');
    const textNode = el.querySelector('p').firstChild;
    setCursor(textNode, 3);
    const bm = sm.save();
    expect(bm).not.toBeNull();
    expect(Array.isArray(bm.startPath)).toBe(true);
    expect(typeof bm.startOffset).toBe('number');
    expect(Array.isArray(bm.endPath)).toBe(true);
    expect(typeof bm.endOffset).toBe('number');
    expect(typeof bm.collapsed).toBe('boolean');
    expect(bm.collapsed).toBe(true);
  });

  it('save() bookmark has correct endPath and endOffset for non-collapsed selection', () => {
    setEditorHTML(el, '<p>hello world</p>');
    const textNode = el.querySelector('p').firstChild;
    setRange(textNode, 2, textNode, 8);
    const bm = sm.save();
    expect(bm.collapsed).toBe(false);
    expect(bm.startOffset).toBe(2);
    expect(bm.endOffset).toBe(8);
    expect(Array.isArray(bm.endPath)).toBe(true);
    expect(bm.endPath.length).toBeGreaterThan(0);
  });

  it('restore() round-trips a collapsed cursor exactly', () => {
    setEditorHTML(el, '<p>hello world</p>');
    const textNode = el.querySelector('p').firstChild;
    setCursor(textNode, 5);
    const bm = sm.save();

    // Move cursor away
    setCursor(textNode, 0);

    sm.restore(bm);
    const sel = window.getSelection();
    expect(sel.rangeCount).toBeGreaterThan(0);
    const r = sel.getRangeAt(0);
    expect(r.startOffset).toBe(5);
    expect(r.collapsed).toBe(true);
  });

  it('restore() round-trips a non-collapsed selection', () => {
    setEditorHTML(el, '<p>hello world</p>');
    const textNode = el.querySelector('p').firstChild;
    setRange(textNode, 2, textNode, 7);
    const bm = sm.save();

    // Clear selection
    window.getSelection().removeAllRanges();

    sm.restore(bm);
    const sel = window.getSelection();
    expect(sel.rangeCount).toBeGreaterThan(0);
    const r = sel.getRangeAt(0);
    expect(r.startOffset).toBe(2);
    expect(r.endOffset).toBe(7);
    expect(r.collapsed).toBe(false);
  });

  it('restore() does not throw when path is stale (deleted node)', () => {
    setEditorHTML(el, '<p>hello</p>');
    const textNode = el.querySelector('p').firstChild;
    setCursor(textNode, 2);
    const bm = sm.save();

    // Wipe the editor DOM — path is now stale
    el.innerHTML = '';

    expect(() => sm.restore(bm)).not.toThrow();
  });

  it('restore() is a no-op when bookmark is null', () => {
    expect(() => sm.restore(null)).not.toThrow();
  });

  it('restore() is a no-op when _editorEl is null', () => {
    sm.update(null, null);
    expect(() => sm.restore({ startPath: [0], startOffset: 0, endPath: [0], endOffset: 0, collapsed: true })).not.toThrow();
  });

  it('restore() survives an unrelated DOM mutation (add sibling paragraph)', () => {
    setEditorHTML(el, '<p>first</p>');
    const textNode = el.querySelector('p').firstChild;
    setCursor(textNode, 3);
    const bm = sm.save();

    // Add a second paragraph — does not affect the first text node's path
    const p2 = document.createElement('p');
    p2.textContent = 'second';
    el.appendChild(p2);

    sm.restore(bm);
    const r = window.getSelection().getRangeAt(0);
    expect(r.startOffset).toBe(3);
  });

  it('restore() does not throw when non-collapsed bookmark has a stale endPath (T2)', () => {
    setEditorHTML(el, '<p>hello world</p>');
    const textNode = el.querySelector('p').firstChild;
    setRange(textNode, 0, textNode, 5);
    const bm = sm.save();

    // Wipe editor — both startPath and endPath are now stale
    el.innerHTML = '';

    // Must not throw; selection collapses gracefully to end-of-editor fallback
    expect(() => sm.restore(bm)).not.toThrow();
  });
});
