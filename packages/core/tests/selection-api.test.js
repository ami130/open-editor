/**
 * Tests for the public SelectionManager API added to satisfy README Phase 3
 * milestones 3.1/3.2/3.5/3.7/3.10: set(), collapse(), the get() shape, and
 * isInsideEditor(). The native expandToWord() path (Selection.modify) is
 * verified in real Chromium; here we exercise the manual text-scan fallback
 * (jsdom has no Selection.modify). Split from selection-mutate.test.js to stay
 * within the 300-line limit.
 */
import { describe, it, expect } from 'vitest';
import { SelectionManager } from '../src/selection/selection-manager.js';

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
function setRange(startNode, startOffset, endNode, endOffset) {
  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

// ─── set() / collapse() (3.1, 3.5) ────────────────────────────────────────────

describe('SelectionManager.set / collapse', () => {
  it('set(node, s, node, e) creates a range covering the right text', () => {
    const el = makeEditor();
    const sm = new SelectionManager(el);
    el.innerHTML = '<p>hello</p>';
    const t = el.querySelector('p').firstChild;
    sm.set(t, 1, t, 4);
    const info = sm.get();
    expect(info.collapsed).toBe(false);
    expect(info.startOffset).toBe(1);
    expect(info.endOffset).toBe(4);
    cleanup(el);
  });

  it('collapse(node, offset) places a collapsed caret', () => {
    const el = makeEditor();
    const sm = new SelectionManager(el);
    el.innerHTML = '<p>hello</p>';
    const t = el.querySelector('p').firstChild;
    sm.collapse(t, 3);
    const info = sm.get();
    expect(info.collapsed).toBe(true);
    expect(info.startOffset).toBe(3);
    cleanup(el);
  });

  it('set clamps an over-long offset to the node length', () => {
    const el = makeEditor();
    const sm = new SelectionManager(el);
    el.innerHTML = '<p>hi</p>';
    const t = el.querySelector('p').firstChild;
    sm.collapse(t, 999);
    expect(sm.get().startOffset).toBe(2);
    cleanup(el);
  });

  it('set rejects a node outside the editor (no-op)', () => {
    const el = makeEditor();
    const sm = new SelectionManager(el);
    el.innerHTML = '<p>in</p>';
    sm.collapse(el.querySelector('p').firstChild, 0);
    const outside = document.createElement('p');
    outside.textContent = 'out';
    document.body.appendChild(outside);
    sm.set(outside.firstChild, 0, outside.firstChild, 2);
    expect(sm.isInsideEditor()).toBe(true);
    document.body.removeChild(outside);
    cleanup(el);
  });
});

// ─── get() shape (3.2) ────────────────────────────────────────────────────────

describe('SelectionManager.get shape', () => {
  it('exposes startOffset, endOffset, and commonAncestor', () => {
    const el = makeEditor();
    const sm = new SelectionManager(el);
    el.innerHTML = '<p>hello world</p>';
    const t = el.querySelector('p').firstChild;
    setRange(t, 2, t, 7);
    const info = sm.get();
    expect(info.startOffset).toBe(2);
    expect(info.endOffset).toBe(7);
    expect(info.commonAncestor).toBe(t);
    cleanup(el);
  });
});

// ─── isInsideEditor (3.7) ─────────────────────────────────────────────────────

describe('SelectionManager.isInsideEditor', () => {
  it('true when the selection is inside, false when outside', () => {
    const el = makeEditor();
    const sm = new SelectionManager(el);
    el.innerHTML = '<p>hello</p>';
    sm.collapse(el.querySelector('p').firstChild, 1);
    expect(sm.isInsideEditor()).toBe(true);

    const outside = document.createElement('p');
    outside.textContent = 'out';
    document.body.appendChild(outside);
    setRange(outside.firstChild, 0, outside.firstChild, 3);
    expect(sm.isInsideEditor()).toBe(false);
    document.body.removeChild(outside);
    cleanup(el);
  });

  it('false when there is no selection', () => {
    const el = makeEditor();
    const sm = new SelectionManager(el);
    window.getSelection().removeAllRanges();
    expect(sm.isInsideEditor()).toBe(false);
    cleanup(el);
  });
});

// ─── expandToWord fallback (3.10) ─────────────────────────────────────────────
// jsdom has no Selection.modify(), so this exercises the manual text-scan
// fallback. (The native path is verified separately in real Chromium.)

describe('SelectionManager.expandToWord (fallback path)', () => {
  it('expands a collapsed caret to the surrounding word', () => {
    const el = makeEditor();
    const sm = new SelectionManager(el);
    el.innerHTML = '<p>hello world</p>';
    const t = el.querySelector('p').firstChild;
    sm.collapse(t, 8); // inside "world"
    sm.expandToWord();
    expect(sm.getSelectedText()).toBe('world');
    cleanup(el);
  });

  it('is a no-op when the selection is already a range', () => {
    const el = makeEditor();
    const sm = new SelectionManager(el);
    el.innerHTML = '<p>hello world</p>';
    const t = el.querySelector('p').firstChild;
    setRange(t, 0, t, 5);
    sm.expandToWord();
    expect(sm.getSelectedText()).toBe('hello');
    cleanup(el);
  });
});
