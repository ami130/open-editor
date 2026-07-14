/**
 * link-dialog.test.js — Phase 10 dialog form builder.
 *
 * The async modal glue (openLinkDialog) needs editor.ui.modal and can't run
 * headlessly, so we unit-test the pure buildLinkForm() directly: field presence,
 * pre-fill from an existing <a>, and read() output.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestEditor } from '../src/testing/test-harness.js';
import { buildLinkForm } from '../src/plugins/link/link-dialog-form.js';

let editor;
beforeEach(() => { editor = createTestEditor(); });
afterEach(() => {
  if (!editor.isDestroyed()) editor.destroy();
  if (editor._target && editor._target.parentNode) editor._target.remove();
});

describe('buildLinkForm — insert mode (no existing link)', () => {
  it('builds all fields', () => {
    const { form } = buildLinkForm(document, editor, null);
    expect(form.querySelector('#oe-link-url')).toBeTruthy();
    expect(form.querySelector('#oe-link-text')).toBeTruthy();
    expect(form.querySelector('#oe-link-newtab')).toBeTruthy();
    expect(form.querySelector('#oe-link-nofollow')).toBeTruthy();
    expect(form.querySelector('#oe-link-class')).toBeTruthy();
    expect(form.querySelector('#oe-link-aria')).toBeTruthy();
  });

  it('has empty url/text and unchecked boxes by default', () => {
    const { form, read } = buildLinkForm(document, editor, null);
    const v = read();
    expect(v.href).toBe('');
    expect(v.text).toBe('');
    expect(v.target).toBe(false);
    expect(v.nofollow).toBe(false);
    expect(form.querySelector('#oe-link-newtab').checked).toBe(false);
  });

  it('honours linkOpenInNewTabDefault config', () => {
    editor._config.linkOpenInNewTabDefault = true;
    const { form } = buildLinkForm(document, editor, null);
    expect(form.querySelector('#oe-link-newtab').checked).toBe(true);
  });

  it('read() reflects typed values', () => {
    const { form, read } = buildLinkForm(document, editor, null);
    form.querySelector('#oe-link-url').value = 'https://example.com';
    form.querySelector('#oe-link-text').value = 'Example';
    form.querySelector('#oe-link-newtab').checked = true;
    form.querySelector('#oe-link-nofollow').checked = true;
    form.querySelector('#oe-link-class').value = 'btn primary';
    form.querySelector('#oe-link-aria').value = 'Go to example';
    form.querySelector('#oe-link-color').value = '#e11d48';
    form.querySelector('#oe-link-nocolor').checked = false;
    const v = read();
    expect(v).toEqual({
      href: 'https://example.com',
      text: 'Example',
      target: true,
      nofollow: true,
      className: 'btn primary',
      ariaLabel: 'Go to example',
      color: '#e11d48',
    });
  });

  it('read() color is "" when "No custom color" is checked', () => {
    const { form, read } = buildLinkForm(document, editor, null);
    form.querySelector('#oe-link-color').value = '#123456';
    form.querySelector('#oe-link-nocolor').checked = true;
    expect(read().color).toBe('');
  });

  it('insert mode defaults to "No custom color" checked', () => {
    const { form } = buildLinkForm(document, editor, null);
    expect(form.querySelector('#oe-link-nocolor').checked).toBe(true);
  });
});

describe('buildLinkForm — edit mode (existing link)', () => {
  function makeAnchor(attrs, text) {
    const a = document.createElement('a');
    for (const [k, val] of Object.entries(attrs)) a.setAttribute(k, val);
    a.textContent = text;
    return a;
  }

  it('pre-fills href, text, class, aria', () => {
    const a = makeAnchor(
      { href: 'https://foo.test', class: 'x', 'aria-label': 'Foo' }, 'Foo link');
    const { form, read } = buildLinkForm(document, editor, a);
    expect(form.querySelector('#oe-link-url').value).toBe('https://foo.test');
    expect(form.querySelector('#oe-link-text').value).toBe('Foo link');
    const v = read();
    expect(v.className).toBe('x');
    expect(v.ariaLabel).toBe('Foo');
  });

  it('pre-checks new-tab when target=_blank', () => {
    const a = makeAnchor({ href: '#', target: '_blank' }, 'x');
    const { form } = buildLinkForm(document, editor, a);
    expect(form.querySelector('#oe-link-newtab').checked).toBe(true);
  });

  it('pre-checks nofollow when rel contains nofollow', () => {
    const a = makeAnchor({ href: '#', rel: 'noopener nofollow' }, 'x');
    const { form } = buildLinkForm(document, editor, a);
    expect(form.querySelector('#oe-link-nofollow').checked).toBe(true);
  });

  it('does not pre-check nofollow when absent', () => {
    const a = makeAnchor({ href: '#', rel: 'noopener' }, 'x');
    const { form } = buildLinkForm(document, editor, a);
    expect(form.querySelector('#oe-link-nofollow').checked).toBe(false);
  });

  it('pre-fills color from an existing inline style and unchecks "No custom color"', () => {
    const a = makeAnchor({ href: '#', style: 'color: #ff8800;' }, 'x');
    const { form, read } = buildLinkForm(document, editor, a);
    expect(form.querySelector('#oe-link-color').value).toBe('#ff8800');
    expect(form.querySelector('#oe-link-nocolor').checked).toBe(false);
    expect(read().color).toBe('#ff8800');
  });

  it('normalizes an rgb() link color into hex (LOW — no longer dropped)', () => {
    const a = makeAnchor({ href: '#', style: 'color: rgb(37, 99, 235);' }, 'x');
    const { form } = buildLinkForm(document, editor, a);
    expect(form.querySelector('#oe-link-color').value).toBe('#2563eb');
    expect(form.querySelector('#oe-link-nocolor').checked).toBe(false);
  });

  it('normalizes a named link color into hex (LOW — no longer dropped)', () => {
    const a = makeAnchor({ href: '#', style: 'color: red;' }, 'x');
    const { form } = buildLinkForm(document, editor, a);
    expect(form.querySelector('#oe-link-color').value).toBe('#ff0000');
    expect(form.querySelector('#oe-link-nocolor').checked).toBe(false);
  });

  it('expands a 3-digit hex link color', () => {
    const a = makeAnchor({ href: '#', style: 'color: #f80;' }, 'x');
    const { form } = buildLinkForm(document, editor, a);
    expect(form.querySelector('#oe-link-color').value).toBe('#ff8800');
  });

  it('checks "No custom color" when the link has no color', () => {
    const a = makeAnchor({ href: '#' }, 'x');
    const { form } = buildLinkForm(document, editor, a);
    expect(form.querySelector('#oe-link-nocolor').checked).toBe(true);
  });
});

describe('buildLinkForm — error area', () => {
  it('showError/clearError toggle the hidden class', () => {
    const { form, showError, clearError } = buildLinkForm(document, editor, null);
    const err = form.querySelector('.oe-link-dialog__error');
    expect(err.classList.contains('oe-link-dialog__error--hidden')).toBe(true);
    showError('nope');
    expect(err.textContent).toBe('nope');
    expect(err.classList.contains('oe-link-dialog__error--hidden')).toBe(false);
    clearError();
    expect(err.classList.contains('oe-link-dialog__error--hidden')).toBe(true);
  });
});
