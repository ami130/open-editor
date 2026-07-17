/**
 * showUpgradeNotice — the 19.3 degrade surface: one aggregated, dismissible,
 * non-blocking notice per editor.
 */
import { describe, it, expect } from 'vitest';
import { showUpgradeNotice, resetUpgradeNotice } from '../src/upgrade-notice.js';

function makeEditor() {
  const editor = { _wrapper: document.createElement('div') };
  document.body.appendChild(editor._wrapper);
  return editor;
}

describe('showUpgradeNotice', () => {
  it('renders one notice listing the feature title', () => {
    const editor = makeEditor();
    showUpgradeNotice(editor, { featureId: 'export.pdf', title: 'Export to PDF', reason: 'no-license' });
    const el = editor._wrapper.querySelector('[data-oe-premium-notice]');
    expect(el).not.toBeNull();
    expect(el.textContent).toContain('Export to PDF');
    expect(el.getAttribute('role')).toBe('status'); // polite, non-blocking
  });

  it('AGGREGATES multiple denials into the single existing notice', () => {
    const editor = makeEditor();
    showUpgradeNotice(editor, { featureId: 'export.pdf', title: 'Export to PDF' });
    showUpgradeNotice(editor, { featureId: 'comments', title: 'Comments' });
    showUpgradeNotice(editor, { featureId: 'comments', title: 'Comments' }); // duplicate — no double listing
    const all = editor._wrapper.querySelectorAll('[data-oe-premium-notice]');
    expect(all.length).toBe(1);
    expect(all[0].querySelector('.oe-premium-notice__features').textContent)
      .toBe('Export to PDF, Comments');
  });

  it('dismiss removes the notice AND keeps later denials quiet for this editor', () => {
    const editor = makeEditor();
    showUpgradeNotice(editor, { featureId: 'export.pdf', title: 'Export to PDF' });
    editor._wrapper.querySelector('.oe-premium-notice__dismiss').click();
    expect(editor._wrapper.querySelector('[data-oe-premium-notice]')).toBeNull();
    showUpgradeNotice(editor, { featureId: 'comments', title: 'Comments' });
    expect(editor._wrapper.querySelector('[data-oe-premium-notice]')).toBeNull();
  });

  it('two editors keep independent notices and dismissal state', () => {
    const a = makeEditor();
    const b = makeEditor();
    showUpgradeNotice(a, { featureId: 'export.pdf', title: 'Export to PDF' });
    showUpgradeNotice(b, { featureId: 'comments', title: 'Comments' });
    a._wrapper.querySelector('.oe-premium-notice__dismiss').click();
    expect(a._wrapper.querySelector('[data-oe-premium-notice]')).toBeNull();
    expect(b._wrapper.querySelector('[data-oe-premium-notice]')).not.toBeNull();
  });

  it('injects its stylesheet once per document', () => {
    showUpgradeNotice(makeEditor(), { featureId: 'export.pdf', title: 'A' });
    showUpgradeNotice(makeEditor(), { featureId: 'comments', title: 'B' });
    expect(document.querySelectorAll('#oe-premium-notice-styles').length).toBe(1);
  });

  it('resetUpgradeNotice clears element, aggregate, AND dismissed state (re-license flow)', () => {
    const editor = makeEditor();
    showUpgradeNotice(editor, { featureId: 'export.pdf', title: 'Export to PDF' });
    editor._wrapper.querySelector('.oe-premium-notice__dismiss').click(); // user dismissed
    resetUpgradeNotice(editor);
    // after a re-license, a NEW denial reports freshly — old titles gone, not muted
    showUpgradeNotice(editor, { featureId: 'comments', title: 'Comments' });
    const el = editor._wrapper.querySelector('[data-oe-premium-notice]');
    expect(el).not.toBeNull();
    expect(el.querySelector('.oe-premium-notice__features').textContent).toBe('Comments');
    expect(() => resetUpgradeNotice(null)).not.toThrow();
  });

  it('an editor without a wrapper is a safe no-op', () => {
    expect(() => showUpgradeNotice({}, { featureId: 'x', title: 'X' })).not.toThrow();
    expect(() => showUpgradeNotice(null, { featureId: 'x' })).not.toThrow();
  });
});
