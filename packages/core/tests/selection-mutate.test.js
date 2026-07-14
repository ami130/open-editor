import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SelectionManager } from '../src/selection/selection-manager.js';
import { getPath, resolvePath, saveBookmark, restoreBookmark } from '../src/selection/selection-path.js';

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

// ─── 3.7 — insertAtCursor() ──────────────────────────────────────────────────

describe('3.7 — insertAtCursor()', () => {
  let el, sm;
  beforeEach(() => {
    el = makeEditor();
    sm = new SelectionManager(el);
  });
  afterEach(() => {
    window.getSelection().removeAllRanges();
    cleanup(el);
  });

  it('inserts HTML string at cursor position', () => {
    setEditorHTML(el, '<p>hello</p>');
    const textNode = el.querySelector('p').firstChild;
    setCursor(textNode, 5);
    sm.insertAtCursor(' <strong>world</strong>');
    expect(el.innerHTML.toLowerCase()).toContain('strong');
    expect(el.textContent).toContain('world');
  });

  it('inserts a DOM node at cursor', () => {
    setEditorHTML(el, '<p>hello</p>');
    const textNode = el.querySelector('p').firstChild;
    setCursor(textNode, 5);
    const em = document.createElement('em');
    em.textContent = '!';
    sm.insertAtCursor(em);
    expect(el.querySelector('em')).not.toBeNull();
    expect(el.textContent).toContain('!');
  });

  it('replaces selected content when selection is non-collapsed', () => {
    setEditorHTML(el, '<p>hello world</p>');
    const textNode = el.querySelector('p').firstChild;
    setRange(textNode, 0, textNode, 5);
    sm.insertAtCursor('bye');
    expect(el.textContent).not.toContain('hello');
    expect(el.textContent).toContain('bye');
  });

  it('is a no-op when _editorEl is null', () => {
    sm.update(null, null);
    expect(() => sm.insertAtCursor('<p>test</p>')).not.toThrow();
  });

  it('is a no-op when there is no selection', () => {
    window.getSelection().removeAllRanges();
    expect(() => sm.insertAtCursor('<p>test</p>')).not.toThrow();
  });

  it('does not throw and collapses cursor when HTML string is empty (T1)', () => {
    setEditorHTML(el, '<p>hello</p>');
    const textNode = el.querySelector('p').firstChild;
    setCursor(textNode, 2);
    expect(() => sm.insertAtCursor('')).not.toThrow();
    const sel = window.getSelection();
    expect(sel.rangeCount).toBeGreaterThan(0);
    expect(sel.getRangeAt(0).collapsed).toBe(true);
  });

  it('does not throw and collapses cursor when HTML string is whitespace-only (T1)', () => {
    setEditorHTML(el, '<p>hello</p>');
    const textNode = el.querySelector('p').firstChild;
    setCursor(textNode, 2);
    expect(() => sm.insertAtCursor('   ')).not.toThrow();
    const sel = window.getSelection();
    expect(sel.rangeCount).toBeGreaterThan(0);
    expect(sel.getRangeAt(0).collapsed).toBe(true);
  });

  // REGRESSION: clicking into an empty editor places the caret with the <br>
  // placeholder itself as the range's startContainer (a real browser quirk,
  // not simulated by jsdom's setCursor helper — reproduced here by pointing
  // the range directly at the <br>). insertNode() at such a range used to
  // attach the new node AS A CHILD of <br> — invalid, invisible, dropped by
  // serialization. Caught live via Playwright on the media-embed feature.
  it('inserting an inline node when the caret sits on a placeholder <br> does not nest inside it', () => {
    setEditorHTML(el, '<p><br></p>');
    const br = el.querySelector('br');
    setCursor(br, 0);
    const em = document.createElement('em');
    em.textContent = 'x';
    sm.insertAtCursor(em);
    expect(br.contains(em)).toBe(false);
    expect(el.querySelector('em')).not.toBeNull();
  });

  it('inserting an HTML string when the caret sits on a placeholder <br> does not nest inside it', () => {
    setEditorHTML(el, '<p><br></p>');
    const br = el.querySelector('br');
    setCursor(br, 0);
    sm.insertAtCursor('hi');
    expect(br.childNodes.length).toBe(0); // never became a (invalid) child of <br>
    expect(el.textContent).toBe('hi');
  });

  // REGRESSION: a block-level node (figure/pre/table/etc.) inserted while the
  // caret's block ancestor is a plain empty <p> must land as a SIBLING of
  // that <p> (replacing it), never as an invalid child — the browser silently
  // "repairs" <figure> nested in <p> by splitting it into scattered fragments.
  it('inserting a block-level node into an empty paragraph replaces the paragraph instead of nesting inside it', () => {
    setEditorHTML(el, '<p><br></p>');
    const p = el.querySelector('p');
    setCursor(p, 0);
    const fig = document.createElement('figure');
    fig.textContent = 'embed';
    sm.insertAtCursor(fig);
    expect(el.contains(p)).toBe(false);
    expect(el.firstElementChild.tagName).toBe('FIGURE');
  });

  it('inserting a block-level node with text already in the paragraph inserts it as a sibling, preserving the text', () => {
    setEditorHTML(el, '<p>hello world</p>');
    const textNode = el.querySelector('p').firstChild;
    setCursor(textNode, textNode.length);
    const fig = document.createElement('figure');
    fig.textContent = 'embed';
    sm.insertAtCursor(fig);
    expect(el.querySelector('p').textContent).toBe('hello world');
    expect(el.querySelector('figure')).not.toBeNull();
    expect(el.querySelector('p').nextElementSibling.tagName).toBe('FIGURE');
  });
});

// ─── selectAll() ─────────────────────────────────────────────────────────────

describe('selectAll()', () => {
  let el, sm;
  beforeEach(() => {
    el = makeEditor();
    sm = new SelectionManager(el);
  });
  afterEach(() => {
    window.getSelection().removeAllRanges();
    cleanup(el);
  });

  it('selects all content inside the editor', () => {
    setEditorHTML(el, '<p>hello world</p>');
    sm.selectAll();
    const sel = window.getSelection();
    expect(sel.rangeCount).toBeGreaterThan(0);
    expect(sel.toString()).toContain('hello world');
  });

  it('is a no-op when _editorEl is null', () => {
    sm.update(null, null);
    expect(() => sm.selectAll()).not.toThrow();
  });
});

// ─── Internal path helpers (now pure functions in selection-path.js) ──────────

describe('selection-path getPath / resolvePath round-trip', () => {
  it('getPath + resolvePath round-trips to the same text node', () => {
    const el = makeEditor();
    el.innerHTML = '<p><strong>bold</strong></p>';
    const textNode = el.querySelector('strong').firstChild;
    const path = getPath(el, textNode);
    expect(Array.isArray(path)).toBe(true);
    expect(path.length).toBeGreaterThan(0);
    const resolved = resolvePath(el, path);
    expect(resolved).toBe(textNode);
    cleanup(el);
  });

  it('resolvePath returns null for an out-of-bounds index', () => {
    const el = makeEditor();
    el.innerHTML = '<p>hello</p>';
    // index 99 doesn't exist
    expect(resolvePath(el, [99])).toBeNull();
    cleanup(el);
  });

  it('getPath returns null for a node outside the editor', () => {
    const el = makeEditor();
    const outside = document.createElement('p');
    outside.textContent = 'out';
    document.body.appendChild(outside);
    expect(getPath(el, outside.firstChild)).toBeNull();
    document.body.removeChild(outside);
    cleanup(el);
  });
});

// ─── H4: bookmark survives sibling index shifts via live node ref ─────────────

describe('bookmark node-identity (H4)', () => {
  function bmInfo(range, collapsed) {
    return { range, collapsed };
  }

  it('restores to the correct node after a PRECEDING sibling is inserted', () => {
    const el = makeEditor();
    el.innerHTML = '<p>first</p><p>second</p>';
    const secondText = el.querySelectorAll('p')[1].firstChild;
    const range = document.createRange();
    range.setStart(secondText, 3); // caret inside "second"
    range.collapse(true);
    const bm = saveBookmark(el, bmInfo(range, true));

    // A command inserts a NEW paragraph at the FRONT — this shifts every
    // index-path by one. The pure-path bookmark would now resolve [1] to the
    // NEW middle paragraph, landing the caret in the wrong block.
    const inserted = document.createElement('p');
    inserted.textContent = 'inserted';
    el.insertBefore(inserted, el.firstChild);

    restoreBookmark(window, document, el, bm);
    const sel = window.getSelection();
    // Caret must be back inside the ORIGINAL "second" text node, offset 3.
    expect(sel.anchorNode).toBe(secondText);
    expect(sel.anchorOffset).toBe(3);
    cleanup(el);
  });

  it('falls back to the index path when the live node was removed', () => {
    const el = makeEditor();
    el.innerHTML = '<p>only</p>';
    const p = el.querySelector('p');
    const range = document.createRange();
    range.setStart(p.firstChild, 2);
    range.collapse(true);
    const bm = saveBookmark(el, bmInfo(range, true));

    // Replace the text node with a fresh one at the SAME position — the live
    // ref is now detached, but the index path [0,0] still resolves.
    p.textContent = 'only'; // replaces the text node
    expect(() => restoreBookmark(window, document, el, bm)).not.toThrow();
    const sel = window.getSelection();
    expect(el.contains(sel.anchorNode)).toBe(true);
    cleanup(el);
  });

  it('restores a non-collapsed range to the original nodes after a shift', () => {
    const el = makeEditor();
    el.innerHTML = '<p>alpha</p><p>beta</p>';
    const alpha = el.querySelectorAll('p')[0].firstChild;
    const beta = el.querySelectorAll('p')[1].firstChild;
    const range = document.createRange();
    range.setStart(alpha, 1);
    range.setEnd(beta, 2);
    const bm = saveBookmark(el, bmInfo(range, false));

    const inserted = document.createElement('p');
    inserted.textContent = 'x';
    el.insertBefore(inserted, el.firstChild);

    restoreBookmark(window, document, el, bm);
    const sel = window.getSelection();
    const restored = sel.getRangeAt(0);
    expect(restored.startContainer).toBe(alpha);
    expect(restored.startOffset).toBe(1);
    expect(restored.endContainer).toBe(beta);
    expect(restored.endOffset).toBe(2);
    cleanup(el);
  });
});

// ─── update() + destroy guard ────────────────────────────────────────────────

describe('SelectionManager.update() / destroyed state', () => {
  it('update(null, null) makes all methods return null/empty without throwing', () => {
    const el = makeEditor();
    const sm = new SelectionManager(el);
    sm.update(null, null);
    expect(sm.get()).toBeNull();
    expect(sm.save()).toBeNull();
    expect(() => sm.restore({ startPath: [], startOffset: 0, endPath: [], endOffset: 0, collapsed: true })).not.toThrow();
    expect(sm.getSelectedHTML()).toBe('');
    expect(sm.getSelectedText()).toBe('');
    expect(() => sm.insertAtCursor('x')).not.toThrow();
    expect(() => sm.selectAll()).not.toThrow();
    expect(() => sm.set(null, 0)).not.toThrow();
    expect(() => sm.collapse(null, 0)).not.toThrow();
    expect(sm.isInsideEditor()).toBe(false);
    expect(() => sm.expandToWord()).not.toThrow();
    cleanup(el);
  });
});
