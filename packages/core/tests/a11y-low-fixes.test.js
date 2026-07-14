/**
 * LOW-severity accessibility fixes from the Phase 14 deep audit:
 *  - find/replace icon buttons have aria-label; case-toggle exposes aria-pressed
 *  - color swatches use role=option in a role=listbox (was invalid menuitem/dialog)
 *  - modal hides background siblings from the a11y tree while open, restores on close
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildSearchPanel } from '../src/plugins/find-replace/search-panel.js';
import { buildPickerPanel } from '../src/ui/toolbar/color-picker-dom.js';
import { ModalManager } from '../src/ui/modal-manager.js';

describe('find/replace button labels (LOW-a)', () => {
  it('icon buttons expose aria-label and the case toggle exposes aria-pressed', () => {
    const { node: root } = buildSearchPanel(document, {});
    const byLabel = (l) => root.querySelector(`[aria-label="${l}"]`);
    expect(byLabel('Previous match')).not.toBeNull();
    expect(byLabel('Next match')).not.toBeNull();
    expect(byLabel('Close find')).not.toBeNull();
    const caseBtn = byLabel('Match case');
    expect(caseBtn).not.toBeNull();
    expect(caseBtn.getAttribute('aria-pressed')).toBe('false');
    caseBtn.click();
    expect(caseBtn.getAttribute('aria-pressed')).toBe('true');
    expect(root.getAttribute('aria-label')).toBe('Find and replace');
  });
});

describe('color swatch roles (LOW-d)', () => {
  it('swatches are role=option inside a role=listbox (not menuitem/dialog)', () => {
    const dom = buildPickerPanel(document);
    const grid = dom.panel.querySelector('.oe-tb__color-grid');
    expect(grid.getAttribute('role')).toBe('listbox');
    const sw = grid.querySelector('.oe-tb__swatch');
    expect(sw.getAttribute('role')).toBe('option');
    expect(sw.getAttribute('role')).not.toBe('menuitem');
    expect(sw.getAttribute('aria-label')).toMatch(/^#|rgb/i);
  });
});

describe('modal background inert for SR (LOW-b)', () => {
  let wrapper, mgr, bg;
  beforeEach(() => {
    wrapper = document.createElement('div');
    document.body.appendChild(wrapper);
    bg = document.createElement('div'); // simulates toolbar/editor behind the modal
    bg.className = 'oe-editor';
    wrapper.appendChild(bg);
    mgr = new ModalManager(wrapper, document);
  });
  afterEach(() => { mgr.destroy(); if (wrapper.parentNode) wrapper.remove(); });

  it('hides background siblings while open and restores on close', () => {
    expect(bg.getAttribute('aria-hidden')).toBeNull();
    const p = mgr.open({ title: 'X' });
    expect(bg.getAttribute('aria-hidden')).toBe('true'); // hidden while open
    mgr.close(null);
    return p.then(() => {
      expect(bg.getAttribute('aria-hidden')).toBeNull(); // restored on close
    });
  });
});
