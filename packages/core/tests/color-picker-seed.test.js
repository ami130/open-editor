import { describe, it, expect } from 'vitest';
import { parseCssColor } from '../src/ui/toolbar/color-picker-parse.js';
import { findColorAtSelection } from '../src/ui/toolbar/color-picker-seed.js';
import { OpenEditor } from '../src/editor.js';

describe('parseCssColor — C2: understands every CSS color form', () => {
  it('parses 6-digit hex', () => {
    expect(parseCssColor('#ff8800')).toEqual({ hex: '#ff8800', alpha: 1 });
  });
  it('parses 3-digit hex', () => {
    expect(parseCssColor('#f80')).toEqual({ hex: '#ff8800', alpha: 1 });
  });
  it('parses 8-digit hex with alpha', () => {
    const r = parseCssColor('#ff880080');
    expect(r.hex).toBe('#ff8800');
    expect(r.alpha).toBeCloseTo(0.5, 1);
  });
  it('parses rgb()', () => {
    expect(parseCssColor('rgb(255, 136, 0)')).toEqual({ hex: '#ff8800', alpha: 1 });
  });
  it('parses rgba() and keeps alpha', () => {
    expect(parseCssColor('rgba(255, 136, 0, 0.5)')).toEqual({ hex: '#ff8800', alpha: 0.5 });
  });
  it('parses named colors', () => {
    expect(parseCssColor('red')).toEqual({ hex: '#ff0000', alpha: 1 });
    expect(parseCssColor('RebeccaPurple')).toEqual({ hex: '#663399', alpha: 1 });
    expect(parseCssColor('  Blue  ')).toEqual({ hex: '#0000ff', alpha: 1 });
  });
  it('parses hsl() and hsla()', () => {
    // hsl(0,100%,50%) === pure red
    expect(parseCssColor('hsl(0, 100%, 50%)')).toEqual({ hex: '#ff0000', alpha: 1 });
    const teal = parseCssColor('hsl(180, 100%, 25%)');
    expect(teal.hex).toBe('#008080');
    const a = parseCssColor('hsla(0, 100%, 50%, 0.25)');
    expect(a.hex).toBe('#ff0000');
    expect(a.alpha).toBeCloseTo(0.25, 2);
  });
  it('treats transparent as alpha 0', () => {
    expect(parseCssColor('transparent')).toEqual({ hex: '#000000', alpha: 0 });
  });
  it('returns null for garbage / unknown names', () => {
    expect(parseCssColor('not-a-color')).toBeNull();
    expect(parseCssColor('')).toBeNull();
    expect(parseCssColor(null)).toBeNull();
  });
});

describe('findColorAtSelection — seeds from a NAMED color on an ancestor', () => {
  it('reads style="color: red" (was a no-op → picker opened at default)', () => {
    const target = document.createElement('div');
    document.body.appendChild(target);
    const editor = new OpenEditor(target);
    editor.getEditorElement().innerHTML = '<p><span style="color: red">hi</span></p>';
    const span = editor.getEditorElement().querySelector('span');
    const r = document.createRange(); r.setStart(span.firstChild, 1); r.collapse(true);
    window.getSelection().removeAllRanges(); window.getSelection().addRange(r);
    const seed = findColorAtSelection(editor, 'textColor');
    expect(seed).toEqual({ hex: '#ff0000', alpha: 1 });
    editor.destroy(); target.remove();
  });
});
