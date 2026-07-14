/**
 * emoji-plugin.test.js — Phase 13.4: emoji dataset + plugin (reuses char-grid).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestEditor } from '../src/testing/test-harness.js';
import { resolveEmojis, DEFAULT_EMOJIS, EMOJI_CATEGORIES } from '../src/plugins/emoji/emoji-data.js';
import { createEmojiPlugin, emojiPlugin } from '../src/plugins/emoji/emoji-plugin.js';

describe('emoji-data', () => {
  it('has a non-trivial default set with categories + keywords', () => {
    expect(DEFAULT_EMOJIS.length).toBeGreaterThan(30);
    expect(EMOJI_CATEGORIES.length).toBeGreaterThanOrEqual(6);
    // every emoji has a category matching a defined tab
    const catIds = new Set(EMOJI_CATEGORIES.map((c) => c.id));
    for (const e of DEFAULT_EMOJIS) expect(catIds.has(e.cat)).toBe(true);
  });
  it('resolveEmojis falls back to the default set', () => {
    expect(resolveEmojis(null)).toBe(DEFAULT_EMOJIS);
    expect(resolveEmojis([])).toBe(DEFAULT_EMOJIS);
  });
  it('resolveEmojis wraps plain strings', () => {
    expect(resolveEmojis(['🎉'])).toEqual([{ ch: '🎉', label: '🎉', cat: 'symbols' }]);
  });
});

let editor;
beforeEach(() => { editor = createTestEditor(); });
afterEach(() => {
  if (!editor.isDestroyed()) editor.destroy();
  if (editor._target && editor._target.parentNode) editor._target.remove();
});

describe('createEmojiPlugin', () => {
  it('exposes the plugin contract + singleton', () => {
    const p = createEmojiPlugin();
    expect(p.name).toBe('emoji');
    expect(typeof p.getToolbarButtons).toBe('function');
    expect(emojiPlugin.name).toBe('emoji');
  });

  it('contributes a button', () => {
    const b = createEmojiPlugin().getToolbarButtons()[0];
    expect(b.name).toBe('emoji');
    expect(typeof b.onClick).toBe('function');
  });

  it('installs and uninstalls cleanly', () => {
    editor.plugins.install(createEmojiPlugin());
    expect(editor.plugins._installed.has('emoji')).toBe(true);
    expect(() => editor.plugins.uninstall('emoji')).not.toThrow();
  });

  it('the grid renders category tabs', async () => {
    const p = createEmojiPlugin();
    p.install(editor);
    editor.getEditorElement().innerHTML = '<p>x</p>';
    const tn = editor.getEditorElement().querySelector('p').firstChild;
    const r = document.createRange(); r.setStart(tn, 1); r.collapse(true);
    const s = editor.selection.getWindow().getSelection(); s.removeAllRanges(); s.addRange(r);
    const openP = p._open();
    await new Promise((res) => setTimeout(res, 0));
    expect(document.querySelectorAll('.oe-chargrid__tab').length).toBe(EMOJI_CATEGORIES.length);
    // pick the first visible emoji
    const cell = document.querySelector('.oe-chargrid__cell');
    expect(cell).toBeTruthy();
    const emoji = cell.textContent;
    cell.click();
    await openP;
    expect(editor.getEditorElement().textContent).toContain(emoji);
  });

  it('search across categories finds by keyword', async () => {
    const p = createEmojiPlugin();
    p.install(editor);
    editor.getEditorElement().innerHTML = '<p>x</p>';
    p._open();
    await new Promise((res) => setTimeout(res, 0));
    const input = document.querySelector('.oe-chargrid__search');
    input.value = 'love'; input.dispatchEvent(new Event('input'));
    // 'love' matches heart-eyes + red heart across categories
    const cells = document.querySelectorAll('.oe-chargrid__cell');
    expect(cells.length).toBeGreaterThanOrEqual(1);
    // close the modal to clean up
    editor.ui.modal.close(null);
  });
});
