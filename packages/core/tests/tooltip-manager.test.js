import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TooltipManager } from '../src/ui/tooltip-manager.js';

function makeWrapper(doc) {
  const w = doc.createElement('div');
  w.style.cssText = 'position:relative;width:600px;height:400px;';
  doc.body.appendChild(w);
  return w;
}

describe('TooltipManager', () => {
  let wrapper, mgr;

  beforeEach(() => {
    wrapper = makeWrapper(document);
    mgr = new TooltipManager(wrapper, document);
  });

  afterEach(() => {
    mgr.destroy();
    if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
  });

  // 6.5 — show() mounts tooltip in wrapper
  it('show() renders tooltip inside wrapper', () => {
    const btn = document.createElement('button');
    wrapper.appendChild(btn);
    mgr.show(btn, 'Bold');
    expect(wrapper.querySelector('.oe-tooltip')).toBeTruthy();
    expect(wrapper.querySelector('.oe-tooltip').textContent).toBe('Bold');
  });

  // 6.5 — hide() removes tooltip
  it('hide() removes tooltip from DOM', () => {
    const btn = document.createElement('button');
    wrapper.appendChild(btn);
    mgr.show(btn, 'Italic');
    mgr.hide();
    expect(wrapper.querySelector('.oe-tooltip')).toBeNull();
  });

  // 6.5 — show() replaces previous tooltip (only one at a time)
  it('show() replaces previous tooltip', () => {
    const btn = document.createElement('button');
    wrapper.appendChild(btn);
    mgr.show(btn, 'First');
    mgr.show(btn, 'Second');
    const tips = wrapper.querySelectorAll('.oe-tooltip');
    expect(tips.length).toBe(1);
    expect(tips[0].textContent).toBe('Second');
  });

  // 6.9 — ARIA: role="tooltip" + aria-describedby on target
  it('tooltip has role="tooltip"', () => {
    const btn = document.createElement('button');
    wrapper.appendChild(btn);
    mgr.show(btn, 'tip text');
    const tip = wrapper.querySelector('.oe-tooltip');
    expect(tip.getAttribute('role')).toBe('tooltip');
  });

  it('sets aria-describedby on target element', () => {
    const btn = document.createElement('button');
    wrapper.appendChild(btn);
    mgr.show(btn, 'tip text');
    const tip = wrapper.querySelector('.oe-tooltip');
    expect(btn.getAttribute('aria-describedby')).toBe(tip.id);
  });

  it('hide() removes aria-describedby from target', () => {
    const btn = document.createElement('button');
    wrapper.appendChild(btn);
    mgr.show(btn, 'tip text');
    mgr.hide();
    expect(btn.getAttribute('aria-describedby')).toBeNull();
  });

  // 6.8 — scoped to wrapper
  it('tooltip is inside wrapper, not document.body', () => {
    const btn = document.createElement('button');
    wrapper.appendChild(btn);
    mgr.show(btn, 'scoped');
    expect(document.body.querySelector(':scope > .oe-tooltip')).toBeNull();
    expect(wrapper.querySelector('.oe-tooltip')).toBeTruthy();
  });

  // 6.5 — placement class added
  it('tooltip gets a placement class', () => {
    const btn = document.createElement('button');
    wrapper.appendChild(btn);
    mgr.show(btn, 'text');
    const tip = wrapper.querySelector('.oe-tooltip');
    const hasPlacement = ['above','below','left','right'].some(
      (p) => tip.classList.contains(`oe-tooltip--${p}`)
    );
    expect(hasPlacement).toBe(true);
  });

  // show() with missing target is a no-op
  it('show() with null target is a no-op', () => {
    expect(() => mgr.show(null, 'text')).not.toThrow();
    expect(wrapper.querySelector('.oe-tooltip')).toBeNull();
  });

  // destroy cleans up
  it('destroy() removes tooltip and cleans up', () => {
    const btn = document.createElement('button');
    wrapper.appendChild(btn);
    mgr.show(btn, 'text');
    mgr.destroy();
    expect(wrapper.querySelector('.oe-tooltip')).toBeNull();
  });
});
