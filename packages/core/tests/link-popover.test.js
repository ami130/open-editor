/**
 * link-popover.test.js — Phase 10 hover popover.
 * Covers: element/visibility, URL text, Open safety regex, Edit/Unlink callbacks.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestEditor } from '../src/testing/test-harness.js';
import { LinkPopover } from '../src/plugins/link/link-popover.js';

let editor, popover;
beforeEach(() => {
  editor = createTestEditor();
  popover = new LinkPopover(editor);
});
afterEach(() => {
  if (popover) popover.destroy();
  if (!editor.isDestroyed()) editor.destroy();
  if (editor._target && editor._target.parentNode) editor._target.remove();
});

function anchorIn(html) {
  editor.getEditorElement().innerHTML = `<p>${html}</p>`;
  return editor.getEditorElement().querySelector('a');
}

describe('LinkPopover — construction', () => {
  it('builds a hidden popover appended to the wrapper', () => {
    const el = popover.getElement();
    expect(el).toBeTruthy();
    expect(el.classList.contains('oe-link-popover')).toBe(true);
    expect(el.hidden).toBe(true);
    expect(editor._wrapper.contains(el)).toBe(true);
  });

  it('has Open / Edit / Unlink buttons and a url slot', () => {
    const el = popover.getElement();
    expect(el.querySelectorAll('.oe-link-popover__btn').length).toBe(3);
    expect(el.querySelector('.oe-link-popover__url')).toBeTruthy();
  });
});

describe('LinkPopover — showFor / hide', () => {
  it('shows and sets the url text', () => {
    const a = anchorIn('<a href="https://example.com">x</a>');
    popover.showFor(a);
    expect(popover.getElement().hidden).toBe(false);
    expect(popover.getElement().querySelector('.oe-link-popover__url').textContent)
      .toBe('https://example.com');
    expect(popover.getAnchor()).toBe(a);
  });

  it('hide() collapses and clears the anchor', () => {
    const a = anchorIn('<a href="#x">x</a>');
    popover.showFor(a);
    popover.hide();
    expect(popover.getElement().hidden).toBe(true);
    expect(popover.getAnchor()).toBe(null);
  });
});

describe('LinkPopover — Open button safety', () => {
  it('opens a safe https href via window.open', () => {
    const spy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const a = anchorIn('<a href="https://example.com">x</a>');
    popover.showFor(a);
    popover.getElement().querySelectorAll('.oe-link-popover__btn')[0].click();
    expect(spy).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener');
    spy.mockRestore();
  });

  it('does NOT open a javascript: href (no-op)', () => {
    const spy = vi.spyOn(window, 'open').mockImplementation(() => null);
    // Anchor built directly so the sanitizer doesn't strip the unsafe href.
    const a = document.createElement('a');
    a.setAttribute('href', 'javascript:alert(1)');
    a.textContent = 'x';
    popover.showFor(a);
    popover.getElement().querySelectorAll('.oe-link-popover__btn')[0].click();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('LinkPopover — iframe-mode event binding (MEDIUM)', () => {
  // In iframe mode the editable content lives in a separate document, so user
  // input fires there — the popover must bind its close listeners to BOTH the
  // top document and the iframe document, not only the wrapper's document.
  function withIframeDoc() {
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    return { iframe, idoc: iframe.contentDocument };
  }

  it('_docs() returns both the top and the iframe document', () => {
    const { iframe, idoc } = withIframeDoc();
    const ed = createTestEditor();
    ed._iframeDoc = idoc;
    const pop = new LinkPopover(ed);
    const docs = pop._docs();
    expect(docs).toContain(document);
    expect(docs).toContain(idoc);
    expect(docs.length).toBe(2);
    pop.destroy();
    ed.destroy();
    if (ed._target && ed._target.parentNode) ed._target.remove();
    iframe.remove();
  });

  it('Escape pressed INSIDE the iframe closes the popover', () => {
    const { iframe, idoc } = withIframeDoc();
    const ed = createTestEditor();
    ed._iframeDoc = idoc;
    const pop = new LinkPopover(ed);
    const a = document.createElement('a');
    a.setAttribute('href', 'https://example.com');
    a.textContent = 'x';
    pop.showFor(a);
    expect(pop.getElement().hidden).toBe(false);
    // Fire Escape on the IFRAME document — top-doc-only binding would miss it.
    idoc.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(pop.getElement().hidden).toBe(true);
    pop.destroy();
    ed.destroy();
    if (ed._target && ed._target.parentNode) ed._target.remove();
    iframe.remove();
  });

  it('destroy() removes the iframe-document listeners (no leak)', () => {
    const { iframe, idoc } = withIframeDoc();
    const ed = createTestEditor();
    ed._iframeDoc = idoc;
    const pop = new LinkPopover(ed);
    const a = document.createElement('a');
    a.setAttribute('href', 'https://example.com');
    a.textContent = 'x';
    pop.showFor(a);
    pop.destroy();
    // After destroy, an Escape in the iframe must NOT touch the (now-removed) el.
    expect(() => idoc.dispatchEvent(
      new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    )).not.toThrow();
    ed.destroy();
    if (ed._target && ed._target.parentNode) ed._target.remove();
    iframe.remove();
  });
});

describe('LinkPopover — Edit / Unlink callbacks', () => {
  it('Edit invokes onEdit with the anchor', () => {
    const a = anchorIn('<a href="#x">x</a>');
    const onEdit = vi.fn();
    popover.onEdit = onEdit;
    popover.showFor(a);
    popover.getElement().querySelectorAll('.oe-link-popover__btn')[1].click();
    expect(onEdit).toHaveBeenCalledWith(a);
  });

  it('Unlink invokes onUnlink with the anchor and hides', () => {
    const a = anchorIn('<a href="#x">x</a>');
    const onUnlink = vi.fn();
    popover.onUnlink = onUnlink;
    popover.showFor(a);
    popover.getElement().querySelectorAll('.oe-link-popover__btn')[2].click();
    expect(onUnlink).toHaveBeenCalledWith(a);
    expect(popover.getElement().hidden).toBe(true);
  });
});
