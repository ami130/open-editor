import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from '../src/events/event-emitter.js';

describe('EventEmitter', () => {
  it('on() registers a handler that receives emitted args', () => {
    const ee = new EventEmitter();
    const fn = vi.fn();
    ee.on('change', fn);
    ee.emit('change', 1, 2);
    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith(1, 2);
  });

  it('on() returns this for chaining', () => {
    const ee = new EventEmitter();
    expect(ee.on('x', () => {})).toBe(ee);
  });

  it('on() ignores non-function handlers', () => {
    const ee = new EventEmitter();
    expect(() => ee.on('x', 42)).not.toThrow();
    ee.emit('x'); // no crash
  });

  it('off() removes a specific handler', () => {
    const ee = new EventEmitter();
    const fn = vi.fn();
    ee.on('change', fn);
    ee.off('change', fn);
    ee.emit('change');
    expect(fn).not.toHaveBeenCalled();
  });

  it('off() leaves other handlers intact', () => {
    const ee = new EventEmitter();
    const a = vi.fn();
    const b = vi.fn();
    ee.on('x', a);
    ee.on('x', b);
    ee.off('x', a);
    ee.emit('x');
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledOnce();
  });

  it('off() on non-existent event does not throw', () => {
    const ee = new EventEmitter();
    expect(() => ee.off('ghost', () => {})).not.toThrow();
  });

  it('emit() returns true when listeners exist', () => {
    const ee = new EventEmitter();
    ee.on('x', () => {});
    expect(ee.emit('x')).toBe(true);
  });

  it('emit() returns false when no listeners', () => {
    const ee = new EventEmitter();
    expect(ee.emit('x')).toBe(false);
  });

  it('once() handler fires exactly once', () => {
    const ee = new EventEmitter();
    const fn = vi.fn();
    ee.once('tick', fn);
    ee.emit('tick');
    ee.emit('tick');
    ee.emit('tick');
    expect(fn).toHaveBeenCalledOnce();
  });

  it('once() does not affect other on() handlers', () => {
    const ee = new EventEmitter();
    const once = vi.fn();
    const always = vi.fn();
    ee.once('x', once);
    ee.on('x', always);
    ee.emit('x');
    ee.emit('x');
    expect(once).toHaveBeenCalledOnce();
    expect(always).toHaveBeenCalledTimes(2);
  });

  it('multiple handlers for same event all fire', () => {
    const ee = new EventEmitter();
    const a = vi.fn();
    const b = vi.fn();
    ee.on('x', a);
    ee.on('x', b);
    ee.emit('x', 42);
    expect(a).toHaveBeenCalledWith(42);
    expect(b).toHaveBeenCalledWith(42);
  });

  it('removeAllListeners(event) clears only that event', () => {
    const ee = new EventEmitter();
    const a = vi.fn();
    const b = vi.fn();
    ee.on('x', a);
    ee.on('y', b);
    ee.removeAllListeners('x');
    ee.emit('x');
    ee.emit('y');
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledOnce();
  });

  it('removeAllListeners() with no arg clears all events', () => {
    const ee = new EventEmitter();
    const a = vi.fn();
    const b = vi.fn();
    ee.on('x', a);
    ee.on('y', b);
    ee.removeAllListeners();
    ee.emit('x');
    ee.emit('y');
    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
  });

  it('handlers added during emit do not fire in same emit call', () => {
    const ee = new EventEmitter();
    const late = vi.fn();
    ee.on('x', () => ee.on('x', late));
    ee.emit('x');
    expect(late).not.toHaveBeenCalled();
  });

  it('_events uses null prototype (no prototype pollution risk)', () => {
    const ee = new EventEmitter();
    expect(Object.getPrototypeOf(ee._events)).toBeNull();
  });
});
