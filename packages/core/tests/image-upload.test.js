/**
 * Phase 9 — image-upload.js unit tests (9.3, 9.4, 9.17).
 *
 * FileReader and XMLHttpRequest are mocked with vi.fn() because jsdom does not
 * implement them fully. Tests verify the plumbing (promise resolution, progress
 * callbacks, abort signal wiring) — not the browser API internals.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileAsBase64, uploadFile, processImageFile } from '../src/plugins/image/image-upload.js';

// ── FileReader mock ───────────────────────────────────────────────────────────

function makeMockFileReader(result = 'data:image/png;base64,abc', error = null) {
  const reader = {
    readAsDataURL: vi.fn(function () {
      if (error) {
        setTimeout(() => this.onerror && this.onerror(new Error(error)), 0);
      } else {
        setTimeout(() => this.onload && this.onload({ target: { result } }), 0);
      }
    }),
    onload:  null,
    onerror: null,
  };
  return reader;
}

// ── Mock document with createElement for img dimension measurement ────────────

function makeMockDoc(w = 800, h = 600) {
  return {
    createElement(tag) {
      if (tag === 'img') {
        const img = {
          naturalWidth: w, naturalHeight: h,
          set src(_) { setTimeout(() => this.onload && this.onload(), 0); },
          onload: null, onerror: null,
        };
        return img;
      }
      return {};
    },
  };
}

// ── 9.3 — readFileAsBase64 ────────────────────────────────────────────────────

describe('9.3 — readFileAsBase64', () => {
  let origFileReader;

  beforeEach(() => { origFileReader = globalThis.FileReader; });
  afterEach(() => { globalThis.FileReader = origFileReader; });

  it('resolves with src, width, height on success', async () => {
    const dataUrl = 'data:image/png;base64,abc';
    const mockReader = makeMockFileReader(dataUrl);
    globalThis.FileReader = vi.fn(() => mockReader);

    const file = new File([''], 'test.png', { type: 'image/png' });
    const result = await readFileAsBase64(file, makeMockDoc(640, 480));

    expect(result).not.toBeNull();
    expect(result.src).toBe(dataUrl);
    expect(result.width).toBe(640);
    expect(result.height).toBe(480);
  });

  it('resolves null for non-image file', async () => {
    const file = new File([''], 'doc.txt', { type: 'text/plain' });
    const result = await readFileAsBase64(file, makeMockDoc());
    expect(result).toBeNull();
  });

  it('resolves null on FileReader error', async () => {
    const mockReader = makeMockFileReader(null, 'read error');
    globalThis.FileReader = vi.fn(() => mockReader);

    const file = new File([''], 'bad.png', { type: 'image/png' });
    const result = await readFileAsBase64(file, makeMockDoc());
    expect(result).toBeNull();
  });

  it('resolves null for null file', async () => {
    const result = await readFileAsBase64(null, makeMockDoc());
    expect(result).toBeNull();
  });
});

// ── 9.4 — uploadFile ─────────────────────────────────────────────────────────

describe('9.4 — uploadFile', () => {
  let origXHR;

  function makeMockXHR(status = 200, responseText = '{"url":"https://cdn.example.com/img.jpg"}', simulateAbort = false) {
    const xhr = {
      open: vi.fn(),
      send: vi.fn(function () {
        if (simulateAbort) return; // abort() will be called externally
        setTimeout(() => {
          // Simulate upload progress
          this.upload.dispatchEvent({ type: 'progress', lengthComputable: true, loaded: 50, total: 100 });
          // Simulate completion
          Object.defineProperty(this, 'status', { value: status, configurable: true });
          Object.defineProperty(this, 'responseText', { value: responseText, configurable: true });
          this.dispatchEvent({ type: 'load' });
        }, 0);
      }),
      abort: vi.fn(function () {
        setTimeout(() => this.dispatchEvent({ type: 'abort' }), 0);
      }),
      addEventListener: vi.fn(function (type, fn) { this._listeners[type] = fn; }),
      dispatchEvent:    vi.fn(function (e) { const fn = this._listeners[e.type]; if (fn) fn(e); }),
      upload: {
        addEventListener: vi.fn(function (type, fn) { this._listeners[type] = fn; }),
        dispatchEvent:    vi.fn(function (e) { const fn = this._listeners[e.type]; if (fn) fn(e); }),
        _listeners: {},
      },
      _listeners: {},
    };
    return xhr;
  }

  beforeEach(() => { origXHR = globalThis.XMLHttpRequest; });
  afterEach(() => { globalThis.XMLHttpRequest = origXHR; });

  it('resolves with src, width, height from server JSON', async () => {
    const mockXHR = makeMockXHR(200, '{"url":"https://cdn.example.com/img.jpg"}');
    globalThis.XMLHttpRequest = vi.fn(() => mockXHR);

    const file = new File([''], 'photo.jpg', { type: 'image/jpeg' });
    const result = await uploadFile(file, 'https://api.example.com/upload', null, null, makeMockDoc(1024, 768));

    expect(result).not.toBeNull();
    expect(result.src).toBe('https://cdn.example.com/img.jpg');
    expect(result.width).toBe(1024);
    expect(result.height).toBe(768);
  });

  it('calls onProgress during upload', async () => {
    const mockXHR = makeMockXHR();
    globalThis.XMLHttpRequest = vi.fn(() => mockXHR);

    const progressValues = [];
    const file = new File([''], 'x.jpg', { type: 'image/jpeg' });
    await uploadFile(file, 'https://api.test/upload', (pct) => progressValues.push(pct), null, makeMockDoc());

    expect(progressValues.some((p) => p > 0 && p <= 100)).toBe(true);
  });

  it('returns null for null file', async () => {
    const result = await uploadFile(null, 'https://api.test/upload', null, null, makeMockDoc());
    expect(result).toBeNull();
  });

  it('throws on HTTP error status', async () => {
    const mockXHR = makeMockXHR(500, '');
    globalThis.XMLHttpRequest = vi.fn(() => mockXHR);
    const file = new File([''], 'x.jpg', { type: 'image/jpeg' });
    await expect(uploadFile(file, 'https://api.test/upload', null, null, makeMockDoc()))
      .rejects.toThrow(/HTTP 500/);
  });
});

// ── 9.17 — AbortController ───────────────────────────────────────────────────

describe('9.17 — upload abort', () => {
  let origXHR;

  beforeEach(() => { origXHR = globalThis.XMLHttpRequest; });
  afterEach(() => { globalThis.XMLHttpRequest = origXHR; });

  it('resolves null when signal is already aborted', async () => {
    const ctrl  = new AbortController();
    ctrl.abort();

    // XHR that never completes (simulating slow server)
    const mockXHR = {
      open: vi.fn(), send: vi.fn(), abort: vi.fn(function() {
        setTimeout(() => { const fn = this._listeners['abort']; if (fn) fn({}); }, 0);
      }),
      addEventListener: vi.fn(function(t, fn) { this._listeners[t] = fn; }),
      dispatchEvent: vi.fn(), upload: { addEventListener: vi.fn(), _listeners: {} },
      _listeners: {},
    };
    globalThis.XMLHttpRequest = vi.fn(() => mockXHR);

    const file   = new File([''], 'x.jpg', { type: 'image/jpeg' });
    const result = await uploadFile(file, 'https://api.test/upload', null, ctrl.signal, makeMockDoc());
    expect(result).toBeNull();
  });
});

// ── measureImage timeout (image-H2) ───────────────────────────────────────────
// A doc whose <img> fires NEITHER load nor error. Without the timeout guard,
// readFileAsBase64 would await measureImage forever and the insert would hang.
function makeStalledDoc() {
  return {
    defaultView: globalThis,
    createElement(tag) {
      if (tag === 'img') return { naturalWidth: 0, naturalHeight: 0, set src(_) {}, onload: null, onerror: null };
      return {};
    },
  };
}

describe('measureImage timeout (image-H2)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('resolves with {0,0} when the image never fires load/error', async () => {
    const reader = makeMockFileReader('data:image/png;base64,stall');
    globalThis.FileReader = vi.fn(() => reader);
    const file = new File([''], 'stall.png', { type: 'image/png' });
    const promise = readFileAsBase64(file, makeStalledDoc());
    // Drive the FileReader onload (queued via setTimeout(...,0)) then the 10s guard.
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(10000);
    const result = await promise;
    expect(result).toEqual({ src: 'data:image/png;base64,stall', width: 0, height: 0 });
  });
});

// ── processImageFile routing ──────────────────────────────────────────────────

describe('processImageFile', () => {
  it('returns null for non-image file', async () => {
    const file = new File([''], 'doc.pdf', { type: 'application/pdf' });
    const result = await processImageFile(file, {}, null, null, makeMockDoc());
    expect(result).toBeNull();
  });

  it('returns null for null file', async () => {
    const result = await processImageFile(null, {}, null, null, makeMockDoc());
    expect(result).toBeNull();
  });
});
