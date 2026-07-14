/**
 * special-chars.test.js — Phase 13.3: char grid builder + dataset + plugin.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestEditor } from '../src/testing/test-harness.js';
import { buildCharGrid } from '../src/plugins/chars/char-grid.js';
import { resolveSpecialChars, DEFAULT_SPECIAL_CHARS } from '../src/plugins/chars/char-data.js';
import { createSpecialCharsPlugin, specialCharsPlugin } from '../src/plugins/chars/special-chars-plugin.js';

// ── char-data ────────────────────────────────────────────────────────────────
describe('resolveSpecialChars', () => {
  it('returns the built-in set when config is null/empty', () => {
    expect(resolveSpecialChars(null)).toBe(DEFAULT_SPECIAL_CHARS);
    expect(resolveSpecialChars([])).toBe(DEFAULT_SPECIAL_CHARS);
  });
  it('wraps a plain string array into {ch,label}', () => {
    const out = resolveSpecialChars(['@', '#']);
    expect(out).toEqual([{ ch: '@', label: '@' }, { ch: '#', label: '#' }]);
  });
  it('passes rich entries through with the same shape', () => {
    const rich = [{ ch: '@', label: 'At sign' }];
    expect(resolveSpecialChars(rich)).toEqual(rich);
  });
  it('the default set contains recognizable characters', () => {
    const chars = DEFAULT_SPECIAL_CHARS.map((c) => c.ch);
    expect(chars).toContain(String.fromCharCode(0x20AC)); // euro
    expect(chars).toContain(String.fromCharCode(0x00D7)); // times
    expect(DEFAULT_SPECIAL_CHARS.length).toBeGreaterThan(50);
  });
});

// ── buildCharGrid (pure) ──────────────────────────────────────────────────────
describe('buildCharGrid', () => {
  const items = [
    { ch: '@', label: 'At sign', keywords: ['email'] },
    { ch: '#', label: 'Hash' },
    { ch: '$', label: 'Dollar', cat: 'money' },
  ];

  it('renders a cell per item', () => {
    const { node } = buildCharGrid(document, items, () => {});
    expect(node.querySelectorAll('.oe-chargrid__cell').length).toBe(3);
  });

  it('clicking a cell calls onPick with the char', () => {
    let picked = null;
    const { node } = buildCharGrid(document, items, (ch) => { picked = ch; });
    node.querySelectorAll('.oe-chargrid__cell')[0].click();
    expect(picked).toBe('@');
  });

  it('search filters by label, char, and keywords', () => {
    const { node } = buildCharGrid(document, items, () => {});
    const input = node.querySelector('.oe-chargrid__search');
    input.value = 'email'; input.dispatchEvent(new Event('input')); // keyword match
    let cells = node.querySelectorAll('.oe-chargrid__cell');
    expect(cells.length).toBe(1);
    expect(cells[0].textContent).toBe('@');

    input.value = 'hash'; input.dispatchEvent(new Event('input')); // label match
    cells = node.querySelectorAll('.oe-chargrid__cell');
    expect(cells.length).toBe(1);
    expect(cells[0].textContent).toBe('#');
  });

  it('shows an empty message when nothing matches', () => {
    const { node } = buildCharGrid(document, items, () => {});
    const input = node.querySelector('.oe-chargrid__search');
    input.value = 'zzzz'; input.dispatchEvent(new Event('input'));
    expect(node.querySelector('.oe-chargrid__empty')).not.toBeNull();
  });

  it('can hide the search input', () => {
    const { node } = buildCharGrid(document, items, () => {}, { search: false });
    expect(node.querySelector('.oe-chargrid__search')).toBeNull();
  });

  it('renders category tabs when configured', () => {
    const { node } = buildCharGrid(document, items, () => {}, {
      categories: [{ id: 'money', label: 'Money' }, { id: 'other', label: 'Other' }],
    });
    expect(node.querySelectorAll('.oe-chargrid__tab').length).toBe(2);
  });
});

// ── plugin ─────────────────────────────────────────────────────────────────────
let editor;
beforeEach(() => { editor = createTestEditor(); });
afterEach(() => {
  if (!editor.isDestroyed()) editor.destroy();
  if (editor._target && editor._target.parentNode) editor._target.remove();
});

describe('createSpecialCharsPlugin', () => {
  it('exposes the plugin contract + singleton', () => {
    const p = createSpecialCharsPlugin();
    expect(p.name).toBe('specialChars');
    expect(typeof p.getToolbarButtons).toBe('function');
    expect(specialCharsPlugin.name).toBe('specialChars');
  });

  it('contributes a button', () => {
    const b = createSpecialCharsPlugin().getToolbarButtons()[0];
    expect(b.name).toBe('specialChars');
    expect(typeof b.onClick).toBe('function');
  });

  it('installs and uninstalls cleanly via PluginManager', () => {
    editor.plugins.install(createSpecialCharsPlugin());
    expect(editor.plugins._installed.has('specialChars')).toBe(true);
    expect(() => editor.plugins.uninstall('specialChars')).not.toThrow();
  });

  it('inserts the picked character at the caret', async () => {
    const p = createSpecialCharsPlugin();
    p.install(editor);
    editor.getEditorElement().innerHTML = '<p>ab</p>';
    const textNode = editor.getEditorElement().querySelector('p').firstChild;
    const r = document.createRange(); r.setStart(textNode, 2); r.collapse(true);
    const s = editor.selection.getWindow().getSelection(); s.removeAllRanges(); s.addRange(r);

    const openPromise = p._open();
    // grid was rendered into the modal — click the euro cell
    await new Promise((res) => setTimeout(res, 0));
    const euro = String.fromCharCode(0x20AC);
    const cells = Array.from(document.querySelectorAll('.oe-chargrid__cell'));
    const euroCell = cells.find((c) => c.textContent === euro);
    expect(euroCell).toBeTruthy();
    euroCell.click();
    await openPromise;

    expect(editor.getEditorElement().textContent).toContain(euro);
  });
});
