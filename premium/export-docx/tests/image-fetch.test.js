/**
 * image-fetch.js — resolves remote (http/https) <img> URLs to real bytes via
 * an injected fetch, so bodyXml() can embed them for real instead of always
 * falling back to a text placeholder (the reported bug: images never showed
 * up in the exported .docx because only data: URIs were ever embedded, and
 * real editor images are hosted/remote URLs, not data: URIs).
 */
import { describe, it, expect, vi } from 'vitest';
import { collectRemoteImageSrcs, resolveRemoteImages } from '../src/image-fetch.js';

const root = (html) => { const d = document.createElement('div'); d.innerHTML = html; return d; };

// A tiny fake PNG payload (magic bytes only — enough to exercise the sniffer).
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

function mockFetch(byUrl) {
  return vi.fn((url) => {
    const spec = byUrl[url];
    if (!spec) return Promise.resolve({ ok: false, status: 404 });
    if (spec.reject) return Promise.reject(new Error(spec.reject));
    return Promise.resolve({
      ok: true,
      headers: { get: (h) => (h.toLowerCase() === 'content-type' ? spec.contentType : null) },
      arrayBuffer: () => Promise.resolve((spec.bytes || PNG_BYTES).buffer),
    });
  });
}

describe('collectRemoteImageSrcs', () => {
  it('collects unique http(s) <img src> values in document order', () => {
    const r = root('<img src="https://a.com/1.png"><img src="https://b.com/2.png"><img src="https://a.com/1.png">');
    expect(collectRemoteImageSrcs(r)).toEqual(['https://a.com/1.png', 'https://b.com/2.png']);
  });
  it('ignores data:, relative, and protocol-relative sources', () => {
    const r = root('<img src="data:image/png;base64,AA=="><img src="/local.png"><img src="//cdn.example.com/a.png">');
    expect(collectRemoteImageSrcs(r)).toEqual([]);
  });
  it('ignores <img> with no/empty src', () => {
    const r = root('<img><img src="">');
    expect(collectRemoteImageSrcs(r)).toEqual([]);
  });
});

describe('resolveRemoteImages', () => {
  it('fetches a remote image and returns its bytes + mime/ext from Content-Type', async () => {
    const r = root('<img src="https://x.com/photo.jpg">');
    const fetchImpl = mockFetch({ 'https://x.com/photo.jpg': { contentType: 'image/jpeg' } });
    const map = await resolveRemoteImages(r, fetchImpl);
    const result = map.get('https://x.com/photo.jpg');
    expect(result).toMatchObject({ mime: 'image/jpeg', ext: 'jpg' });
    expect(result.bytes).toBeInstanceOf(Uint8Array);
  });

  it('fetches MULTIPLE images concurrently (all resolved)', async () => {
    const r = root('<img src="https://x.com/a.png"><img src="https://x.com/b.png">');
    const fetchImpl = mockFetch({
      'https://x.com/a.png': { contentType: 'image/png' },
      'https://x.com/b.png': { contentType: 'image/png' },
    });
    const map = await resolveRemoteImages(r, fetchImpl);
    expect(map.get('https://x.com/a.png')).toBeTruthy();
    expect(map.get('https://x.com/b.png')).toBeTruthy();
  });

  it('sniffs the extension from magic bytes when Content-Type is missing/generic', async () => {
    const r = root('<img src="https://x.com/mystery">');
    const fetchImpl = mockFetch({ 'https://x.com/mystery': { contentType: 'application/octet-stream' } });
    const map = await resolveRemoteImages(r, fetchImpl);
    expect(map.get('https://x.com/mystery')).toMatchObject({ mime: 'image/png', ext: 'png' });
  });

  it('a 404 resolves to null (fails soft, does not throw)', async () => {
    const r = root('<img src="https://x.com/missing.png">');
    const fetchImpl = mockFetch({});
    const map = await resolveRemoteImages(r, fetchImpl);
    expect(map.get('https://x.com/missing.png')).toBeNull();
  });

  it('a network/CORS rejection resolves to null (fails soft, does not throw or reject)', async () => {
    const r = root('<img src="https://x.com/blocked.png">');
    const fetchImpl = mockFetch({ 'https://x.com/blocked.png': { reject: 'CORS blocked' } });
    await expect(resolveRemoteImages(r, fetchImpl)).resolves.toBeInstanceOf(Map);
    const map = await resolveRemoteImages(r, fetchImpl);
    expect(map.get('https://x.com/blocked.png')).toBeNull();
  });

  it('an unrecognized content-type AND unsniffable bytes resolves to null', async () => {
    const r = root('<img src="https://x.com/notanimage.txt">');
    const fetchImpl = mockFetch({
      'https://x.com/notanimage.txt': { contentType: 'text/plain', bytes: new Uint8Array([104, 105]) },
    });
    const map = await resolveRemoteImages(r, fetchImpl);
    expect(map.get('https://x.com/notanimage.txt')).toBeNull();
  });

  it('one failing image does not affect other images resolving', async () => {
    const r = root('<img src="https://x.com/good.png"><img src="https://x.com/bad.png">');
    const fetchImpl = mockFetch({ 'https://x.com/good.png': { contentType: 'image/png' } });
    const map = await resolveRemoteImages(r, fetchImpl);
    expect(map.get('https://x.com/good.png')).toBeTruthy();
    expect(map.get('https://x.com/bad.png')).toBeNull();
  });

  it('no remote images and/or no fetch impl → resolves to an empty Map, no throw', async () => {
    const r = root('<p>no images</p>');
    expect((await resolveRemoteImages(r, mockFetch({}))).size).toBe(0);
    expect((await resolveRemoteImages(r, null)).size).toBe(0);
  });

  it('empty arrayBuffer resolves to null', async () => {
    const r = root('<img src="https://x.com/empty.png">');
    const fetchImpl = vi.fn(() => Promise.resolve({
      ok: true, headers: { get: () => 'image/png' }, arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    }));
    const map = await resolveRemoteImages(r, fetchImpl);
    expect(map.get('https://x.com/empty.png')).toBeNull();
  });
});
