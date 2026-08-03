/**
 * toast-manager.test.js — the shared feedback surface (editor.ui.toast).
 * Proves the accessible roles, variants, auto-dismiss, sticky progress→resolve,
 * dedupe of the aria-live region, no-DOM safety, and teardown.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ToastManager } from '../src/ui/toast-manager.js';

function makeWrapper(doc) {
  const w = doc.createElement('div');
  doc.body.appendChild(w);
  return w;
}

describe('ToastManager', () => {
  let wrapper, toast;

  beforeEach(() => {
    vi.useFakeTimers();
    wrapper = makeWrapper(document);
    toast = new ToastManager(wrapper, document);
  });

  afterEach(() => {
    toast.destroy();
    if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  const regionEls = () => wrapper.querySelectorAll('.oe-toast');

  it('success() renders a polite status toast with the message', () => {
    toast.success('Exported to Word');
    const el = wrapper.querySelector('.oe-toast');
    expect(el).toBeTruthy();
    expect(el.classList.contains('oe-toast--success')).toBe(true);
    expect(el.getAttribute('role')).toBe('status');
    expect(el.getAttribute('aria-live')).toBe('polite');
    expect(el.querySelector('.oe-toast__msg').textContent).toBe('Exported to Word');
  });

  it('error() is an assertive alert (interrupts screen readers)', () => {
    toast.error('Export failed');
    const el = wrapper.querySelector('.oe-toast--error');
    expect(el).toBeTruthy();
    expect(el.getAttribute('role')).toBe('alert');
    expect(el.getAttribute('aria-live')).toBe('assertive');
  });

  it('info() and success() auto-dismiss; the region is removed when empty', () => {
    toast.success('done');
    expect(regionEls().length).toBe(1);
    // default 3600ms + 200ms fade-out removal
    vi.advanceTimersByTime(3600 + 250);
    expect(regionEls().length).toBe(0);
    // region container itself is cleaned up
    expect(wrapper.querySelector('.oe-toast-region')).toBeNull();
  });

  it('multiple toasts stack in one shared region', () => {
    toast.info('one');
    toast.info('two');
    expect(wrapper.querySelectorAll('.oe-toast-region').length).toBe(1);
    expect(regionEls().length).toBe(2);
  });

  it('progress() is sticky (no auto-dismiss) with a spinner and can resolve to success', () => {
    const p = toast.progress('Exporting…');
    const el = wrapper.querySelector('.oe-toast--progress');
    expect(el).toBeTruthy();
    expect(el.querySelector('.oe-toast__spinner')).toBeTruthy();
    // Not auto-dismissed after a long wait.
    vi.advanceTimersByTime(10_000);
    expect(wrapper.querySelector('.oe-toast')).toBeTruthy();
    // Resolve → becomes a success toast, spinner gone.
    p.success('Exported');
    const done = wrapper.querySelector('.oe-toast');
    expect(done.classList.contains('oe-toast--success')).toBe(true);
    expect(done.querySelector('.oe-toast__spinner')).toBeNull();
    expect(done.querySelector('.oe-toast__msg').textContent).toBe('Exported');
    // And now it DOES auto-dismiss.
    vi.advanceTimersByTime(3600 + 250);
    expect(regionEls().length).toBe(0);
  });

  it('progress().error() resolves the spinner into an error alert', () => {
    const p = toast.progress('Exporting…');
    p.error('CORS blocked 2 images');
    const el = wrapper.querySelector('.oe-toast');
    expect(el.classList.contains('oe-toast--error')).toBe(true);
    expect(el.getAttribute('role')).toBe('alert');
    expect(el.querySelector('.oe-toast__spinner')).toBeNull();
  });

  it('the close (×) button dismisses a toast immediately', () => {
    toast.error('nope');
    const btn = wrapper.querySelector('.oe-toast__close');
    expect(btn).toBeTruthy();
    btn.click();
    vi.advanceTimersByTime(250);
    expect(regionEls().length).toBe(0);
  });

  it('toasts live in the WRAPPER, never inside an editable (no getHTML pollution risk)', () => {
    toast.info('hi');
    const region = wrapper.querySelector('.oe-toast-region');
    expect(region.parentNode).toBe(wrapper);
  });

  it('is safe with no DOM (SSR/headless) — returns a no-op handle, never throws', () => {
    const headless = new ToastManager(null, null);
    expect(() => {
      const h = headless.success('x');
      h.close();
      const p = headless.progress('y');
      p.success('z');
      p.error('e');
    }).not.toThrow();
  });

  it('destroy() removes the region', () => {
    toast.info('bye');
    expect(wrapper.querySelector('.oe-toast-region')).toBeTruthy();
    toast.destroy();
    expect(wrapper.querySelector('.oe-toast-region')).toBeNull();
  });
});
