/**
 * Regression tests for the audit fix batch (candidate ids C0xx).
 * Each test pins a specific confirmed bug so it cannot silently return.
 */
import { describe, it, expect, vi } from 'vitest';
import { sanitize } from '../src/sanitizer/sanitizer.js';
import { HistoryManager } from '../src/history/history-manager.js';
import { EventEmitter } from '../src/events/event-emitter.js';
import { Logger } from '../src/logger/logger.js';

const CTRL = String.fromCharCode(1); // U+0001, a C0 control char

// ─── C086: sanitizer must not throw on a bare top-level text node ─────────────

describe('C086 — sanitize() handles bare top-level text nodes', () => {
  it('does not throw on plain text input', () => {
    expect(() => sanitize('plain text', { document })).not.toThrow();
    expect(sanitize('plain text', { document })).toContain('plain text');
  });
  it('still skips smart-quote normalization inside <pre>/<code>', () => {
    const out = sanitize('<pre>‘x’</pre>', { document });
    expect(out).toContain('‘x’');
  });
});

// ─── C087/C094: URL scheme checks ─────────────────────────────────────────────

describe('C087/C094 — dangerous URL schemes are blocked', () => {
  it('strips a plain javascript: href', () => {
    expect(sanitize('<a href="javascript:alert(1)">x</a>', { document })).not.toContain('javascript:');
  });
  it('strips a control-char-prefixed javascript: href', () => {
    const payload = '<a href="' + CTRL + 'javascript:alert(1)">x</a>';
    expect(sanitize(payload, { document })).not.toContain('javascript:');
  });
  it('strips blob: and filesystem: schemes (C094)', () => {
    const out = sanitize('<a href="blob:abc">x</a><a href="filesystem:def">y</a>', { document });
    expect(out).not.toContain('href="blob:');
    expect(out).not.toContain('href="filesystem:');
  });
});

// ─── C088: CSS comment-evasion of expression() is blocked ─────────────────────

describe('C088 — CSS keyword bypass via comments is blocked', () => {
  it('strips style with expr/**/ession()', () => {
    const out = sanitize('<p style="width:expr/**/ession(alert(1))">x</p>', { document });
    expect(out).not.toContain('ession(');
  });
});

// ─── C055: history dedup must still truncate the redo future ──────────────────

describe('C055 — no-net-change snapshot after undo discards stale redo future', () => {
  function makeStub(html) {
    const listeners = {};
    const el = document.createElement('div');
    el.innerHTML = html;
    document.body.appendChild(el);
    const ed = {
      _destroyed: false, _timers: new Set(), commands: { _batching: false },
      selection: { save: () => null, restore: vi.fn() },
      getEditorElement: () => el, isDestroyed: () => ed._destroyed,
      _setRawHTML: (h) => { el.innerHTML = h; },
      emit: (e, ...a) => (listeners[e] || []).forEach((f) => f(...a)),
      on: (e, f) => { (listeners[e] = listeners[e] || []).push(f); },
      off: () => {},
    };
    return { ed, el };
  }

  it('redo cannot walk into an abandoned branch', () => {
    const { ed, el } = makeStub('<p>A</p>');
    const hm = new HistoryManager(ed);
    hm.takeSnapshot();                            // A
    el.innerHTML = '<p>B</p>'; hm.takeSnapshot(); // B
    el.innerHTML = '<p>C</p>'; hm.takeSnapshot(); // C
    hm.undo(); hm.undo();                         // back to A, redo future [B,C]
    el.innerHTML = '<p>A</p>'; hm.takeSnapshot(); // reproduce A — must truncate [B,C]
    expect(hm.canRedo()).toBe(false);
    hm.destroy();
    if (el.parentNode) el.parentNode.removeChild(el);
  });
});

// ─── C013/C014: EventEmitter robustness ───────────────────────────────────────

describe('C013 — off() does not strip a separate listener sharing the fn', () => {
  it('keeps the durable on() listener after a once() with same fn fires', () => {
    const ee = new EventEmitter();
    let calls = 0;
    const fn = () => { calls++; };
    ee.on('x', fn);
    ee.once('x', fn);
    ee.emit('x'); // both fire (calls=2), once removed
    ee.emit('x'); // durable on() must still fire (calls=3)
    expect(calls).toBe(3);
  });
});

describe('C014 — a throwing listener does not abort the rest', () => {
  it('runs later listeners despite an earlier throw', () => {
    const ee = new EventEmitter();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let reached = false;
    ee.on('x', () => { throw new Error('boom'); });
    ee.on('x', () => { reached = true; });
    expect(() => ee.emit('x')).not.toThrow();
    expect(reached).toBe(true);
    errSpy.mockRestore();
  });
});

// ─── C028/C029: Logger ────────────────────────────────────────────────────────

describe('C028/C029 — logger', () => {
  it('surfaces errors even when debug is false (C029)', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    new Logger(false).error('boom');
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
  it('does not throw when a custom logger throws (C028)', () => {
    const custom = { info: () => { throw new Error('x'); }, warn() {}, error() {} };
    const log = new Logger(true, custom);
    expect(() => log.info('hi')).not.toThrow();
  });
});
