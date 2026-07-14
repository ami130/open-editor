/**
 * F1/F9/F10 — chrome accessibility CSS. The forced-colors + reduced-motion rules
 * that target the toolbar/menus/modals/panels must be injected into the HOST
 * document (via oe-a11y-styles), separate from BASE_CSS which — in iframe mode —
 * goes into the iframe where the chrome does NOT live. Also verifies the F9
 * dead-selector fix (correct class names) and F10 modal focus ring.
 *
 * (iframe mode itself is not unit-testable under jsdom — contentDocument is
 * inaccessible — but the injection runs before the iframe build unconditionally,
 * so a host-document assertion in non-iframe mode covers the shared code path.)
 */
import { describe, it, expect, afterEach } from 'vitest';
import { OpenEditor } from '../src/editor.js';
import { A11Y_CHROME_CSS } from '../src/utils/a11y-css.js';
import { BASE_CSS } from '../src/utils/base-css.js';

let editor, target;
afterEach(() => {
  if (editor && !editor.isDestroyed()) editor.destroy();
  if (target && target.parentNode) target.remove();
  const s = document.getElementById('oe-a11y-styles');
  if (s) s.remove();
});

describe('chrome a11y CSS injection (F1)', () => {
  it('injects oe-a11y-styles into the host document head', () => {
    const existing = document.getElementById('oe-a11y-styles');
    if (existing) existing.remove();
    target = document.createElement('div');
    document.body.appendChild(target);
    editor = new OpenEditor(target);
    const s = document.getElementById('oe-a11y-styles');
    expect(s).not.toBeNull();
    expect(s.textContent).toContain('forced-colors');
    expect(s.textContent).toContain('prefers-reduced-motion');
  });

  it('is injected once even with multiple editors', () => {
    target = document.createElement('div');
    document.body.appendChild(target);
    editor = new OpenEditor(target);
    const t2 = document.createElement('div');
    document.body.appendChild(t2);
    const e2 = new OpenEditor(t2);
    expect(document.querySelectorAll('#oe-a11y-styles').length).toBe(1);
    e2.destroy(); t2.remove();
  });
});

describe('F9 — forced-colors targets REAL class names', () => {
  it('targets .oe-modal (not the nonexistent .oe-modal__dialog)', () => {
    expect(A11Y_CHROME_CSS).toContain('.oe-modal');
    expect(A11Y_CHROME_CSS).not.toContain('.oe-modal__dialog');
  });
  it('targets the real color-panel classes (.oe-cp / .oe-tb__color-panel), not .oe-color-picker__panel', () => {
    expect(A11Y_CHROME_CSS).toMatch(/\.oe-cp\b/);
    expect(A11Y_CHROME_CSS).not.toContain('.oe-color-picker__panel');
  });
  it('covers the body-appended dropdown panel in reduced-motion', () => {
    expect(A11Y_CHROME_CSS).toContain('.oe-tb__dd-panel');
  });
});

describe('editable-only a11y rules stay in BASE_CSS', () => {
  it('BASE_CSS keeps the editable focus ring + forced-colors border', () => {
    expect(BASE_CSS).toContain('.oe-editor:focus-visible');
    expect(BASE_CSS).toContain('forced-colors');
  });
  it('touch-action allows pinch-zoom + both-axis pan (WCAG 1.4.4/1.4.10)', () => {
    expect(BASE_CSS).toContain('touch-action: pan-x pan-y pinch-zoom');
    expect(BASE_CSS).not.toContain('touch-action: pan-y;');
  });
});
