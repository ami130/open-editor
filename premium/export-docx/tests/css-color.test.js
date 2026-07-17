import { describe, it, expect } from 'vitest';
import { cssColorToHex, cssBorderToOoxml, parseStyle } from '../src/css-color.js';

describe('cssColorToHex', () => {
  it('parses #rgb and #rrggbb (uppercased, no hash)', () => {
    expect(cssColorToHex('#fff')).toBe('FFFFFF');
    expect(cssColorToHex('#1e88e5')).toBe('1E88E5');
  });
  it('parses rgb()/rgba(), clamps, drops fully-transparent', () => {
    expect(cssColorToHex('rgb(255, 235, 59)')).toBe('FFEB3B');
    expect(cssColorToHex('rgba(30,136,229,0.5)')).toBe('1E88E5');
    expect(cssColorToHex('rgba(0,0,0,0)')).toBe(null); // transparent → no fill
  });
  it('parses common named colors, null for unknown/transparent', () => {
    expect(cssColorToHex('white')).toBe('FFFFFF');
    expect(cssColorToHex('red')).toBe('FF0000');
    expect(cssColorToHex('transparent')).toBe(null);
    expect(cssColorToHex('notacolor')).toBe(null);
    expect(cssColorToHex('')).toBe(null);
  });
});

describe('cssBorderToOoxml', () => {
  it('parses a shorthand into sz/val/color', () => {
    expect(cssBorderToOoxml('1px solid #000000')).toMatchObject({ val: 'single', color: '000000' });
    expect(cssBorderToOoxml('2px dotted red')).toMatchObject({ val: 'dotted', color: 'FF0000' });
  });
  it('scales width px → eighths of a point', () => {
    expect(cssBorderToOoxml('1px solid #000').sz).toBe(8);
    expect(cssBorderToOoxml('2px solid #000').sz).toBe(16);
  });
  it('returns null for none / 0 / empty', () => {
    expect(cssBorderToOoxml('none')).toBe(null);
    expect(cssBorderToOoxml('0')).toBe(null);
    expect(cssBorderToOoxml('')).toBe(null);
  });
});

describe('parseStyle', () => {
  it('splits a style attribute into a lowercase-keyed map', () => {
    expect(parseStyle('background-color: rgb(1,2,3); COLOR: #fff'))
      .toEqual({ 'background-color': 'rgb(1,2,3)', color: '#fff' });
  });
  it('tolerates junk / empty', () => {
    expect(parseStyle('')).toEqual({});
    expect(parseStyle('nocolon')).toEqual({});
    expect(parseStyle(null)).toEqual({});
  });
  it('captures CSS custom properties (e.g. --oe-table-stripe)', () => {
    expect(parseStyle('--oe-table-stripe: #eef')['--oe-table-stripe']).toBe('#eef');
  });
});
