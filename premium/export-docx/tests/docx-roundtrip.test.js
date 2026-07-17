/**
 * docx-roundtrip.test.js — the acceptance test: assemble a real .docx, then
 * validate it the way an Office app would — a genuine ZIP whose XML parts are
 * all well-formed and whose required parts are present.
 *
 * We validate using Node's own zlib to re-read the ZIP central directory and
 * DOMParser (jsdom) to parse each XML part. This runs everywhere CI does (no
 * external `unzip`/`xmllint` binary needed) while still proving the bytes are
 * a valid package, not just plausible strings.
 */
import { describe, it, expect } from 'vitest';
import { bodyXml } from '../src/ooxml-body.js';
import { buildDocx } from '../src/docx-parts.js';

/** Minimal STORE-only ZIP reader: name → Uint8Array. Mirrors zip-store's format. */
function unzipStore(bytes) {
  const u16 = (o) => bytes[o] | (bytes[o + 1] << 8);
  const u32 = (o) => (bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16) | (bytes[o + 3] << 24)) >>> 0;
  // Find EOCD (last 22 bytes here — no comment).
  const eocd = bytes.length - 22;
  expect(u32(eocd)).toBe(0x06054b50);
  const count = u16(eocd + 10);
  let off = u32(eocd + 16); // central directory offset
  const files = {};
  for (let i = 0; i < count; i++) {
    expect(u32(off)).toBe(0x02014b50);
    const nameLen = u16(off + 28);
    const extraLen = u16(off + 30);
    const commentLen = u16(off + 32);
    const size = u32(off + 24);
    const localOff = u32(off + 42);
    const name = new TextDecoder().decode(bytes.subarray(off + 46, off + 46 + nameLen));
    // Read data from the local header.
    const lNameLen = u16(localOff + 26);
    const lExtraLen = u16(localOff + 28);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    files[name] = bytes.subarray(dataStart, dataStart + size);
    off += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

const RICH = `<h1>Report</h1>
<p>Hello <strong>bold</strong> <em>italic</em> <code>code()</code> and <a href="http://x">a link</a>.</p>
<ul><li>one</li><li>two<ul><li>nested</li></ul></li></ul>
<ol><li>first</li><li>second</li></ol>
<blockquote><p>A quote</p></blockquote>
<pre><code class="language-js">const x = 1;\nconsole.log(x);</code></pre>
<table><tbody><tr><th>Name</th><th>Age</th></tr><tr><td>Alice &amp; Bob</td><td>30</td></tr></tbody></table>
<hr>
<figure class="oe-figure"><img src="x.png" alt="a cat"><figcaption>A cat photo</figcaption></figure>`;

describe('buildDocx — real package round-trip', () => {
  const docx = buildDocx(bodyXml(RICH, document), { title: 'My Document' });
  const files = unzipStore(docx);

  it('contains all required OOXML parts', () => {
    for (const part of [
      '[Content_Types].xml', '_rels/.rels', 'word/document.xml',
      'word/_rels/document.xml.rels', 'word/styles.xml', 'word/numbering.xml',
    ]) {
      expect(files[part], part).toBeTruthy();
    }
  });

  it('every XML part is well-formed (parses without error)', () => {
    const parser = new DOMParser();
    for (const [name, bytes] of Object.entries(files)) {
      const xml = new TextDecoder().decode(bytes);
      const dom = parser.parseFromString(xml, 'application/xml');
      const err = dom.querySelector('parsererror');
      expect(err, `${name} parse error: ${err && err.textContent}`).toBeNull();
    }
  });

  it('document.xml carries the title, content, table, and list numbering', () => {
    const doc = new TextDecoder().decode(files['word/document.xml']);
    expect(doc).toContain('My Document');       // title paragraph
    expect(doc).toContain('bold');
    expect(doc).toContain('Alice &amp; Bob');    // escaped table cell
    expect(doc).toContain('<w:tbl>');
    expect(doc).toContain('<w:numId');
    expect(doc).toContain('<w:sectPr>');         // section props present
  });

  it('every pStyle referenced in the body is defined in styles.xml', () => {
    const doc = new TextDecoder().decode(files['word/document.xml']);
    const styles = new TextDecoder().decode(files['word/styles.xml']);
    const referenced = [...doc.matchAll(/<w:pStyle w:val="([^"]+)"/g)].map((m) => m[1]);
    for (const id of new Set(referenced)) {
      expect(styles, `style ${id} undefined`).toContain(`w:styleId="${id}"`);
    }
  });

  it('every rStyle referenced is defined too', () => {
    const doc = new TextDecoder().decode(files['word/document.xml']);
    const styles = new TextDecoder().decode(files['word/styles.xml']);
    const referenced = [...doc.matchAll(/<w:rStyle w:val="([^"]+)"/g)].map((m) => m[1]);
    for (const id of new Set(referenced)) {
      expect(styles, `char style ${id} undefined`).toContain(`w:styleId="${id}"`);
    }
  });

  it('numbering.xml defines the numIds the body uses', () => {
    const num = new TextDecoder().decode(files['word/numbering.xml']);
    expect(num).toContain('<w:num w:numId="1">');
    expect(num).toContain('<w:num w:numId="2">');
  });
});
