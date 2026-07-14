/**
 * image-properties.test.js — Phase 9.1 applyImageProps (pure apply logic).
 */
import { describe, it, expect } from 'vitest';
import { applyImageProps } from '../src/plugins/image/image-properties.js';

function makeFigure() {
  const fig = document.createElement('figure');
  fig.className = 'oe-figure';
  const img = document.createElement('img');
  img.setAttribute('src', 'https://x.com/a.png');
  fig.appendChild(img);
  return fig;
}

describe('applyImageProps', () => {
  it('updates src/alt/title on the img', () => {
    const fig = makeFigure();
    applyImageProps(fig, { src: 'https://x.com/b.png', alt: 'new', title: 'T' });
    const img = fig.querySelector('img');
    expect(img.getAttribute('src')).toBe('https://x.com/b.png');
    expect(img.getAttribute('alt')).toBe('new');
    expect(img.getAttribute('title')).toBe('T');
  });

  it('leaves src unchanged when the new src is blocked', () => {
    const fig = makeFigure();
    applyImageProps(fig, { src: 'javascript:alert(1)' });
    expect(fig.querySelector('img').getAttribute('src')).toBe('https://x.com/a.png');
  });

  it('writes width/height to style AND attribute', () => {
    const fig = makeFigure();
    applyImageProps(fig, { width: '300', height: '150' });
    const img = fig.querySelector('img');
    expect(img.style.width).toBe('300px');
    expect(img.style.height).toBe('150px');
    expect(img.getAttribute('width')).toBe('300');
    expect(img.getAttribute('height')).toBe('150');
  });

  it('clears width/height when empty', () => {
    const fig = makeFigure();
    applyImageProps(fig, { width: '300' });
    applyImageProps(fig, { width: '' });
    const img = fig.querySelector('img');
    expect(img.style.width).toBe('');
    expect(img.getAttribute('width')).toBeNull();
  });

  it('applies border-radius and margins to the img style', () => {
    const fig = makeFigure();
    applyImageProps(fig, {
      borderRadius: '8',
      margins: { top: '4', right: '6', bottom: '4', left: '6' },
    });
    const img = fig.querySelector('img');
    expect(img.style.borderRadius).toBe('8px');
    expect(img.style.marginTop).toBe('4px');
    expect(img.style.marginRight).toBe('6px');
  });

  it('applies alignment to the figure (not the img)', () => {
    const fig = makeFigure();
    applyImageProps(fig, { alignment: 'center' });
    expect(fig.classList.contains('oe-figure--center')).toBe(true);
  });

  it('is a no-op for a figure with no img', () => {
    const fig = document.createElement('figure');
    expect(() => applyImageProps(fig, { alt: 'x' })).not.toThrow();
  });

  // 9.2 — Advanced: id / class / inline style.
  it('applies id and class to the img (not the figure)', () => {
    const fig = makeFigure();
    applyImageProps(fig, { id: 'hero', className: 'rounded' });
    const img = fig.querySelector('img');
    expect(img.getAttribute('id')).toBe('hero');
    expect(img.getAttribute('class')).toBe('rounded');
    // figure keeps its own class untouched
    expect(fig.getAttribute('class')).toBe('oe-figure');
  });

  it('author inline style is preserved but managed props still win', () => {
    const fig = makeFigure();
    applyImageProps(fig, { style: 'box-shadow: 0 2px 6px #0003', width: '300', borderRadius: '8' });
    const img = fig.querySelector('img');
    expect(img.style.boxShadow).not.toBe('');       // author style applied (value preserved)
    expect(img.style.width).toBe('300px');          // managed prop applied
    expect(img.style.borderRadius).toBe('8px');
  });

  it('clearing id/class removes the attributes', () => {
    const fig = makeFigure();
    applyImageProps(fig, { id: 'x', className: 'y' });
    applyImageProps(fig, { id: '', className: '' });
    const img = fig.querySelector('img');
    expect(img.getAttribute('id')).toBeNull();
    expect(img.getAttribute('class')).toBeNull();
  });
});
