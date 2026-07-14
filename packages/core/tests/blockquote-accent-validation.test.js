/**
 * LOW (audit) — blockquote custom-accent input must validate before applying.
 *
 * The custom-color text field used to write its raw value straight into
 * bq.style.setProperty('--bq-accent', value) with no validation, so a typo or a
 * CSS-injection attempt landed in the DOM. _applyAccent now rejects anything the
 * shared CSS-injection guard flags and marks the input invalid.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestEditor } from '../src/testing/test-harness.js';
import { BlockquoteToolbar } from '../src/ui/toolbar/blockquote-toolbar.js';

let editor, tb, bq;
beforeEach(() => {
  editor = createTestEditor();
  tb = new BlockquoteToolbar(editor, document);
  // Minimal stubs so _applyAccent can run without the full DOM build.
  bq = document.createElement('blockquote');
  document.body.appendChild(bq);
  tb._currentBQ = bq;
  tb._hexInput = document.createElement('input');
  tb._swatchRow = document.createElement('div');
});
afterEach(() => {
  if (bq.parentNode) bq.remove();
  if (!editor.isDestroyed()) editor.destroy();
  if (editor._target && editor._target.parentNode) editor._target.remove();
});

describe('BlockquoteToolbar._applyAccent — validation (LOW)', () => {
  it('applies a valid hex accent', () => {
    tb._applyAccent('#3366ff');
    expect(bq.style.getPropertyValue('--bq-accent')).toBe('#3366ff');
    expect(tb._hexInput.classList.contains('oe-bq-toolbar__hex--invalid')).toBe(false);
  });

  it('applies a valid rgb() accent', () => {
    tb._applyAccent('rgb(10, 20, 30)');
    expect(bq.style.getPropertyValue('--bq-accent')).toBe('rgb(10, 20, 30)');
  });

  it('rejects a CSS-injection attempt and marks the input invalid', () => {
    tb._applyAccent('red; background: url(javascript:alert(1))');
    expect(bq.style.getPropertyValue('--bq-accent')).toBe('');
    expect(tb._hexInput.classList.contains('oe-bq-toolbar__hex--invalid')).toBe(true);
  });

  it('rejects an empty value', () => {
    tb._applyAccent('');
    expect(bq.style.getPropertyValue('--bq-accent')).toBe('');
  });

  it('clears the invalid flag once a valid value is applied', () => {
    tb._applyAccent('url(javascript:x)');
    expect(tb._hexInput.classList.contains('oe-bq-toolbar__hex--invalid')).toBe(true);
    tb._applyAccent('#00ff00');
    expect(tb._hexInput.classList.contains('oe-bq-toolbar__hex--invalid')).toBe(false);
    expect(bq.style.getPropertyValue('--bq-accent')).toBe('#00ff00');
  });
});
