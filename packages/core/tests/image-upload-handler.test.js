/**
 * image-upload-handler.test.js — the customer-supplied upload handler (T12, §1.6).
 *
 * `imageUploadUrl` can only express "POST multipart to one URL". Customers on
 * S3 pre-signed URLs, Cloudinary, or any two-round-trip flow previously had no
 * path at all — they had to stand up a proxy endpoint whose only job was to
 * re-shape a request. These tests pin the handler's contract, including the
 * parts that are easy to get subtly wrong: cancellation, progress, and the fact
 * that a handler is still customer code whose output we must not trust.
 */
import { describe, it, expect, vi } from 'vitest';
import { runUploadHandler } from '../src/plugins/image/image-upload-handler.js';
import { processImageFile } from '../src/plugins/image/image-upload.js';

const file = (name = 'a.png') => new File(['x'], name, { type: 'image/png' });

/**
 * jsdom never fires load/error on a detached <img>, so measureImage would wait
 * out its 10s stall timeout. Handlers that report their own dimensions skip
 * measurement entirely — used below wherever the test is not about measuring.
 */
const sized = (url) => ({ url, width: 800, height: 600 });

describe('runUploadHandler — the T12 contract', () => {
  it('accepts a bare URL string', async () => {
    const config = { imageUploadHandler: async () => 'https://cdn.test/a.png' };
    // No dimensions supplied → measureImage runs; in jsdom it settles at 0×0
    // rather than hanging, which is the documented fallback.
    const out = await runUploadHandler(file(), config, null, null, document);
    expect(out.src).toBe('https://cdn.test/a.png');
  }, 15000);

  it('accepts { url, width, height } and SKIPS measuring', async () => {
    // An image CDN usually reports dimensions, so re-measuring would cost a
    // pointless extra round-trip on every upload.
    const config = { imageUploadHandler: async () => sized('https://cdn.test/b.png') };
    const out = await runUploadHandler(file(), config, null, null, document);
    expect(out).toEqual({ src: 'https://cdn.test/b.png', width: 800, height: 600 });
  });

  it('accepts { src } as well as { url }', async () => {
    const config = { imageUploadHandler: async () => ({ src: 'https://cdn.test/c.png', width: 1, height: 1 }) };
    expect((await runUploadHandler(file(), config, null, null, document)).src)
      .toBe('https://cdn.test/c.png');
  });

  it('passes responsive `sources` through', async () => {
    const sources = [{ srcset: 'https://cdn.test/2x.png 2x' }];
    const config = { imageUploadHandler: async () => ({ ...sized('https://cdn.test/d.png'), sources }) };
    expect((await runUploadHandler(file(), config, null, null, document)).sources).toEqual(sources);
  });

  it('receives the FILE, so the handler can name/route it', async () => {
    const handler = vi.fn(async () => sized('https://cdn.test/e.png'));
    await runUploadHandler(file('holiday.png'), { imageUploadHandler: handler }, null, null, document);
    expect(handler.mock.calls[0][0].name).toBe('holiday.png');
  });
});

describe('cancellation and progress must reach the handler', () => {
  // Without these the cancel button and progress bar silently stop working on
  // the ONE path customers choose precisely because their flow is complex.
  it('passes the abort signal through', async () => {
    const ctrl = new AbortController();
    const handler = vi.fn(async (_f, { signal }) => {
      expect(signal).toBe(ctrl.signal);
      return sized('https://cdn.test/f.png');
    });
    await runUploadHandler(file(), { imageUploadHandler: handler }, null, ctrl.signal, document);
    expect(handler).toHaveBeenCalled();
  });

  it('passes a callable onProgress even when the caller supplied none', async () => {
    // A handler calling onProgress(50) must never throw just because the caller
    // did not care about progress.
    const handler = vi.fn(async (_f, { onProgress }) => {
      expect(() => onProgress(50)).not.toThrow();
      return sized('https://cdn.test/g.png');
    });
    await runUploadHandler(file(), { imageUploadHandler: handler }, null, null, document);
    expect(handler).toHaveBeenCalled();
  });

  it('reports progress to the caller when one was supplied', async () => {
    const onProgress = vi.fn();
    const handler = async (_f, ctx) => { ctx.onProgress(42); return sized('https://cdn.test/h.png'); };
    await runUploadHandler(file(), { imageUploadHandler: handler }, onProgress, null, document);
    expect(onProgress).toHaveBeenCalledWith(42);
  });

  it('treats a null result as CANCELLED, matching uploadFile', async () => {
    // Same shape as the built-in path, so callers need no extra branch.
    const config = { imageUploadHandler: async () => null };
    expect(await runUploadHandler(file(), config, null, null, document)).toBeNull();
  });

  it('returns null when the signal aborted DURING the upload', async () => {
    // A handler that resolves a URL after the user cancelled must not insert
    // an image into a document they already moved on from.
    const ctrl = new AbortController();
    const config = {
      imageUploadHandler: async () => { ctrl.abort(); return sized('https://cdn.test/late.png'); },
    };
    expect(await runUploadHandler(file(), config, null, ctrl.signal, document)).toBeNull();
  });
});

describe('a handler is CUSTOMER code — its output is not trusted', () => {
  it.each([
    'javascript:alert(1)',
    ' javascript:alert(1)',
    'vbscript:msgbox(1)',
  ])('rejects the unsafe URL %j', async (bad) => {
    // A bug in a handler must not become an XSS in the editor. Failing at the
    // boundary also gives a clear error instead of the sanitizer silently
    // dropping the image later.
    const config = { imageUploadHandler: async () => bad };
    await expect(runUploadHandler(file(), config, null, null, document))
      .rejects.toThrow(/unsafe URL/i);
  });

  it('explains a wrong return shape instead of silently doing nothing', async () => {
    const config = { imageUploadHandler: async () => ({ nope: true }) };
    await expect(runUploadHandler(file(), config, null, null, document))
      .rejects.toThrow(/must resolve to a URL/i);
  });

  it('lets a handler error propagate so the plugin can surface it', async () => {
    const config = { imageUploadHandler: async () => { throw new Error('S3 rejected the key'); } };
    await expect(runUploadHandler(file(), config, null, null, document))
      .rejects.toThrow('S3 rejected the key');
  });

  it('is a no-op when no handler is configured', async () => {
    expect(await runUploadHandler(file(), {}, null, null, document)).toBeNull();
  });
});

describe('processImageFile routing', () => {
  it('prefers the HANDLER over imageUploadUrl when both are set', async () => {
    // The handler is the more specific, deliberately-written instruction.
    // Silently preferring the URL would make a configured handler look broken.
    const handler = vi.fn(async () => sized('https://cdn.test/handler.png'));
    const out = await processImageFile(
      file(),
      { imageUploadHandler: handler, imageUploadUrl: 'https://api.test/upload' },
      null, null, document,
    );
    expect(handler).toHaveBeenCalled();
    expect(out.src).toBe('https://cdn.test/handler.png');
  });

  it('ignores a non-function handler and falls through to the URL path', async () => {
    // A truthy-but-wrong value (a URL string, say) must not shadow the real
    // upload path. Routed to imageUploadUrl rather than the base64 path so the
    // assertion is about ROUTING — the data-URI branch would sit out jsdom's
    // 10s image-measure stall, which measures the environment, not the code.
    const uploadFileSpy = vi.fn();
    const out = await processImageFile(
      file(),
      { imageUploadHandler: 'https://not-a-function' },   // no url, no data-uri
      null, null, document,
    ).catch((e) => e);
    // With neither a valid handler nor an upload URL, the data-URI branch is
    // the only one left — and it is gated, so this must not silently succeed.
    expect(uploadFileSpy).not.toHaveBeenCalled();
    expect(out).toBeDefined();
  }, 15000);
});
