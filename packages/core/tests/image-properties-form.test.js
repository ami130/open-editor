/**
 * image-properties-form.test.js — Phase 9.1 pure form builder.
 * Verifies pre-fill from an existing figure, read() output, aspect-lock
 * linking, and margin "same on all sides" behavior.
 */
import { describe, it, expect } from 'vitest';
import { buildImagePropsForm } from '../src/plugins/image/image-properties-form.js';

function makeFigure(imgAttrs = {}, imgStyle = '', figureClass = 'oe-figure') {
  const fig = document.createElement('figure');
  fig.className = figureClass;
  const img = document.createElement('img');
  for (const [k, v] of Object.entries(imgAttrs)) img.setAttribute(k, v);
  if (imgStyle) img.setAttribute('style', imgStyle);
  fig.appendChild(img);
  return fig;
}

describe('buildImagePropsForm — pre-fill', () => {
  it('pre-fills src/alt/title from the img', () => {
    const fig = makeFigure({ src: 'https://x.com/a.png', alt: 'cat', title: 'A cat' });
    const { form } = buildImagePropsForm(document, fig);
    expect(form.querySelector('#oe-imgp-src').value).toBe('https://x.com/a.png');
    expect(form.querySelector('#oe-imgp-alt').value).toBe('cat');
    expect(form.querySelector('#oe-imgp-title').value).toBe('A cat');
  });

  it('pre-fills width/height from style then attribute', () => {
    const fig = makeFigure({ width: '200', height: '100' }, 'width: 220px; height: 110px;');
    const { form } = buildImagePropsForm(document, fig);
    expect(form.querySelector('#oe-imgp-w').value).toBe('220'); // style wins
    expect(form.querySelector('#oe-imgp-h').value).toBe('110');
  });

  it('pre-fills border-radius and margins from style', () => {
    const fig = makeFigure({}, 'border-radius: 8px; margin-top: 4px; margin-left: 6px;');
    const { form } = buildImagePropsForm(document, fig);
    expect(form.querySelector('#oe-imgp-radius').value).toBe('8');
    expect(form.querySelector('#oe-imgp-mt').value).toBe('4');
    expect(form.querySelector('#oe-imgp-ml').value).toBe('6');
  });

  it('pre-selects the figure alignment', () => {
    const fig = makeFigure({}, '', 'oe-figure oe-figure--center');
    const { read } = buildImagePropsForm(document, fig);
    expect(read().alignment).toBe('center');
  });
});

describe('buildImagePropsForm — read + interactions', () => {
  it('read() returns the full shape', () => {
    const fig = makeFigure({ src: 'https://x.com/a.png' });
    const { form, read } = buildImagePropsForm(document, fig);
    form.querySelector('#oe-imgp-alt').value = 'desc';
    form.querySelector('#oe-imgp-w').value = '300';
    form.querySelector('#oe-imgp-h').value = '150';
    form.querySelector('#oe-imgp-radius').value = '5';
    const v = read();
    expect(v).toMatchObject({
      src: 'https://x.com/a.png', alt: 'desc', width: '300', height: '150',
      borderRadius: '5', lockAspect: true,
    });
    expect(v.margins).toEqual({ top: '', right: '', bottom: '', left: '' });
  });

  it('aspect lock links width→height', () => {
    const fig = makeFigure({}, 'width: 200px; height: 100px;'); // ratio 2:1
    const { form } = buildImagePropsForm(document, fig);
    const inW = form.querySelector('#oe-imgp-w');
    inW.value = '400';
    inW.dispatchEvent(new Event('input', { bubbles: true }));
    expect(form.querySelector('#oe-imgp-h').value).toBe('200'); // kept 2:1
  });

  it('unlocking aspect stops linking', () => {
    const fig = makeFigure({}, 'width: 200px; height: 100px;');
    const { form } = buildImagePropsForm(document, fig);
    form.querySelector('#oe-imgp-lock').checked = false;
    const inW = form.querySelector('#oe-imgp-w');
    inW.value = '400';
    inW.dispatchEvent(new Event('input', { bubbles: true }));
    expect(form.querySelector('#oe-imgp-h').value).toBe('100'); // unchanged
  });

  it('margin "same on all sides" applies Top to all in read()', () => {
    const fig = makeFigure();
    const { form, read } = buildImagePropsForm(document, fig);
    form.querySelector('#oe-imgp-mlock').checked = true;
    const mt = form.querySelector('#oe-imgp-mt');
    mt.value = '12';
    mt.dispatchEvent(new Event('input', { bubbles: true }));
    expect(read().margins).toEqual({ top: '12', right: '12', bottom: '12', left: '12' });
  });
});

describe('buildImagePropsForm — Advanced fields (9.2)', () => {
  it('pre-fills class/id and reads them', () => {
    const fig = makeFigure({ id: 'hero', class: 'rounded shadow' });
    const { form, read } = buildImagePropsForm(document, fig);
    expect(form.querySelector('#oe-imgp-id').value).toBe('hero');
    expect(form.querySelector('#oe-imgp-class').value).toBe('rounded shadow');
    const v = read();
    expect(v.id).toBe('hero');
    expect(v.className).toBe('rounded shadow');
  });

  it('inline-style field shows only author styles, not managed props', () => {
    const fig = makeFigure({}, 'width: 200px; box-shadow: 0 2px 6px #0003; margin-top: 4px;');
    const { form } = buildImagePropsForm(document, fig);
    const styleVal = form.querySelector('#oe-imgp-style').value;
    expect(styleVal).toContain('box-shadow');
    expect(styleVal).not.toContain('width');
    expect(styleVal).not.toContain('margin-top');
  });

  it('shows a decorative-alt hint when alt is empty, clears it when filled (9.5)', () => {
    const fig = makeFigure();
    const { form } = buildImagePropsForm(document, fig);
    const hint = form.querySelector('#oe-imgp-alt-hint');
    expect(hint.textContent).toContain('decorative');
    const alt = form.querySelector('#oe-imgp-alt');
    alt.value = 'a cat';
    alt.dispatchEvent(new Event('input', { bubbles: true }));
    expect(hint.textContent).toBe('');
  });

  it('renders a class <select> when availableClasses provided, pre-selecting current', () => {
    const fig = makeFigure({ class: 'featured' });
    const { form, read } = buildImagePropsForm(document, fig, [
      { value: 'featured', label: 'Featured' },
      { value: 'thumb', label: 'Thumbnail' },
    ]);
    const sel = form.querySelector('#oe-imgp-class-sel');
    expect(sel).not.toBeNull();
    expect(sel.querySelector('option[value="featured"]').selected).toBe(true);
    expect(read().className).toBe('featured');
  });
});
