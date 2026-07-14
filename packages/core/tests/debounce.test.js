import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce } from '../src/utils/debounce.js';

describe('debounce utility', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('delays invocation by wait ms', () => {
    const fn = vi.fn();
    const d = debounce(fn, 200);
    d();
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledOnce();
  });

  it('resets timer on repeated calls', () => {
    const fn = vi.fn();
    const d = debounce(fn, 200);
    d();
    vi.advanceTimersByTime(100);
    d();
    vi.advanceTimersByTime(100);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledOnce();
  });

  it('cancel() prevents pending invocation', () => {
    const fn = vi.fn();
    const d = debounce(fn, 200);
    d();
    d.cancel();
    vi.advanceTimersByTime(300);
    expect(fn).not.toHaveBeenCalled();
  });

  it('can be called again after cancel()', () => {
    const fn = vi.fn();
    const d = debounce(fn, 200);
    d();
    d.cancel();
    d();
    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledOnce();
  });

  it('passes arguments to wrapped function', () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d(1, 'hello');
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledWith(1, 'hello');
  });

  it('cancel() is safe to call when nothing is pending', () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    expect(() => d.cancel()).not.toThrow();
  });
});
