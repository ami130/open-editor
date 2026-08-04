/**
 * image-resize-anchor.test.js — pure-function unit tests for the resize anchor
 * math (issue #2) and the frame target (issue #1). The rendered behaviour is
 * proven in the playground e2e image-frame-anchor.test.js; these lock the logic.
 */
import { describe, it, expect } from 'vitest';
import {
  targetOf, anchorFlags, applyAnchorTransform, commitAnchor,
} from '../src/plugins/image/image-resize-anchor.js';

function makeFigure({ withPicture = false } = {}) {
  const fig = document.createElement('figure');
  const img = document.createElement('img');
  if (withPicture) {
    const pic = document.createElement('picture');
    pic.appendChild(img);
    fig.appendChild(pic);
  } else {
    fig.appendChild(img);
  }
  const cap = document.createElement('figcaption');
  fig.appendChild(cap);
  return { fig, img };
}

describe('targetOf (issue #1 — hug the image, not the figure)', () => {
  it('returns the <img> for a plain figure (not the figure itself)', () => {
    const { fig, img } = makeFigure();
    expect(targetOf(fig)).toBe(img);
  });
  it('prefers <picture> when present (responsive image)', () => {
    const { fig } = makeFigure({ withPicture: true });
    expect(targetOf(fig).tagName).toBe('PICTURE');
  });
  it('is null-safe', () => {
    expect(targetOf(null)).toBeNull();
  });
});

describe('anchorFlags', () => {
  it('west/left handles anchor X', () => {
    for (const p of ['nw', 'sw', 'w']) expect(anchorFlags(p).anchorX).toBe(true);
  });
  it('north/top handles anchor Y', () => {
    for (const p of ['nw', 'ne', 'n']) expect(anchorFlags(p).anchorY).toBe(true);
  });
  it('east / south / se do not anchor', () => {
    for (const p of ['e', 's', 'se']) {
      expect(anchorFlags(p).anchorX).toBe(false);
      expect(anchorFlags(p).anchorY).toBe(false);
    }
  });
});

describe('applyAnchorTransform (issue #2 — grabbed edge tracks cursor)', () => {
  it('translates the image LEFT by the growth for a west drag WITH room', () => {
    const { img } = makeFigure();
    const drag = { anchorX: true, anchorY: false, startW: 100, startH: 80, maxLeftGrow: 500 };
    applyAnchorTransform(img, drag, { width: 160, height: 128 });
    expect(img.style.transform).toBe('translate(-60px, 0px)');   // grew 60 → shifted -60
  });

  it('CLAMPS the left translate to the available room (no overshoot)', () => {
    const { img } = makeFigure();
    const drag = { anchorX: true, anchorY: false, startW: 100, startH: 80, maxLeftGrow: 20 };
    applyAnchorTransform(img, drag, { width: 200, height: 160 });  // wants -100
    expect(img.style.transform).toBe('translate(-20px, 0px)');     // capped at room=20
  });

  it('flush-left (room 0) applies no horizontal shift → grows right', () => {
    const { img } = makeFigure();
    const drag = { anchorX: true, anchorY: false, startW: 100, startH: 80, maxLeftGrow: 0 };
    applyAnchorTransform(img, drag, { width: 180, height: 144 });
    expect(img.style.transform).toBe('');
  });

  it('is a no-op for a non-anchored (east/se) handle', () => {
    const { img } = makeFigure();
    const drag = { anchorX: false, anchorY: false, startW: 100, startH: 80, maxLeftGrow: 0 };
    applyAnchorTransform(img, drag, { width: 180, height: 144 });
    expect(img.style.transform).toBe('');
  });
});

describe('commitAnchor (bake to margin-left, no snap)', () => {
  it('clears the transient transform', () => {
    const { img } = makeFigure();
    img.style.transform = 'translate(-30px, 0px)';
    commitAnchor(img, { anchorX: true, startW: 100, startMarginLeft: 40, maxLeftGrow: 500 }, 130);
    expect(img.style.transform).toBe('');
  });
  it('reduces margin-left by the clamped left shift, floored at 0', () => {
    const { img } = makeFigure();
    // startMargin 40, grew 30 with room → margin 40-30 = 10.
    commitAnchor(img, { anchorX: true, startW: 100, startMarginLeft: 40, maxLeftGrow: 500 }, 130);
    expect(img.style.marginLeft).toBe('10px');
  });
  it('never writes a negative margin (flush-left stays flush)', () => {
    const { img } = makeFigure();
    commitAnchor(img, { anchorX: true, startW: 100, startMarginLeft: 0, maxLeftGrow: 0 }, 200);
    expect(img.style.marginLeft).toBe('');   // max(0, 0 - 0) = 0 → cleared
  });
});
