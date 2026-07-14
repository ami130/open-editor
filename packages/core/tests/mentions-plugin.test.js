/**
 * mentions-plugin.test.js — Phase 16.6.3, end-to-end against a real
 * OpenEditor + async config.mentions.source provider.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createTestEditor } from '../src/testing/test-harness.js';
import { createMentionsPlugin } from '../src/plugins/mentions/mentions-plugin.js';

let editor;
afterEach(() => {
  vi.useRealTimers();
  if (editor && !editor.isDestroyed()) editor.destroy();
  if (editor && editor._target && editor._target.parentNode) editor._target.remove();
});

function setCaretAtEnd(textNode) {
  const range = document.createRange();
  range.setStart(textNode, textNode.nodeValue.length);
  range.collapse(true);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

function fireInput(el) {
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

const USERS = [{ id: 1, label: 'alice' }, { id: 2, label: 'alan' }, { id: 3, label: 'bob' }];
const source = vi.fn((q) => Promise.resolve(USERS.filter((u) => u.label.includes(q))));

describe('mentions plugin', () => {
  it('opens the popup (empty) immediately on "@", before the async source resolves', () => {
    vi.useFakeTimers();
    editor = createTestEditor({ mentions: { source } });
    editor.plugins.install(createMentionsPlugin());
    const p = editor.getEditorElement().querySelector('p');
    p.textContent = '@';
    setCaretAtEnd(p.firstChild);
    fireInput(editor.getEditorElement());

    const popup = document.querySelector('.oe-caret-popup');
    expect(popup).not.toBeNull();
    expect(popup.hidden).toBe(false);
  });

  it('fetches and shows matching users after the debounce settles', async () => {
    vi.useFakeTimers();
    editor = createTestEditor({ mentions: { source } });
    editor.plugins.install(createMentionsPlugin());
    const p = editor.getEditorElement().querySelector('p');
    p.textContent = '@al';
    setCaretAtEnd(p.firstChild);
    fireInput(editor.getEditorElement());

    await vi.advanceTimersByTimeAsync(200);
    const options = document.querySelectorAll('.oe-caret-popup__option');
    expect(options.length).toBe(2); // alice, alan
    expect([...options].map((o) => o.textContent)).toEqual(['@alice', '@alan']);
  });

  it('picking a user inserts a non-editable mention node with the right data-id', async () => {
    vi.useFakeTimers();
    editor = createTestEditor({ mentions: { source } });
    editor.plugins.install(createMentionsPlugin());
    const p = editor.getEditorElement().querySelector('p');
    p.textContent = '@al';
    setCaretAtEnd(p.firstChild);
    fireInput(editor.getEditorElement());
    await vi.advanceTimersByTimeAsync(200);

    document.querySelector('.oe-caret-popup__option').dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const mention = editor.getEditorElement().querySelector('[data-oe-mention]');
    expect(mention).not.toBeNull();
    expect(mention.getAttribute('contenteditable')).toBe('false');
    expect(mention.getAttribute('data-id')).toBe('1');
    expect(mention.textContent).toBe('@alice');
    // The mention node is the ONLY text content — the typed "@al" query text
    // is gone (not left dangling alongside the inserted mention).
    expect(editor.getEditorElement().textContent).toBe('@alice');
  });

  it('does NOT trigger for an email-like "user@host" pattern', () => {
    vi.useFakeTimers();
    editor = createTestEditor({ mentions: { source } });
    editor.plugins.install(createMentionsPlugin());
    const p = editor.getEditorElement().querySelector('p');
    p.textContent = 'user@host';
    setCaretAtEnd(p.firstChild);
    fireInput(editor.getEditorElement());

    const popup = document.querySelector('.oe-caret-popup');
    expect(popup === null || popup.hidden).toBe(true);
  });

  it('closes when whitespace follows the "@"', () => {
    vi.useFakeTimers();
    editor = createTestEditor({ mentions: { source } });
    editor.plugins.install(createMentionsPlugin());
    const p = editor.getEditorElement().querySelector('p');
    p.textContent = '@a';
    setCaretAtEnd(p.firstChild);
    fireInput(editor.getEditorElement());
    expect(document.querySelector('.oe-caret-popup').hidden).toBe(false);

    p.textContent = '@a ';
    setCaretAtEnd(p.firstChild);
    fireInput(editor.getEditorElement());
    expect(document.querySelector('.oe-caret-popup').hidden).toBe(true);
  });

  it('with no config.mentions, the popup opens empty and never calls a source', async () => {
    vi.useFakeTimers();
    editor = createTestEditor(); // no mentions config at all
    editor.plugins.install(createMentionsPlugin());
    const p = editor.getEditorElement().querySelector('p');
    p.textContent = '@x';
    setCaretAtEnd(p.firstChild);
    fireInput(editor.getEditorElement());
    await vi.advanceTimersByTimeAsync(200);

    expect(document.querySelectorAll('.oe-caret-popup__option').length).toBe(0);
    expect(document.querySelector('.oe-caret-popup__empty')).not.toBeNull();
  });

  it('a later query supersedes an in-flight earlier one (no stale overwrite)', async () => {
    vi.useFakeTimers();
    let resolveFirst;
    const slowSource = vi.fn((q) => {
      if (q === 'a') return new Promise((r) => { resolveFirst = r; });
      return Promise.resolve(USERS.filter((u) => u.label.includes(q)));
    });
    editor = createTestEditor({ mentions: { source: slowSource } });
    editor.plugins.install(createMentionsPlugin());
    const p = editor.getEditorElement().querySelector('p');

    p.textContent = '@a';
    setCaretAtEnd(p.firstChild);
    fireInput(editor.getEditorElement());
    await vi.advanceTimersByTimeAsync(200); // first debounce fires, source('a') is now in-flight

    p.textContent = '@bob';
    setCaretAtEnd(p.firstChild);
    fireInput(editor.getEditorElement());
    await vi.advanceTimersByTimeAsync(200); // second debounce fires + resolves synchronously

    // Now resolve the FIRST (stale) promise late — it must NOT clobber the popup.
    resolveFirst(USERS); // all 3 users — would be wrong if applied
    await Promise.resolve(); await Promise.resolve();

    const options = document.querySelectorAll('.oe-caret-popup__option');
    expect(options.length).toBe(1);
    expect(options[0].textContent).toBe('@bob');
  });

  it('destroy() removes the popup and cancels any pending debounce', () => {
    vi.useFakeTimers();
    editor = createTestEditor({ mentions: { source } });
    const plugin = createMentionsPlugin();
    editor.plugins.install(plugin);
    const p = editor.getEditorElement().querySelector('p');
    p.textContent = '@a';
    setCaretAtEnd(p.firstChild);
    fireInput(editor.getEditorElement());

    editor.plugins.uninstall('mentions');
    expect(document.querySelector('.oe-caret-popup')).toBeNull();
    expect(() => vi.advanceTimersByTime(500)).not.toThrow();
  });
});
