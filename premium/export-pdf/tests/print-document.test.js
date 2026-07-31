/**
 * print-document.js — the pure builder. No window, no print; just assert the
 * produced document string is correct, complete, safe, and configurable.
 */
import { describe, it, expect } from 'vitest';
import { buildPrintDocument, normalizeOptions, escapeHtml } from '../src/print-document.js';

describe('escapeHtml', () => {
  it('escapes the five markup chars and coerces nullish to empty', () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`))
      .toBe('&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
});

describe('normalizeOptions', () => {
  it('applies sensible defaults', () => {
    const o = normalizeOptions();
    expect(o).toMatchObject({ title: 'Document', pageSize: 'A4', orientation: 'portrait', margin: '20mm', pageNumbers: true });
  });

  it('accepts valid page sizes/orientations, rejects junk to defaults', () => {
    expect(normalizeOptions({ pageSize: 'Letter', orientation: 'landscape' }))
      .toMatchObject({ pageSize: 'Letter', orientation: 'landscape' });
    expect(normalizeOptions({ pageSize: 'Tabloid', orientation: 'sideways' }))
      .toMatchObject({ pageSize: 'A4', orientation: 'portrait' });
  });

  it('rejects a margin containing CSS-breaking chars (defends the @page block)', () => {
    expect(normalizeOptions({ margin: '10mm' }).margin).toBe('10mm');
    expect(normalizeOptions({ margin: '10mm} body{display:none' }).margin).toBe('20mm');
    expect(normalizeOptions({ margin: '  ' }).margin).toBe('20mm');
  });

  it('pageNumbers defaults on, explicit false turns it off', () => {
    expect(normalizeOptions({}).pageNumbers).toBe(true);
    expect(normalizeOptions({ pageNumbers: false }).pageNumbers).toBe(false);
  });
});

describe('buildPrintDocument', () => {
  it('produces a complete, self-contained HTML document', () => {
    const d = buildPrintDocument('<p>Hello</p>', { title: 'My Doc' });
    expect(d).toMatch(/^<!DOCTYPE html>/);
    expect(d).toContain('<title>My Doc</title>');
    expect(d).toContain('<style>');
    expect(d).toContain('@page');
    expect(d).toContain('<main class="oe-pdf__content"><p>Hello</p></main>');
  });

  it('embeds the chosen page setup in @page', () => {
    const d = buildPrintDocument('<p>x</p>', { pageSize: 'Letter', orientation: 'landscape', margin: '15mm' });
    expect(d).toMatch(/@page\s*\{[^}]*size:\s*Letter landscape/);
    expect(d).toMatch(/margin:\s*15mm/);
  });

  it('content HTML is trusted (already sanitized) and passes through verbatim', () => {
    // getHTML() already sanitized this; the builder must NOT double-escape it
    // or the PDF would show literal tags.
    const d = buildPrintDocument('<h1>Title</h1><table><tr><th>A</th></tr></table>');
    expect(d).toContain('<h1>Title</h1>');
    expect(d).toContain('<th>A</th>');
  });

  it('title that lands in HTML markup is HTML-escaped (injection guard)', () => {
    const d = buildPrintDocument('<p>ok</p>', { title: '</title><script>evil()</script>' });
    expect(d).not.toContain('<script>evil()');
    expect(d).toContain('&lt;script&gt;evil()');
  });

  it('escapes a font-family so it cannot break out of the CSS rule', () => {
    const d = buildPrintDocument('<p>x</p>', { fontFamily: 'Foo} body{display:none' });
    expect(d).not.toContain('Foo} body{display:none');
  });

  it('empty content yields a valid document with an empty paragraph', () => {
    const d = buildPrintDocument('', {});
    expect(d).toContain('<main class="oe-pdf__content"><p></p></main>');
  });

  it('I9 — header/footer are position:fixed running bars (repeat on EVERY page in Chrome AND Firefox)', () => {
    const withBars = buildPrintDocument('<p>x</p>', { header: 'Acme', footer: 'Confidential' });
    // Fixed running <div>s, NOT @page margin boxes — Firefox ignores margin
    // boxes, so these guarantee the header/footer appear on every page.
    expect(withBars).toContain('<div class="oe-pdf__running oe-pdf__running--header">Acme</div>');
    expect(withBars).toContain('<div class="oe-pdf__running oe-pdf__running--footer">Confidential</div>');
    expect(withBars).toMatch(/\.oe-pdf__running\s*\{[^}]*position:\s*fixed/);
    // with no header/footer, the running DIVs are absent from the body (the CSS
    // rule may still be defined, but nothing uses it).
    const without = buildPrintDocument('<p>x</p>', { pageNumbers: false });
    expect(without).not.toContain('<div class="oe-pdf__running oe-pdf__running--header">');
    expect(without).not.toContain('<div class="oe-pdf__running oe-pdf__running--footer">');
  });

  it('C3 — page numbers render via counter(page)/counter(pages) in a margin box', () => {
    const d = buildPrintDocument('<p>x</p>', { pageNumbers: true });
    expect(d).toMatch(/@bottom-right\s*\{[^}]*counter\(page\)[^}]*counter\(pages\)/);
    const off = buildPrintDocument('<p>x</p>', { pageNumbers: false });
    expect(off).not.toContain('counter(page)');
  });

  it('a header string is HTML-escaped in its running div (injection guard)', () => {
    const d = buildPrintDocument('<p>x</p>', { header: '<img src=x onerror=hack>' });
    expect(d).not.toContain('<img src=x onerror');
    expect(d).toContain('&lt;img src=x onerror=hack&gt;');
  });

  it('carries the page-break rule so oe-page-break HRs actually break', () => {
    const d = buildPrintDocument('<p>a</p><hr class="oe-page-break"><p>b</p>');
    expect(d).toMatch(/hr\.oe-page-break\s*\{[^}]*break-after:\s*page/);
  });

  // ── Table visual fidelity (fixes the reported "table color not showing"). ──
  describe('table fidelity', () => {
    it('replicates the editor style-preset classes in the print CSS', () => {
      const d = buildPrintDocument('<p>x</p>');
      expect(d).toContain('table.oe-table--bordered');
      expect(d).toContain('table.oe-table--striped');
      expect(d).toContain('table.oe-table--dotted');
      expect(d).toContain('table.oe-table--borderless');
    });

    it('striped rule reads the --oe-table-stripe custom property (with editor fallback)', () => {
      const d = buildPrintDocument('<p>x</p>');
      expect(d).toMatch(/var\(--oe-table-stripe,\s*#f1f5f9\)/);
    });

    it('a striped table with a custom stripe var passes the inline var through', () => {
      const table = '<table class="oe-table oe-table--striped" style="--oe-table-stripe: #eef3fb;">'
        + '<tbody><tr><th>H</th></tr><tr><td>a</td></tr></tbody></table>';
      const d = buildPrintDocument(table);
      // the inline custom property survives verbatim (it's sanitized-safe)
      expect(d).toContain('--oe-table-stripe: #eef3fb;');
      expect(d).toContain('oe-table--striped');
    });

    it('inline cell colors pass through verbatim (they win by specificity in print)', () => {
      const table = '<table class="oe-table"><tbody>'
        + '<tr><th style="background-color: rgb(30,136,229); color: #fff;">Region</th></tr>'
        + '<tr><td style="background-color: rgb(255,249,196);">North</td></tr>'
        + '</tbody></table>';
      const d = buildPrintDocument(table);
      expect(d).toContain('background-color: rgb(30,136,229)');
      expect(d).toContain('background-color: rgb(255,249,196)');
    });

    it('styles caption and keeps col width percentages', () => {
      const d = buildPrintDocument('<p>x</p>');
      expect(d).toMatch(/caption\s*\{[^}]*caption-side:\s*top/);
      const table = '<table class="oe-table"><colgroup><col style="width: 50.0000%;"></colgroup>'
        + '<caption>Cap</caption><tbody><tr><td>a</td></tr></tbody></table>';
      const out = buildPrintDocument(table);
      expect(out).toContain('width: 50.0000%');
      expect(out).toContain('<caption>Cap</caption>');
    });
  });

  describe('image / figure alignment fidelity', () => {
    it('replicates ALL four editor figure-alignment classes in the print CSS', () => {
      const d = buildPrintDocument('<p>x</p>');
      expect(d).toMatch(/figure\.oe-figure--left\s*\{[^}]*float:\s*left/);
      expect(d).toMatch(/figure\.oe-figure--right\s*\{[^}]*float:\s*right/);
      expect(d).toMatch(/figure\.oe-figure--center\s*\{[^}]*margin-left:\s*auto/);
      expect(d).toMatch(/figure\.oe-figure--inline\s*\{[^}]*display:\s*inline-block/);
    });

    it('a right-aligned figure keeps its class + image in the output', () => {
      const fig = '<figure class="oe-figure oe-figure--right"><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="x"></figure>';
      const d = buildPrintDocument(fig);
      expect(d).toContain('oe-figure--right');
      expect(d).toContain('<img');
    });

    it('floated figures clear so following content does not wrap oddly', () => {
      const d = buildPrintDocument('<p>x</p>');
      expect(d).toMatch(/oe-figure--(left|right)::after[^{]*\{[^}]*clear:\s*both/);
    });
  });

  describe('content fidelity (I1/I2/I3)', () => {
    it('I1 — code blocks wrap instead of clipping at the page edge', () => {
      const d = buildPrintDocument('<p>x</p>');
      expect(d).toMatch(/pre[^{]*\{[^}]*white-space:\s*pre-wrap/);
    });

    it('I2 — callout styles key on the EDITOR\'s real data-bq-style values (callout-info/-warning/-success/-danger), never a bare "callout"', () => {
      const d = buildPrintDocument('<p>x</p>');
      // The editor never emits data-bq-style="callout" — only the four variants.
      expect(d).not.toContain('data-bq-style="callout"]');
      expect(d).toContain('blockquote[data-bq-style="callout-info"]');
      expect(d).toContain('blockquote[data-bq-style="callout-warning"]');
      expect(d).toContain('blockquote[data-bq-style="callout-success"]');
      expect(d).toContain('blockquote[data-bq-style="callout-danger"]');
      // card / pull too
      expect(d).toContain('blockquote[data-bq-style="card"]');
      expect(d).toContain('blockquote[data-bq-style="pull"]');
    });

    it('I2 — callout accent colors match the editor tokens exactly', () => {
      const d = buildPrintDocument('<p>x</p>');
      expect(d).toContain('#1e88e5'); // info
      expect(d).toContain('#f5c518'); // warning
      expect(d).toContain('#43a047'); // success
      expect(d).toContain('#e53935'); // danger
    });

    it('I2 — a per-quote custom --bq-accent inline var is honored (border+fill read var())', () => {
      const d = buildPrintDocument('<p>x</p>');
      expect(d).toMatch(/border-left:\s*4px solid var\(--bq-accent\)/);
      expect(d).toMatch(/color-mix\(in srgb, var\(--bq-accent\)/);
    });

    it('I10 — headings match the editor scale/weight (h1/h2 700, h2 1.5em, h3 1.25em) and link color', () => {
      const d = buildPrintDocument('<p>x</p>');
      expect(d).toMatch(/h1\s*\{\s*font-size:\s*2em;\s*font-weight:\s*700/);
      expect(d).toMatch(/h2\s*\{\s*font-size:\s*1\.5em;\s*font-weight:\s*700/);
      expect(d).toMatch(/h3\s*\{\s*font-size:\s*1\.25em;\s*font-weight:\s*600/);
      expect(d).toContain('a { color: #3547b8;'); // editor --oe-link
    });

    it('I3 — to-do lists get a real checkbox glyph reflecting checked state', () => {
      const d = buildPrintDocument('<p>x</p>');
      // unchecked box + checked box glyphs via ::before content
      expect(d).toMatch(/li\[data-todo\]::before\s*\{[^}]*content:\s*"\\2610"/);
      expect(d).toMatch(/data-checked="true"\]::before\s*\{\s*content:\s*"\\2611"/);
      // the CSS-only carrier span is hidden so it adds no stray marks
      expect(d).toContain('.oe-todo-check { display: none;');
    });

    it('I5 — a media embed renders a bordered placeholder with a STATIC label (data-provider is stripped by the sanitizer, so attr() would be blank)', () => {
      const d = buildPrintDocument('<p>x</p>');
      expect(d).toContain('figure.oe-embed');
      // must NOT rely on the stripped attribute — that produced "Embedded  video"
      expect(d).not.toMatch(/content:[^;]*attr\(data-provider\)/);
      expect(d).toMatch(/oe-embed::before\s*\{[^}]*content:\s*"Embedded video"/);
      expect(d).toContain('.oe-embed__shield { display: none;');
      // 16/9 aspect mirrors the editor rather than a fixed height
      expect(d).toMatch(/oe-embed__frame\s*\{[^}]*aspect-ratio:\s*16 \/ 9/);
    });

    it('I7 — bookmark anchors lose their editing chrome but keep text + id', () => {
      const d = buildPrintDocument('<p>x</p>');
      expect(d).toMatch(/a\.oe-bookmark\s*\{[^}]*text-decoration:\s*none/);
    });
  });
});
