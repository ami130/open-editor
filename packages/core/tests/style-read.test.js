/**
 * style-read.js — getBlockLinHeight px→ratio conversion (LOW audit fix).
 *
 * Computed line-height resolves to px even when the effective value is a
 * unitless multiplier, so the toolbar's unitless dropdown options never matched
 * the active value and the highlight was always empty. getBlockLinHeight now
 * converts a computed px value back to a ratio against font-size.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { getBlockLinHeight } from '../src/commands/style-read.js';

afterEach(() => { vi.restoreAllMocks(); });

// Minimal editor stub: getBlockInfo walks from selection.startNode to a block.
function stubEditor(block) {
  const root = document.createElement('div');
  root.appendChild(block);
  return {
    getEditorElement: () => root,
    selection: { get: () => ({ startNode: block.firstChild || block }) },
  };
}

describe('getBlockLinHeight (LOW — dropdown highlight)', () => {
  it('returns the inline unitless value verbatim', () => {
    const p = document.createElement('p');
    p.style.lineHeight = '1.5';
    p.textContent = 'x';
    expect(getBlockLinHeight(stubEditor(p))).toBe('1.5');
  });

  it('converts a computed px line-height into a unitless ratio', () => {
    const p = document.createElement('p');
    p.textContent = 'x'; // no inline line-height → computed path
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      lineHeight: '24px', fontSize: '16px',
    });
    // 24 / 16 = 1.5 → matches the "1.5" dropdown option.
    expect(getBlockLinHeight(stubEditor(p))).toBe('1.5');
  });

  it('rounds the ratio to 2 decimal places', () => {
    const p = document.createElement('p');
    p.textContent = 'x';
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      lineHeight: '23px', fontSize: '20px',
    });
    // 23 / 20 = 1.15
    expect(getBlockLinHeight(stubEditor(p))).toBe('1.15');
  });

  it('passes through a non-px computed value (e.g. "normal") unchanged', () => {
    const p = document.createElement('p');
    p.textContent = 'x';
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      lineHeight: 'normal', fontSize: '16px',
    });
    expect(getBlockLinHeight(stubEditor(p))).toBe('normal');
  });
});
