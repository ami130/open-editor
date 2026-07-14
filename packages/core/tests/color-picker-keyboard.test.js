/**
 * 14.4 — the color picker must be keyboard-operable. Previously the panel's
 * keydown handler (arrow-nav / Enter-apply / Esc-close) was dead code because
 * opening never moved focus into the panel and the trigger had no keyboard-open.
 * These tests lock in: ArrowDown on the trigger opens + focuses the panel,
 * arrow keys move between swatches, Escape closes and returns focus.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createColorControl } from '../src/ui/toolbar/color-picker.js';
import { navigateSwatchGrid, sliderKeyDelta } from '../src/ui/toolbar/color-picker-keys.js';

function stubEditor() {
  return {
    getEditorElement: () => document.createElement('div'),
    selection: { save: () => ({}), restore: () => {}, get: () => null },
    commands: { get: () => ({ getValue: () => '' }), isActive: () => false, execute: () => {} },
  };
}
function key(el, k) {
  const e = new window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
  el.dispatchEvent(e);
  return e;
}

let host, control;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); });
afterEach(() => { if (control && control.destroy) control.destroy(); host.remove(); });

describe('color picker keyboard access (14.4)', () => {
  it('ArrowDown on the trigger opens the panel and focuses the first swatch', () => {
    control = createColorControl(stubEditor(), { command: 'textColor', name: 'textColor' }, 'en', document, { savedBookmark: null });
    host.appendChild(control.el);
    const trigger = control.getTrigger();
    const panel = control.el.querySelector('.oe-cp') || document.body.querySelector('.oe-cp');
    expect(panel.hidden).toBe(true);
    key(trigger, 'ArrowDown');
    const openPanel = document.body.querySelector('.oe-cp');
    expect(openPanel.hidden).toBe(false);
    const firstSwatch = openPanel.querySelector('.oe-tb__swatch');
    expect(document.activeElement).toBe(firstSwatch);
  });

  it('Escape in the panel closes it and returns focus to the trigger', () => {
    control = createColorControl(stubEditor(), { command: 'textColor', name: 'textColor' }, 'en', document, { savedBookmark: null });
    host.appendChild(control.el);
    const trigger = control.getTrigger();
    key(trigger, 'ArrowDown');
    const panel = document.body.querySelector('.oe-cp');
    expect(panel.hidden).toBe(false);
    key(panel, 'Escape');
    // close() reparents the panel back into the control wrap and hides it.
    expect(panel.hidden).toBe(true);
    expect(control.el.contains(panel)).toBe(true);
    expect(document.activeElement).toBe(trigger);
  });

  it('mouse open does NOT steal focus into the panel', () => {
    control = createColorControl(stubEditor(), { command: 'textColor', name: 'textColor' }, 'en', document, { savedBookmark: null });
    host.appendChild(control.el);
    const trigger = control.getTrigger();
    trigger.click(); // mouse-style open
    const panel = document.body.querySelector('.oe-cp');
    expect(panel.hidden).toBe(false);
    // focus stays where it was (not on a swatch)
    expect(panel.contains(document.activeElement)).toBe(false);
  });
});

describe('navigateSwatchGrid (14.4 helper)', () => {
  function makeSwatches(n) {
    return Array.from({ length: n }, () => {
      const b = document.createElement('button');
      document.body.appendChild(b);
      return b;
    });
  }
  function ev(k) { return new window.KeyboardEvent('keydown', { key: k, cancelable: true }); }

  it('ArrowRight moves to the next swatch (wraps at end)', () => {
    const sw = makeSwatches(10);
    expect(navigateSwatchGrid(ev('ArrowRight'), sw, sw[0])).toBe(true);
    expect(document.activeElement).toBe(sw[1]);
    navigateSwatchGrid(ev('ArrowRight'), sw, sw[9]);
    expect(document.activeElement).toBe(sw[0]); // wrapped
    sw.forEach((b) => b.remove());
  });

  it('ArrowDown moves one 8-column row down, clamped to the last swatch', () => {
    const sw = makeSwatches(20);
    navigateSwatchGrid(ev('ArrowDown'), sw, sw[0]);
    expect(document.activeElement).toBe(sw[8]);
    navigateSwatchGrid(ev('ArrowDown'), sw, sw[18]); // 18+8=26 → clamp to 19
    expect(document.activeElement).toBe(sw[19]);
    sw.forEach((b) => b.remove());
  });

  it('returns false for a non-arrow key or an unknown active element', () => {
    const sw = makeSwatches(3);
    expect(navigateSwatchGrid(ev('a'), sw, sw[0])).toBe(false);
    expect(navigateSwatchGrid(ev('ArrowRight'), sw, document.body)).toBe(false);
    sw.forEach((b) => b.remove());
  });
});

describe('slider keyboard control (14.4 F2)', () => {
  function ev(key, shift) { return { key, shiftKey: !!shift, preventDefault() {} }; }

  it('hue arrows step ±1 and wrap around 360', () => {
    expect(sliderKeyDelta(ev('ArrowRight'), 'hue', { h: 10, s: 1, v: 1 }, 100).hsv.h).toBe(11);
    expect(sliderKeyDelta(ev('ArrowRight', true), 'hue', { h: 355, s: 1, v: 1 }, 100).hsv.h).toBe(5);
    expect(sliderKeyDelta(ev('ArrowLeft'), 'hue', { h: 0, s: 1, v: 1 }, 100).hsv.h).toBe(359);
  });

  it('sv plane maps Left/Right→saturation, Up/Down→value', () => {
    expect(sliderKeyDelta(ev('ArrowRight'), 'sv', { h: 0, s: 0.5, v: 0.5 }, 100).hsv.s).toBeCloseTo(0.51);
    expect(sliderKeyDelta(ev('ArrowUp'), 'sv', { h: 0, s: 0.5, v: 0.5 }, 100).hsv.v).toBeCloseTo(0.51);
  });

  it('alpha clamps to 0..100', () => {
    expect(sliderKeyDelta(ev('ArrowUp'), 'alpha', { h: 0, s: 1, v: 1 }, 100).alpha).toBe(100);
    expect(sliderKeyDelta(ev('ArrowDown'), 'alpha', { h: 0, s: 1, v: 1 }, 0).alpha).toBe(0);
  });

  it('non-arrow keys return null', () => {
    expect(sliderKeyDelta(ev('Enter'), 'hue', { h: 0, s: 1, v: 1 }, 100)).toBeNull();
    expect(sliderKeyDelta(ev('a'), 'sv', { h: 0, s: 1, v: 1 }, 100)).toBeNull();
  });
});

describe('slider ARIA + focusability (14.4 F2/F3)', () => {
  function makeCtl() {
    const ed = {
      getEditorElement: () => document.createElement('div'),
      selection: { save: () => ({}), restore: () => {}, get: () => null },
      commands: { get: () => ({ getValue: () => '' }), isActive: () => false, execute: () => {} },
    };
    return createColorControl(ed, { command: 'textColor', name: 'textColor' }, 'en', document, { savedBookmark: null });
  }

  it('the three sliders are role=slider, tabindex -1 at rest, 0 when the panel opens', () => {
    const c = makeCtl();
    host.appendChild(c.el);
    const grad = c.el.querySelector('.oe-cp__grad-wrap');
    const wraps = Array.from(c.el.querySelectorAll('.oe-cp__slider-wrap'));
    const all = [grad, ...wraps];
    // role=slider always; tabindex -1 at rest (no stray toolbar tab stops).
    all.forEach((w) => {
      expect(w.getAttribute('role')).toBe('slider');
      expect(w.getAttribute('tabindex')).toBe('-1');
    });
    // Opening the panel promotes them to 0.
    key(c.getTrigger(), 'ArrowDown');
    all.forEach((w) => expect(w.getAttribute('tabindex')).toBe('0'));
    c.destroy();
  });
});
