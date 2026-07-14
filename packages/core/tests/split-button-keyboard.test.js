/**
 * MEDIUM (audit) — split-button chevrons must be keyboard-reachable.
 *
 * In the toolbar's roving-tabindex model only the main button is a Tab stop;
 * the chevron is not. The WAI-ARIA menu-button pattern requires ArrowDown on
 * the main button (or Enter/Space/ArrowDown on the chevron) to open the panel
 * and move focus into the first option. Before the fix the alignment/list-style
 * options were completely unreachable without a mouse.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createAlignmentControl } from '../src/ui/toolbar/alignment-picker.js';
import { createListStyleControl } from '../src/ui/toolbar/list-style-picker.js';

function makeEditorStub() {
  return {
    commands: { isActive: () => false, execute: () => {} },
    selection: { save: () => null, restore: () => {} },
  };
}
function fireKey(el, key, opts = {}) {
  const e = new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts });
  el.dispatchEvent(e);
  return e;
}

let host;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); });
afterEach(() => { host.remove(); });

describe('alignment split button — keyboard access', () => {
  it('ArrowDown on the main button opens the panel and focuses the first option', () => {
    const control = createAlignmentControl(makeEditorStub(), { name: 'align' }, 'en', document, { savedBookmark: null });
    host.appendChild(control.el);
    const mainBtn = control.el.querySelector('.oe-tb__alignsplit-main');
    const panel   = control.el.querySelector('.oe-tb__alignsplit-panel');
    expect(panel.hidden).toBe(true);

    const ev = fireKey(mainBtn, 'ArrowDown');
    expect(ev.defaultPrevented).toBe(true);
    expect(panel.hidden).toBe(false);
    const firstOpt = panel.querySelector('.oe-tb__alignsplit-opt');
    expect(document.activeElement).toBe(firstOpt);
    control.destroy();
  });

  it('Enter on the chevron opens the panel', () => {
    const control = createAlignmentControl(makeEditorStub(), { name: 'align' }, 'en', document, { savedBookmark: null });
    host.appendChild(control.el);
    const arrow = control.el.querySelector('.oe-tb__alignsplit-arrow');
    const panel = control.el.querySelector('.oe-tb__alignsplit-panel');
    fireKey(arrow, 'Enter');
    expect(panel.hidden).toBe(false);
    control.destroy();
  });

  it('Escape on the chevron closes an open panel', () => {
    const control = createAlignmentControl(makeEditorStub(), { name: 'align' }, 'en', document, { savedBookmark: null });
    host.appendChild(control.el);
    const arrow = control.el.querySelector('.oe-tb__alignsplit-arrow');
    const panel = control.el.querySelector('.oe-tb__alignsplit-panel');
    fireKey(arrow, 'ArrowDown');
    expect(panel.hidden).toBe(false);
    fireKey(arrow, 'Escape');
    expect(panel.hidden).toBe(true);
    control.destroy();
  });
});

describe('list-style split button — keyboard access', () => {
  it('ArrowDown on the main button opens the panel and focuses the first option', () => {
    const control = createListStyleControl(makeEditorStub(), { name: 'ul', listTag: 'ul', icon: 'ul' }, 'en', document, { savedBookmark: null });
    host.appendChild(control.el);
    const mainBtn = control.el.querySelector('.oe-tb__listsplit-main');
    const panel   = control.el.querySelector('.oe-tb__dd-panel');
    expect(panel.hidden).toBe(true);
    const ev = fireKey(mainBtn, 'ArrowDown');
    expect(ev.defaultPrevented).toBe(true);
    expect(panel.hidden).toBe(false);
    const firstOpt = panel.querySelector('button');
    expect(document.activeElement).toBe(firstOpt);
    control.destroy();
  });

  it('Space on the chevron opens the panel', () => {
    const control = createListStyleControl(makeEditorStub(), { name: 'ol', listTag: 'ol', icon: 'ol' }, 'en', document, { savedBookmark: null });
    host.appendChild(control.el);
    const arrow = control.el.querySelector('.oe-tb__listsplit-arrow');
    const panel = control.el.querySelector('.oe-tb__dd-panel');
    fireKey(arrow, ' ');
    expect(panel.hidden).toBe(false);
    control.destroy();
  });
});
