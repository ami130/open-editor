/**
 * §2.3 push channel. The property under test throughout: this is an
 * OPTIMISATION. Every failure must degrade to "the engine's timer handles it",
 * never to a broken editor.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { subscribeEntitlements } from '../src/entitlement-stream.js';

class FakeEventSource {
  static instances = [];
  constructor(url) {
    this.url = url; this.closed = false; this.onmessage = null;
    FakeEventSource.instances.push(this);
  }
  emit(data) { this.onmessage?.({ data }); }
  close() { this.closed = true; }
}

beforeEach(() => { FakeEventSource.instances = []; vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const sub = (opts) => subscribeEntitlements({ endpoint: 'https://cdn.test', ...opts });

describe('subscribeEntitlements', () => {
  it('opens a stream and refreshes when the backend says something changed', () => {
    vi.stubGlobal('EventSource', FakeEventSource);
    const onChange = vi.fn();
    sub({ installId: 'oe_abc', onChange });

    const es = FakeEventSource.instances[0];
    expect(es.url).toContain('/delivery/events');
    expect(es.url).toContain('installId=oe_abc');

    es.emit(JSON.stringify({ reason: 'purchased' }));
    vi.runAllTimers();
    expect(onChange).toHaveBeenCalledWith('purchased');
  });

  it('prefers the licence id when both are known', () => {
    vi.stubGlobal('EventSource', FakeEventSource);
    sub({ lic: 'oe-lic-1', installId: 'oe_abc', onChange: () => {} });
    const url = FakeEventSource.instances[0].url;
    expect(url).toContain('lic=oe-lic-1');
    expect(url).not.toContain('installId');
  });

  it('COALESCES a burst into ONE refresh', () => {
    // Fulfilment publishes to the installId AND licId channels, and a
    // reconnect can replay. Refreshing three times would be wasteful and, on a
    // slow link, overlapping.
    vi.stubGlobal('EventSource', FakeEventSource);
    const onChange = vi.fn();
    sub({ installId: 'oe_abc', onChange });
    const es = FakeEventSource.instances[0];
    es.emit(JSON.stringify({ reason: 'purchased' }));
    es.emit(JSON.stringify({ reason: 'changed' }));
    es.emit(JSON.stringify({ reason: 'changed' }));
    vi.runAllTimers();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('still refreshes on a MALFORMED frame — a parse error is not a reason to ignore a change', () => {
    vi.stubGlobal('EventSource', FakeEventSource);
    const onChange = vi.fn();
    sub({ installId: 'oe_abc', onChange });
    FakeEventSource.instances[0].emit('not json');
    vi.runAllTimers();
    expect(onChange).toHaveBeenCalledWith('changed');
  });

  it('is INERT without EventSource — the timer path is unaffected', () => {
    vi.stubGlobal('EventSource', undefined);
    const stop = sub({ installId: 'oe_abc', onChange: () => {} });
    expect(typeof stop).toBe('function');
    expect(() => stop()).not.toThrow();
  });

  it('is inert with no identity to subscribe to', () => {
    vi.stubGlobal('EventSource', FakeEventSource);
    sub({ onChange: () => {} });
    expect(FakeEventSource.instances.length).toBe(0);
  });

  it('unsubscribe closes the socket and stops pending refreshes', () => {
    vi.stubGlobal('EventSource', FakeEventSource);
    const onChange = vi.fn();
    const stop = sub({ installId: 'oe_abc', onChange });
    const es = FakeEventSource.instances[0];
    es.emit(JSON.stringify({ reason: 'purchased' }));
    stop();
    vi.runAllTimers();
    expect(es.closed).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('a throwing onChange never escapes into the stream', () => {
    vi.stubGlobal('EventSource', FakeEventSource);
    sub({ installId: 'oe_abc', onChange: () => { throw new Error('boom'); } });
    FakeEventSource.instances[0].emit(JSON.stringify({ reason: 'changed' }));
    expect(() => vi.runAllTimers()).not.toThrow();
  });

  it('a constructor that throws degrades silently', () => {
    vi.stubGlobal('EventSource', function Broken() { throw new Error('blocked'); });
    expect(() => sub({ installId: 'oe_abc', onChange: () => {} })).not.toThrow();
  });
});
