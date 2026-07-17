/**
 * ooxml-body.js — canonical DOM → WordprocessingML body. jsdom parses the
 * HTML; we assert the emitted <w:p>/<w:r>/<w:tbl> XML.
 */
import { describe, it, expect } from 'vitest';
import { bodyXml, escapeXml } from '../src/ooxml-body.js';

const md = (html) => bodyXml(html, document);

describe('escapeXml', () => {
  it('escapes the five XML entities and coerces nullish', () => {
    expect(escapeXml(`<a b="c" d='e'>&`)).toBe('&lt;a b=&quot;c&quot; d=&apos;e&apos;&gt;&amp;');
    expect(escapeXml(null)).toBe('');
  });
});

describe('bodyXml — blocks', () => {
  it('paragraph → a <w:p> with a run', () => {
    expect(md('<p>Hello</p>')).toBe('<w:p><w:r><w:t xml:space="preserve">Hello</w:t></w:r></w:p>');
  });

  it('headings map to Heading{n} pStyle', () => {
    expect(md('<h1>T</h1>')).toContain('<w:pStyle w:val="Heading1"/>');
    expect(md('<h3>T</h3>')).toContain('<w:pStyle w:val="Heading3"/>');
  });

  it('empty document yields at least one paragraph (Word requires it)', () => {
    expect(md('')).toBe('<w:p/>');
  });

  it('hr becomes a bottom-bordered paragraph', () => {
    expect(md('<hr>')).toContain('<w:pBdr><w:bottom');
  });
});

describe('bodyXml — inline formatting', () => {
  it('bold/italic/underline/strike/code produce the right run props', () => {
    expect(md('<p><strong>b</strong></p>')).toContain('<w:rPr><w:b/></w:rPr>');
    expect(md('<p><em>i</em></p>')).toContain('<w:rPr><w:i/></w:rPr>');
    expect(md('<p><u>u</u></p>')).toContain('<w:u w:val="single"/>');
    expect(md('<p><s>s</s></p>')).toContain('<w:strike/>');
    expect(md('<p><code>c</code></p>')).toContain('<w:rStyle w:val="Code"/>');
  });

  it('nested marks combine (bold+italic in one run)', () => {
    const xml = md('<p><strong><em>x</em></strong></p>');
    expect(xml).toContain('<w:b/>');
    expect(xml).toContain('<w:i/>');
  });

  it('legacy b/i/del normalize like strong/em/s', () => {
    expect(md('<p><b>x</b></p>')).toContain('<w:b/>');
    expect(md('<p><del>x</del></p>')).toContain('<w:strike/>');
  });

  it('br emits a run break', () => {
    expect(md('<p>a<br>b</p>')).toContain('<w:br/>');
  });

  it('links emit underlined text (no lost content in v1)', () => {
    const xml = md('<p><a href="http://x">link</a></p>');
    expect(xml).toContain('link');
    expect(xml).toContain('<w:u w:val="single"/>');
  });

  it('text is XML-escaped inside runs', () => {
    expect(md('<p>a &amp; b &lt; c</p>')).toContain('a &amp; b &lt; c');
  });

  it('xml:space=preserve keeps leading/trailing spaces', () => {
    expect(md('<p> x </p>')).toContain('xml:space="preserve"');
  });
});

describe('bodyXml — lists', () => {
  it('ul items carry numPr with the bullet numId (1)', () => {
    const xml = md('<ul><li>one</li><li>two</li></ul>');
    expect(xml).toContain('<w:numId w:val="1"/>');
    expect((xml.match(/<w:p>/g) || []).length).toBe(2);
  });

  it('ol items use the decimal numId (2)', () => {
    expect(md('<ol><li>a</li></ol>')).toContain('<w:numId w:val="2"/>');
  });

  it('nested list increments ilvl', () => {
    const xml = md('<ul><li>a<ul><li>b</li></ul></li></ul>');
    expect(xml).toContain('<w:ilvl w:val="0"/>');
    expect(xml).toContain('<w:ilvl w:val="1"/>');
  });
});

describe('bodyXml — blockquote / pre / table / figure', () => {
  it('blockquote children get the Quote style', () => {
    expect(md('<blockquote><p>q</p></blockquote>')).toContain('<w:pStyle w:val="Quote"/>');
  });

  it('code block → one CodeBlock paragraph per source line', () => {
    const xml = md('<pre><code>line1\nline2</code></pre>');
    expect((xml.match(/<w:pStyle w:val="CodeBlock"\/>/g) || []).length).toBe(2);
  });

  it('table → w:tbl with a row per tr and th cells styled TableHeader', () => {
    const xml = md('<table><tbody><tr><th>H</th></tr><tr><td>D</td></tr></tbody></table>');
    expect(xml).toContain('<w:tbl>');
    expect((xml.match(/<w:tr>/g) || []).length).toBe(2);
    expect(xml).toContain('<w:pStyle w:val="TableHeader"/>');
  });

  it('figure: a REMOTE image becomes an alt placeholder + a separate caption paragraph', () => {
    // Without a collector, a remote <img> can't be embedded → placeholder from
    // alt; the <figcaption> renders as its own Caption paragraph. Nothing lost.
    const xml = md('<figure class="oe-figure"><img src="x" alt="cat"><figcaption>A cat</figcaption></figure>');
    expect(xml).toContain('[Image: cat]');           // alt-based placeholder
    expect(xml).toContain('<w:pStyle w:val="Caption"/>');
    expect(xml).toContain('A cat');                   // caption preserved separately
  });
});
