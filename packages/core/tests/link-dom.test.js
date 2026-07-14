/**
 * link-dom.test.js — Phase 10 DOM primitives.
 * Covers findLinkAt, applyLinkAttrs (rel/target/class/aria), createAnchor,
 * wrapSelectionInLink (collapsed + range), updateLink, unwrapLink.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestEditor } from '../src/testing/test-harness.js';
import {
  findLinkAt, applyLinkAttrs, createAnchor,
  wrapSelectionInLink, updateLink, unwrapLink,
} from '../src/plugins/link/link-dom.js';

let editor, root;
beforeEach(() => {
  editor = createTestEditor();
  root = editor.getEditorElement();
});
afterEach(() => {
  if (!editor.isDestroyed()) editor.destroy();
  if (editor._target && editor._target.parentNode) editor._target.remove();
});

function placeCaret(node, offset) {
  const win = editor.selection.getWindow();
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  const sel = win.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

describe('findLinkAt', () => {
  it('finds an ancestor <a>', () => {
    root.innerHTML = '<p>hi <a href="https://x.com">link</a> there</p>';
    const a = root.querySelector('a');
    expect(findLinkAt(a.firstChild, root)).toBe(a);
  });
  it('returns null when not inside a link', () => {
    root.innerHTML = '<p>plain text</p>';
    expect(findLinkAt(root.querySelector('p').firstChild, root)).toBeNull();
  });
});

describe('applyLinkAttrs', () => {
  it('sets href + title + class + aria-label', () => {
    const a = document.createElement('a');
    applyLinkAttrs(a, { href: 'https://x.com', title: 'T', className: 'btn x', ariaLabel: 'Go' });
    expect(a.getAttribute('href')).toBe('https://x.com');
    expect(a.getAttribute('title')).toBe('T');
    expect(a.getAttribute('class')).toBe('btn x');
    expect(a.getAttribute('aria-label')).toBe('Go');
  });
  it('skips an unsafe href, leaving prior href intact', () => {
    const a = document.createElement('a');
    a.setAttribute('href', 'https://safe.com');
    applyLinkAttrs(a, { href: 'javascript:alert(1)' });
    expect(a.getAttribute('href')).toBe('https://safe.com');
  });
  it('adds target=_blank and toggles nofollow in rel', () => {
    const a = document.createElement('a');
    applyLinkAttrs(a, { href: 'https://x.com', target: true, nofollow: true });
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('rel')).toContain('nofollow');
    // Toggle off
    applyLinkAttrs(a, { href: 'https://x.com', target: false, nofollow: false });
    expect(a.getAttribute('target')).toBeNull();
    expect(a.getAttribute('rel')).toBeNull();
  });
  it('ties noopener/noreferrer to target=_blank and strips them when new-tab is off (stale-rel fix)', () => {
    const a = document.createElement('a');
    // Start as a new-tab link that carries the noopener pair.
    a.setAttribute('rel', 'noopener noreferrer');
    // Uncheck "new tab" (target falsy) → the pair is now meaningless and removed.
    applyLinkAttrs(a, { href: 'https://x.com', target: false, nofollow: false });
    expect(a.getAttribute('rel')).toBeNull();
    // Turn new-tab back on → the pair returns.
    applyLinkAttrs(a, { href: 'https://x.com', target: true });
    expect(a.getAttribute('rel')).toContain('noopener');
    expect(a.getAttribute('rel')).toContain('noreferrer');
  });
  it('new-tab + nofollow together produce the full rel set', () => {
    const a = document.createElement('a');
    applyLinkAttrs(a, { href: 'https://x.com', target: true, nofollow: true });
    const rel = a.getAttribute('rel');
    expect(rel).toContain('noopener');
    expect(rel).toContain('noreferrer');
    expect(rel).toContain('nofollow');
  });
  it('applies and clears inline color', () => {
    const a = document.createElement('a');
    applyLinkAttrs(a, { href: 'https://x.com', color: '#e11d48' });
    expect(a.getAttribute('style')).toContain('color');
    expect(a.getAttribute('style')).toContain('#e11d48');
    applyLinkAttrs(a, { href: 'https://x.com', color: '' });
    expect(a.getAttribute('style')).toBeNull();
  });
  it('accepts hex, rgb, hsl, and named colors', () => {
    for (const c of ['#fff', '#ffffff', '#ffffffff', 'rgb(1,2,3)', 'rgba(1,2,3,0.5)', 'hsl(1,2%,3%)', 'red', 'rebeccapurple']) {
      const a = document.createElement('a');
      applyLinkAttrs(a, { href: 'https://x.com', color: c });
      expect(a.getAttribute('style')).toContain('color');
    }
  });
  // M2 fix — a crafted color must not smuggle extra CSS declarations.
  it('rejects a color that tries to inject a second declaration', () => {
    const a = document.createElement('a');
    applyLinkAttrs(a, { href: 'https://x.com', color: 'red;background:url(//evil.com/x)' });
    expect(a.getAttribute('style')).toBeNull();
  });
  it('rejects a color with parentheses payload outside a color function', () => {
    const a = document.createElement('a');
    applyLinkAttrs(a, { href: 'https://x.com', color: 'expression(alert(1))' });
    expect(a.getAttribute('style')).toBeNull();
  });
});

describe('createAnchor', () => {
  it('builds an <a> with text', () => {
    const a = createAnchor(document, { href: 'https://x.com' }, 'click');
    expect(a.tagName).toBe('A');
    expect(a.textContent).toBe('click');
    expect(a.getAttribute('href')).toBe('https://x.com');
  });
});

describe('wrapSelectionInLink', () => {
  it('wraps a non-collapsed selection', () => {
    root.innerHTML = '<p>hello world</p>';
    const textNode = root.querySelector('p').firstChild;
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, 5); // "hello"
    const win = editor.selection.getWindow();
    const sel = win.getSelection();
    sel.removeAllRanges(); sel.addRange(range);

    const a = wrapSelectionInLink(editor, { href: 'https://x.com' });
    expect(a).not.toBeNull();
    expect(root.querySelector('a')).not.toBeNull();
    expect(root.querySelector('a').textContent).toBe('hello');
  });
  it('inserts a new link when selection is collapsed (text falls back to href)', () => {
    root.innerHTML = '<p>x</p>';
    placeCaret(root.querySelector('p').firstChild, 1);
    const a = wrapSelectionInLink(editor, { href: 'https://x.com' });
    expect(a).not.toBeNull();
    expect(a.textContent).toBe('https://x.com');
  });
  it('uses provided display text on collapsed insert', () => {
    root.innerHTML = '<p>x</p>';
    placeCaret(root.querySelector('p').firstChild, 1);
    const a = wrapSelectionInLink(editor, { href: 'https://x.com' }, 'My Site');
    expect(a.textContent).toBe('My Site');
  });
  it('returns null for an unsafe href', () => {
    root.innerHTML = '<p>x</p>';
    placeCaret(root.querySelector('p').firstChild, 1);
    expect(wrapSelectionInLink(editor, { href: 'javascript:alert(1)' })).toBeNull();
  });

  // Block-wrap fix: a selection spanning whole block(s) must produce a VALID
  // <p><a>…</a></p> (never <a><p>…</p></a>, which the sanitizer would unwrap).
  it('select-all of one block → <a> INSIDE the block (valid inline nesting)', () => {
    root.innerHTML = '<p>hello world</p>';
    editor.selection.selectAll();
    wrapSelectionInLink(editor, { href: 'https://example.com' });
    expect(root.innerHTML).toBe('<p><a href="https://example.com">hello world</a></p>');
  });
  it('select-all across multiple blocks → one <a> inside each block', () => {
    root.innerHTML = '<p>one</p><p>two</p>';
    editor.selection.selectAll();
    wrapSelectionInLink(editor, { href: 'https://x.com' });
    expect(root.querySelectorAll('p > a').length).toBe(2);
    expect(root.querySelector('a')).not.toBeNull();
    // No anchor may directly contain a block element.
    expect(root.querySelector('a p')).toBeNull();
  });
});

describe('updateLink', () => {
  it('updates href and text', () => {
    root.innerHTML = '<p><a href="https://old.com">old</a></p>';
    const a = root.querySelector('a');
    updateLink(a, { href: 'https://new.com' }, 'new');
    expect(a.getAttribute('href')).toBe('https://new.com');
    expect(a.textContent).toBe('new');
  });
  it('preserves text when newText not provided', () => {
    root.innerHTML = '<p><a href="https://old.com">keep</a></p>';
    const a = root.querySelector('a');
    updateLink(a, { href: 'https://new.com' });
    expect(a.textContent).toBe('keep');
  });
});

describe('unwrapLink', () => {
  it('removes the <a> but keeps its text', () => {
    root.innerHTML = '<p>a <a href="https://x.com">link</a> b</p>';
    const a = root.querySelector('a');
    unwrapLink(editor, a);
    expect(root.querySelector('a')).toBeNull();
    expect(root.querySelector('p').textContent).toBe('a link b');
  });
});
