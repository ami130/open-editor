/**
 * 19.7 — the FREE BYO-endpoint AI hook (editor.aiComplete). Mocks fetch with a
 * streaming ReadableStream and asserts tokens stream to the caret, the response
 * contract variants parse, and every failure path fails soft (no throw).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenEditor } from '../src/editor.js';

let target, editor;
beforeEach(() => {
  target = document.createElement('div');
  document.body.appendChild(target);
});
afterEach(() => {
  try { editor && editor.destroy(); } catch { /* ignore */ }
  target.remove();
  document.querySelectorAll('.oe-wrapper').forEach((n) => n.remove());
  vi.restoreAllMocks();
});

/** Build a fetch mock whose response body streams the given chunks. */
function mockStreamingFetch(chunks, { ok = true, status = 200 } = {}) {
  const enc = new TextEncoder();
  let i = 0;
  const body = {
    getReader() {
      return {
        read() {
          if (i < chunks.length) return Promise.resolve({ done: false, value: enc.encode(chunks[i++]) });
          return Promise.resolve({ done: true, value: undefined });
        },
      };
    },
  };
  return vi.fn().mockResolvedValue({ ok, status, body, text: () => Promise.resolve(chunks.join('')) });
}

describe('editor.aiComplete — config gating', () => {
  it('no aiEndpoint → no-op, emits aiError:no-endpoint, resolves ""', async () => {
    editor = new OpenEditor(target, {});
    const errs = [];
    editor.on('aiError', (e) => errs.push(e.reason));
    const out = await editor.aiComplete({ prompt: 'hi' });
    expect(out).toBe('');
    expect(errs).toContain('no-endpoint');
  });

  it('empty prompt → resolves "" without calling fetch', async () => {
    editor = new OpenEditor(target, { aiEndpoint: 'https://ai.example/x' });
    const f = vi.spyOn(globalThis, 'fetch');
    const out = await editor.aiComplete({ prompt: '' });
    expect(out).toBe('');
    expect(f).not.toHaveBeenCalled();
  });
});

describe('editor.aiComplete — streaming', () => {
  it('streams SSE data: JSON {delta} tokens and inserts them at the caret', async () => {
    editor = new OpenEditor(target, { aiEndpoint: 'https://ai.example/x' });
    editor.setHTML('<p>Start </p>');
    editor.focus();
    globalThis.fetch = mockStreamingFetch([
      'data: {"delta":"Hello"}\n',
      'data: {"delta":" world"}\n',
      'data: [DONE]\n',
    ]);
    const tokens = [];
    const out = await editor.aiComplete({ prompt: 'greet', onToken: (t) => tokens.push(t) });
    expect(out).toBe('Hello world');
    expect(tokens).toEqual(['Hello', ' world']);
    expect(editor.getHTML()).toContain('Hello world');
  });

  it('parses OpenAI-style choices[].delta.content', async () => {
    editor = new OpenEditor(target, { aiEndpoint: 'https://ai.example/x' });
    globalThis.fetch = mockStreamingFetch([
      'data: {"choices":[{"delta":{"content":"Hi"}}]}\n',
      'data: [DONE]\n',
    ]);
    const out = await editor.aiComplete({ prompt: 'x', insert: false });
    expect(out).toBe('Hi');
  });

  it('accepts raw (non-JSON) SSE text lines', async () => {
    editor = new OpenEditor(target, { aiEndpoint: 'https://ai.example/x' });
    globalThis.fetch = mockStreamingFetch(['data: foo\n', 'data: bar\n']);
    const out = await editor.aiComplete({ prompt: 'x', insert: false });
    expect(out).toBe('foobar');
  });

  it('insert:false does NOT mutate the document', async () => {
    editor = new OpenEditor(target, { aiEndpoint: 'https://ai.example/x' });
    editor.setHTML('<p>keep</p>');
    const before = editor.getHTML();
    globalThis.fetch = mockStreamingFetch(['data: {"delta":"X"}\n', 'data: [DONE]\n']);
    await editor.aiComplete({ prompt: 'x', insert: false });
    expect(editor.getHTML()).toBe(before);
  });

  it('emits aiStart then aiDone with the full text', async () => {
    editor = new OpenEditor(target, { aiEndpoint: 'https://ai.example/x' });
    const events = [];
    editor.on('aiStart', () => events.push('start'));
    editor.on('aiDone', (e) => events.push(`done:${e.text}`));
    globalThis.fetch = mockStreamingFetch(['data: {"delta":"ok"}\n', 'data: [DONE]\n']);
    await editor.aiComplete({ prompt: 'x', insert: false });
    expect(events).toEqual(['start', 'done:ok']);
  });
});

describe('editor.aiComplete — failure paths fail soft', () => {
  it('network error → aiError:network, resolves ""', async () => {
    editor = new OpenEditor(target, { aiEndpoint: 'https://ai.example/x' });
    let reason = null;
    editor.on('aiError', (e) => { reason = e.reason; });
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('down'));
    const out = await editor.aiComplete({ prompt: 'x' });
    expect(out).toBe('');
    expect(reason).toBe('network');
  });

  it('non-ok HTTP → aiError:http with status, resolves ""', async () => {
    editor = new OpenEditor(target, { aiEndpoint: 'https://ai.example/x' });
    let payload = null;
    editor.on('aiError', (e) => { payload = e; });
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503, body: null, text: () => Promise.resolve('') });
    const out = await editor.aiComplete({ prompt: 'x' });
    expect(out).toBe('');
    expect(payload).toMatchObject({ reason: 'http', status: 503 });
  });

  it('non-streaming JSON body { text } is read whole', async () => {
    editor = new OpenEditor(target, { aiEndpoint: 'https://ai.example/x' });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200, body: null,
      text: () => Promise.resolve('{"text":"whole response"}'),
    });
    const out = await editor.aiComplete({ prompt: 'x', insert: false });
    expect(out).toBe('whole response');
  });

  it('sends aiHeaders + prompt in the POST', async () => {
    editor = new OpenEditor(target, { aiEndpoint: 'https://ai.example/x', aiHeaders: { Authorization: 'Bearer k' } });
    const f = mockStreamingFetch(['data: [DONE]\n']);
    globalThis.fetch = f;
    await editor.aiComplete({ prompt: 'the prompt', system: 'sys', insert: false });
    const [, init] = f.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer k');
    const sent = JSON.parse(init.body);
    expect(sent).toMatchObject({ prompt: 'the prompt', system: 'sys', stream: true });
  });
});
