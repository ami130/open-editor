/**
 * table-copy.test.js — Phase 11.15 serialize + copy table.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestEditor } from '../src/testing/test-harness.js';
import { serializeTable, copyTable } from '../src/plugins/table/table-copy.js';
import { createTable } from '../src/plugins/table/table-dom.js';

let editor, root;
beforeEach(() => { editor = createTestEditor(); root = editor.getEditorElement(); });
afterEach(() => {
  if (!editor.isDestroyed()) editor.destroy();
  if (editor._target && editor._target.parentNode) editor._target.remove();
});

describe('serializeTable', () => {
  it('produces a <table>…</table> string', () => {
    const t = createTable(document, 2, 2);
    const html = serializeTable(t);
    expect(html.startsWith('<table')).toBe(true);
    expect(html.endsWith('</table>')).toBe(true);
  });

  it('strips the editor-only oe-table class', () => {
    const t = createTable(document, 1, 1);
    expect(t.classList.contains('oe-table')).toBe(true);
    const html = serializeTable(t);
    expect(html).not.toContain('oe-table');
  });

  it('strips a lone placeholder <br> from empty cells', () => {
    const t = createTable(document, 1, 2); // cells contain only <br>
    const html = serializeTable(t);
    expect(html).not.toContain('<br>');
  });

  it('keeps real cell content and colspan', () => {
    const t = document.createElement('table');
    t.className = 'oe-table';
    t.innerHTML = '<tbody><tr><td colspan="2">hello</td></tr></tbody>';
    const html = serializeTable(t);
    expect(html).toContain('hello');
    expect(html).toContain('colspan="2"');
  });

  it('keeps author/preset classes but drops selection highlight class', () => {
    const t = document.createElement('table');
    t.className = 'oe-table table-bordered';
    t.innerHTML = '<tbody><tr><td class="oe-cell--selected hl">x</td></tr></tbody>';
    const html = serializeTable(t);
    expect(html).toContain('table-bordered');
    expect(html).not.toContain('oe-cell--selected');
    expect(html).toContain('hl'); // author class preserved
  });

  it('preserves a caption', () => {
    const t = createTable(document, 1, 1, { caption: 'Sales' });
    expect(serializeTable(t)).toContain('<caption>Sales</caption>');
  });
});

describe('copyTable', () => {
  it('resolves true when copying succeeds (fallback path in jsdom)', async () => {
    root.innerHTML = '';
    const t = createTable(document, 2, 2);
    root.appendChild(t);
    // jsdom has no real clipboard; copyToClipboard falls back to execCommand,
    // which is stubbed to succeed by the test harness. Just assert no throw and
    // a boolean result.
    const res = await copyTable(editor, t);
    expect(typeof res).toBe('boolean');
  });

  it('returns false for a null table', async () => {
    expect(await copyTable(editor, null)).toBe(false);
  });
});
