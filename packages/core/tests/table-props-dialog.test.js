/**
 * table-props-dialog.test.js — 16.7.5: pure border-value composition used by
 * the Table/Cell properties dialogs. The full dialog flow (modal Promise +
 * form → op) is verified end-to-end in the Playwright suite; this locks in
 * the composeBorder value logic that turns width/style/color fields into a
 * real CSS border shorthand (replacing the old hardcoded '1px solid #334155').
 */
import { describe, it, expect } from 'vitest';
import { composeBorder } from '../src/plugins/table/table-props-dialog.js';

describe('composeBorder', () => {
  it('composes width + style + color into a shorthand', () => {
    expect(composeBorder(2, 'dashed', '#ff0000')).toBe('2px dashed #ff0000');
    expect(composeBorder(1, 'solid', '#334155')).toBe('1px solid #334155');
  });

  it('treats a bare numeric width as px, and passes an explicit unit through', () => {
    expect(composeBorder('3', 'dotted', '#000')).toBe('3px dotted #000');
    expect(composeBorder('0.5em', 'solid', '#000')).toBe('0.5em solid #000');
  });

  it('returns "" (clear the border) when style is none or width is empty/0', () => {
    expect(composeBorder(1, 'none', '#000')).toBe('');
    expect(composeBorder(0, 'solid', '#000')).toBe('');
    expect(composeBorder('', 'solid', '#000')).toBe('');
  });

  it('falls back to currentColor when no color is given', () => {
    expect(composeBorder(2, 'solid', '')).toBe('2px solid currentColor');
  });
});
