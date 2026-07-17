/**
 * links-images.test.js — DOCX hyperlink relationships + image embedding.
 * Covers the resource collector, the body XML, and the assembled package.
 */
import { describe, it, expect } from 'vitest';
import { bodyXml } from '../src/ooxml-body.js';
import { buildDocx } from '../src/docx-parts.js';
import { createResourceCollector, decodeDataUri } from '../src/docx-resources.js';

const md = (html, collector) => bodyXml(html, document, collector);

// A 1x1 transparent PNG data URI (real bytes) for embedding tests.
const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('decodeDataUri', () => {
  it('decodes a base64 png to bytes + ext', () => {
    const d = decodeDataUri(PNG_1PX);
    expect(d.ext).toBe('png');
    expect(d.mime).toBe('image/png');
    expect(d.bytes).toBeInstanceOf(Uint8Array);
    expect(d.bytes[0]).toBe(0x89); // PNG magic
  });
  it('rejects non-image and malformed URIs', () => {
    expect(decodeDataUri('data:text/plain;base64,aGk=')).toBe(null); // not an image
    expect(decodeDataUri('https://x.com/a.png')).toBe(null);
    expect(decodeDataUri('not a uri')).toBe(null);
    expect(decodeDataUri(null)).toBe(null);
  });
});

describe('hyperlinks', () => {
  it('a link with a collector emits <w:hyperlink r:id> + registers an external rel', () => {
    const c = createResourceCollector();
    const xml = md('<p><a href="https://example.com">site</a></p>', c);
    expect(xml).toMatch(/<w:hyperlink r:id="rId\d+">/);
    expect(xml).toContain('<w:rStyle w:val="Hyperlink"/>');
    const res = c.result();
    expect(res.hyperlinks.length).toBe(1);
    expect(res.hyperlinks[0].target).toBe('https://example.com');
  });

  it('mailto/tel/anchor/relative hrefs are accepted as hyperlinks', () => {
    for (const href of ['mailto:a@b.com', 'tel:+123', '#sec', '/page']) {
      const c = createResourceCollector();
      md(`<p><a href="${href}">x</a></p>`, c);
      expect(c.result().hyperlinks[0].target).toBe(href);
    }
  });

  it('WITHOUT a collector, a link degrades to underlined text (back-compat)', () => {
    const xml = md('<p><a href="https://example.com">site</a></p>');
    expect(xml).not.toContain('w:hyperlink');
    expect(xml).toContain('<w:u w:val="single"/>');
    expect(xml).toContain('site');
  });

  it('a javascript: href is NOT turned into a hyperlink (falls back to text)', () => {
    const c = createResourceCollector();
    const xml = md('<p><a href="javascript:alert(1)">x</a></p>', c);
    expect(xml).not.toContain('w:hyperlink');
    expect(c.result().hyperlinks.length).toBe(0);
  });
});

describe('image embedding', () => {
  it('a data: image embeds as a <w:drawing> + registers a media part', () => {
    const c = createResourceCollector();
    const xml = md(`<p><img src="${PNG_1PX}" alt="dot" width="10" height="10"></p>`, c);
    expect(xml).toContain('<w:drawing>');
    expect(xml).toMatch(/<a:blip r:embed="rId\d+"\/>/);
    const res = c.result();
    expect(res.images.length).toBe(1);
    expect(res.images[0].ext).toBe('png');
    expect(res.images[0].bytes[0]).toBe(0x89);
    expect(res.exts).toContain('png');
  });

  it('a REMOTE image → placeholder run, no media part', () => {
    const c = createResourceCollector();
    const xml = md('<p><img src="https://x.com/a.png" alt="remote"></p>', c);
    expect(xml).toContain('[Image: remote]');
    expect(xml).not.toContain('w:drawing');
    expect(c.result().images.length).toBe(0);
  });

  it('a figure with a data: image embeds the drawing + keeps the caption', () => {
    const c = createResourceCollector();
    const xml = md(`<figure class="oe-figure"><img src="${PNG_1PX}" alt="d"><figcaption>Cap</figcaption></figure>`, c);
    expect(xml).toContain('<w:drawing>');
    expect(xml).toContain('<w:pStyle w:val="Caption"/>');
    expect(xml).toContain('Cap');
  });
});

describe('buildDocx assembles link + image parts', () => {
  it('adds hyperlink + image rels and the media part to the package', () => {
    const c = createResourceCollector();
    const body = md(`<p><a href="https://x.com">a</a> <img src="${PNG_1PX}" alt="d"></p>`, c);
    const bytes = buildDocx(body, { title: 'T', resources: c.result() });
    // Decode the ZIP names quickly (STORE method) — look for the media part
    // and the rels/content-type strings in the raw bytes.
    const text = Array.from(bytes).map((n) => String.fromCharCode(n)).join('');
    expect(text).toContain('word/media/image1.png');
    expect(text).toContain('relationships/hyperlink');
    expect(text).toContain('relationships/image');
    expect(text).toContain('image/png'); // content-type Default entry
  });
});
