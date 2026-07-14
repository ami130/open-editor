/**
 * find-replace.test.js — Phase 13.2: pure search core + highlight detect + plugin.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestEditor } from '../src/testing/test-harness.js';
import { findMatches, buildMatchRange, replaceMatch, replaceAll } from '../src/plugins/find-replace/search-core.js';
import { highlightSupported } from '../src/plugins/find-replace/search-highlight.js';
import { createFindReplacePlugin, findReplacePlugin } from '../src/plugins/find-replace/find-replace-plugin.js';

function frag(html) {
  const d = document.createElement('div');
  d.innerHTML = html;
  return d;
}

// ── search-core (pure) ─────────────────────────────────────────────────────────
describe('findMatches', () => {
  it('finds all case-insensitive matches per text node', () => {
    const root = frag('<p>The cat sat on the Cat mat</p>');
    const m = findMatches(root, 'cat');
    expect(m.length).toBe(2);
    expect(m[0].start).toBe(4);
  });
  it('respects caseSensitive', () => {
    const root = frag('<p>Cat cat CAT</p>');
    expect(findMatches(root, 'cat', { caseSensitive: true }).length).toBe(1);
    expect(findMatches(root, 'cat', { caseSensitive: false }).length).toBe(3);
  });
  it('finds across multiple text nodes/elements', () => {
    const root = frag('<p>foo</p><p>foo <strong>foo</strong></p>');
    expect(findMatches(root, 'foo').length).toBe(3);
  });
  it('does NOT match across element boundaries', () => {
    const root = frag('<p>fo<strong>o</strong></p>'); // "foo" split across nodes
    expect(findMatches(root, 'foo').length).toBe(0);
  });
  it('returns [] for empty query or root', () => {
    expect(findMatches(frag('<p>x</p>'), '')).toEqual([]);
    expect(findMatches(null, 'x')).toEqual([]);
  });
  it('non-overlapping matches', () => {
    const root = frag('<p>aaaa</p>');
    expect(findMatches(root, 'aa').length).toBe(2);
  });
});

// 16.7.4 — whole-word toggle.
describe('findMatches — wholeWord', () => {
  it('matches a standalone word but not as a substring of a larger word', () => {
    const root = frag('<p>a cat sat in the category</p>');
    const all = findMatches(root, 'cat');
    expect(all.length).toBe(2); // "cat" and the "cat" inside "category"
    const ww = findMatches(root, 'cat', { wholeWord: true });
    expect(ww.length).toBe(1);
    expect(ww[0].start).toBe(2); // the standalone "cat"
  });

  it('a match at the very start/end of the text node still counts (string edge = boundary)', () => {
    const root = frag('<p>cat</p>');
    expect(findMatches(root, 'cat', { wholeWord: true }).length).toBe(1);
  });

  it('punctuation counts as a word boundary', () => {
    const root = frag('<p>cat, dog. cat!</p>');
    expect(findMatches(root, 'cat', { wholeWord: true }).length).toBe(2);
  });

  it('combines with caseSensitive', () => {
    const root = frag('<p>Cat cats</p>');
    const m = findMatches(root, 'Cat', { wholeWord: true, caseSensitive: true });
    expect(m.length).toBe(1);
  });
});

describe('buildMatchRange', () => {
  it('builds a range covering the match', () => {
    const root = frag('<p>hello</p>');
    const m = findMatches(root, 'ell')[0];
    const r = buildMatchRange(m, document);
    expect(r.toString()).toBe('ell');
  });
});

describe('replaceMatch', () => {
  it('replaces one match in place, leaving surrounding text', () => {
    const root = frag('<p>the cat sat</p>');
    const m = findMatches(root, 'cat')[0];
    replaceMatch(m, 'dog');
    expect(root.textContent).toBe('the dog sat');
  });
});

describe('replaceAll', () => {
  it('replaces every occurrence and returns the count', () => {
    const root = frag('<p>a a</p><p>a</p>');
    const n = replaceAll(root, 'a', 'X');
    expect(n).toBe(3);
    expect(root.textContent).toBe('X XX');
  });
  it('is case-insensitive by default, case-sensitive when asked', () => {
    const _root = frag('<p>Cat cat</p>');
    expect(replaceAll(frag('<p>Cat cat</p>'), 'cat', 'x')).toBe(2);
    const r2 = frag('<p>Cat cat</p>');
    expect(replaceAll(r2, 'cat', 'x', { caseSensitive: true })).toBe(1);
    expect(r2.textContent).toBe('Cat x');
  });
  it('returns 0 for empty query', () => {
    expect(replaceAll(frag('<p>x</p>'), '', 'y')).toBe(0);
  });

  it('wholeWord: only replaces the standalone word, leaving substrings inside larger words untouched', () => {
    const root = frag('<p>a cat sat in the category</p>');
    const n = replaceAll(root, 'cat', 'dog', { wholeWord: true });
    expect(n).toBe(1);
    expect(root.textContent).toBe('a dog sat in the category');
  });
});

describe('findMatches — hidden content skip (audit MEDIUM)', () => {
  it('does NOT match text in display:none / hidden subtrees', () => {
    const d = frag('<p>visible foo</p><p style="display:none">hidden foo</p><p hidden>also foo</p>');
    document.body.appendChild(d);
    expect(findMatches(d, 'foo').length).toBe(1); // only the visible one
    d.remove();
  });
  it('STILL matches inside <pre>/<code> (code is legitimately searchable)', () => {
    const d = frag('<pre><code>foo bar</code></pre>');
    document.body.appendChild(d);
    expect(findMatches(d, 'foo').length).toBe(1);
    d.remove();
  });

  it('does NOT match non-editable text inside a contenteditable=false island', () => {
    const d = frag(
      '<p>visible foo</p>' +
      '<figure contenteditable="false"><span>island foo</span></figure>'
    );
    document.body.appendChild(d);
    expect(findMatches(d, 'foo').length).toBe(1); // only the visible paragraph
    d.remove();
  });

  it('STILL matches a contenteditable=true caption nested inside a false island', () => {
    const d = frag(
      '<figure contenteditable="false">' +
      '<figcaption contenteditable="true">caption foo</figcaption>' +
      '<span>island foo</span>' +
      '</figure>'
    );
    document.body.appendChild(d);
    expect(findMatches(d, 'foo').length).toBe(1); // only the caption, not the span
    d.remove();
  });
});

describe('highlightSupported', () => {
  it('is false in jsdom (no CSS Custom Highlight API) — graceful degrade', () => {
    expect(highlightSupported(window)).toBe(false);
  });
  it('detects a fake supporting window', () => {
    const fake = { CSS: { highlights: new Map() }, Highlight: function () {} };
    expect(highlightSupported(fake)).toBe(true);
  });
});

// ── plugin ─────────────────────────────────────────────────────────────────────
let editor;
beforeEach(() => { editor = createTestEditor(); });
afterEach(() => {
  if (!editor.isDestroyed()) editor.destroy();
  if (editor._target && editor._target.parentNode) editor._target.remove();
});

describe('find-replace plugin', () => {
  it('exposes contract + singleton', () => {
    const p = createFindReplacePlugin();
    expect(p.name).toBe('findReplace');
    expect(findReplacePlugin.name).toBe('findReplace');
  });

  it('Ctrl+F opens the panel (find mode); Ctrl+H opens replace mode', () => {
    const p = createFindReplacePlugin(); p.install(editor);
    expect(p.onKeyDown({ ctrlKey: true, key: 'f' })).toBe(true);
    expect(editor._wrapper.querySelector('.oe-find')).not.toBeNull();
    p._close();
    expect(p.onKeyDown({ ctrlKey: true, key: 'h' })).toBe(true);
    // replace row visible in replace mode
    const repRow = editor._wrapper.querySelector('.oe-find__row--replace');
    expect(repRow.style.display).not.toBe('none');
  });

  it('typing a query finds matches and shows the count', () => {
    const p = createFindReplacePlugin(); p.install(editor);
    editor.getEditorElement().innerHTML = '<p>cat cat cat</p>';
    p._open(false);
    p._runFind('cat');
    expect(p._matches.length).toBe(3);
    expect(p._index).toBe(0);
    expect(editor._wrapper.querySelector('.oe-find__count').textContent).toBe('1/3');
  });

  it('next/prev cycle through matches', () => {
    const p = createFindReplacePlugin(); p.install(editor);
    editor.getEditorElement().innerHTML = '<p>a a a</p>';
    p._open(false); p._runFind('a');
    p._step(1); expect(p._index).toBe(1);
    p._step(1); expect(p._index).toBe(2);
    p._step(1); expect(p._index).toBe(0); // wraps
    p._step(-1); expect(p._index).toBe(2); // wraps back
  });

  it('replace current replaces one and re-searches', () => {
    const p = createFindReplacePlugin(); p.install(editor);
    editor.getEditorElement().innerHTML = '<p>cat cat</p>';
    p._open(false); p._runFind('cat');
    p._replaceCurrent('dog');
    expect(editor.getEditorElement().textContent).toBe('dog cat');
    expect(p._matches.length).toBe(1); // one cat left
  });

  it('replace all replaces everything', () => {
    const p = createFindReplacePlugin(); p.install(editor);
    editor.getEditorElement().innerHTML = '<p>cat cat cat</p>';
    p._open(false); p._runFind('cat');
    p._replaceAll('dog');
    expect(editor.getEditorElement().textContent).toBe('dog dog dog');
    expect(p._matches.length).toBe(0);
  });

  it('replace advances past a self-matching replacement (audit MEDIUM: no infinite loop)', () => {
    const p = createFindReplacePlugin(); p.install(editor);
    editor.getEditorElement().innerHTML = '<p>a a a</p>';
    p._open(false); p._runFind('a');
    p._replaceCurrent('aa'); // replacement contains the query
    expect(p._index).toBeGreaterThan(0); // moved past the replaced spot, not stuck at 0
  });

  it('Escape/close removes the panel and clears state', () => {
    const p = createFindReplacePlugin(); p.install(editor);
    p._open(false); p._runFind('x');
    p._close();
    expect(editor._wrapper.querySelector('.oe-find')).toBeNull();
    expect(p._matches.length).toBe(0);
  });

  it('installs/uninstalls cleanly', () => {
    editor.plugins.install(createFindReplacePlugin());
    expect(editor.plugins._installed.has('findReplace')).toBe(true);
    expect(() => editor.plugins.uninstall('findReplace')).not.toThrow();
  });

  it('injects the ::highlight() CSS into the iframe document in iframe mode (audit#6)', () => {
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    editor._iframeDoc = iframe.contentDocument;
    createFindReplacePlugin().install(editor);
    // highlights register on the iframe window, so their CSS must live there
    expect(iframe.contentDocument.getElementById('oe-find-highlight-styles')).not.toBeNull();
    iframe.remove();
  });
});
